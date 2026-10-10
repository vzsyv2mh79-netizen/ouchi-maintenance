import SwiftUI
import UIKit
import UserNotifications
import OuchiCore

@MainActor final class RemoteNotificationDelegate: NSObject, UIApplicationDelegate, ObservableObject {
    private var active: UUID?
    private var pending: CheckedContinuation<Data, Error>?
    private var timeout: Task<Void, Never>?
    func requestToken() async throws -> Data {
        guard active == nil else { throw CloudError.unavailable }
        let operation = UUID(); active = operation
        defer { if active == operation { active = nil } }
        let allowed = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
        try Task.checkCancellation()
        guard allowed else { throw CloudError.rejected(403) }
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                pending = continuation
                timeout = Task { [weak self] in
                    do { try await Task.sleep(for: .seconds(30)) } catch { return }
                    self?.finish(.failure(CloudError.unavailable), operation: operation)
                }
                UIApplication.shared.registerForRemoteNotifications()
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.finish(.failure(CancellationError()), operation: operation) }
        }
    }
    private func finish(_ result: Result<Data, Error>, operation: UUID) {
        guard active == operation, let continuation = pending else { return }
        pending = nil; timeout?.cancel(); timeout = nil
        continuation.resume(with: result)
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard let active else { return }
        finish(.success(deviceToken), operation: active)
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        guard let active else { return }
        finish(.failure(CloudError.unavailable), operation: active)
    }
}

@main struct OuchiMaintenanceApp: App {
    @StateObject private var store = NativeStore()
    @UIApplicationDelegateAdaptor(RemoteNotificationDelegate.self) private var remoteNotifications
    var body: some Scene {
        WindowGroup { NativeRootView().environmentObject(store).environmentObject(remoteNotifications).task { await store.restore() } }
    }
}
