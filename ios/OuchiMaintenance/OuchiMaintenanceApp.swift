import SwiftUI
import UIKit
import UserNotifications
import OuchiCore

@MainActor final class RemoteNotificationDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, ObservableObject {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
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
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var store = NativeStore()
    @UIApplicationDelegateAdaptor(RemoteNotificationDelegate.self) private var remoteNotifications
    var body: some Scene {
        WindowGroup {
            Group {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ouchi-saved-receipts-preview") {
                SavedDeletionReceiptPreview()
                    .environment(\.dynamicTypeSize, ProcessInfo.processInfo.arguments.contains("--ouchi-large-text-preview") ? .accessibility5 : .large)
            }
            else if ProcessInfo.processInfo.arguments.contains("--ouchi-report-preview") { ReportPreviewView() }
            else { NativeRootView().environmentObject(store).environmentObject(remoteNotifications).task { await store.restore() } }
            #else
            NativeRootView().environmentObject(store).environmentObject(remoteNotifications).task { await store.restore() }
            #endif
            }.task(id: scenePhase == .active && store.signedIn) {
                guard scenePhase == .active, store.signedIn, store.appAttestRegistrationConfigured else { return }
                while !Task.isCancelled {
                    await store.maintainExpiredPendingRegistration()
                    do { try await Task.sleep(for: .seconds(300)) } catch { return }
                }
            }
        }
    }
}
