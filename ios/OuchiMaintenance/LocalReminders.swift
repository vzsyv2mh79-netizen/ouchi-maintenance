import Foundation
import UserNotifications
import OuchiCore

// A missing OS callback is an error, never evidence that notifications are absent.
private final class NotificationQueryReply<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Value, Error>?
    init(_ continuation: CheckedContinuation<Value, Error>) { self.continuation = continuation }
    func finish(_ result: Result<Value, Error>) {
        lock.lock()
        let waiting = continuation; continuation = nil
        lock.unlock()
        waiting?.resume(with: result)
    }
}
@MainActor func boundedNotificationQuery<Value: Sendable>(
    timeout: TimeInterval = 10,
    start: (@escaping @Sendable (Value) -> Void) -> Void
) async throws -> Value {
    try Task.checkCancellation()
    let value: Value = try await withCheckedThrowingContinuation { continuation in
        let reply = NotificationQueryReply(continuation)
        DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
            reply.finish(.failure(CloudError.unavailable))
        }
        start { reply.finish(.success($0)) }
    }
    try Task.checkCancellation()
    return value
}

@MainActor protocol LocalNotificationBackend {
    func pendingIDs() async throws -> [String]
    func deliveredIDs() async throws -> [String]
    func notificationAuthorized() async throws -> Bool
    func requestAuthorization() async throws -> Bool
    func addNotification(_ request: UNNotificationRequest) async throws
    func removePending(_ identifiers: [String])
    func removeDelivered(_ identifiers: [String])
}
@MainActor protocol LocalReminderPreferences: AnyObject { var account: UUID? { get set } }
@MainActor private final class SystemLocalReminderPreferences: LocalReminderPreferences {
    private let preference = "ouchi.localReminder.account"
    var account: UUID? {
        get { UserDefaults.standard.string(forKey: preference).flatMap(UUID.init(uuidString:)) }
        set {
            if let newValue { UserDefaults.standard.set(newValue.uuidString, forKey: preference) }
            else { UserDefaults.standard.removeObject(forKey: preference) }
        }
    }
}
@MainActor private final class SystemLocalNotificationBackend: LocalNotificationBackend {
    private let center = UNUserNotificationCenter.current()
    // Older SDK notification objects are not Sendable. Map inside the callback;
    // only immutable identifiers/Bool cross back to the main actor.
    func pendingIDs() async throws -> [String] {
        try await boundedNotificationQuery { reply in
            center.getPendingNotificationRequests { requests in
                reply(requests.map(\.identifier))
            }
        }
    }
    func deliveredIDs() async throws -> [String] {
        try await boundedNotificationQuery { reply in
            center.getDeliveredNotifications { notifications in
                reply(notifications.map { $0.request.identifier })
            }
        }
    }
    func notificationAuthorized() async throws -> Bool {
        try await boundedNotificationQuery { reply in
            center.getNotificationSettings { settings in
                reply(settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional)
            }
        }
    }
    func requestAuthorization() async throws -> Bool {
        try await withCheckedThrowingContinuation { continuation in
            center.requestAuthorization(options: [.alert, .sound]) { granted, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: granted) }
            }
        }
    }
    func addNotification(_ request: UNNotificationRequest) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            center.add(request) { error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume() }
            }
        }
    }
    func removePending(_ identifiers: [String]) { center.removePendingNotificationRequests(withIdentifiers: identifiers) }
    func removeDelivered(_ identifiers: [String]) { center.removeDeliveredNotifications(withIdentifiers: identifiers) }
}

@MainActor final class LocalReminders {
    private let backend: any LocalNotificationBackend
    private let preferences: any LocalReminderPreferences
    private let now: @MainActor () -> Date
    init(backend: (any LocalNotificationBackend)? = nil,
         preferences: (any LocalReminderPreferences)? = nil,
         now: @escaping @MainActor () -> Date = { Date() }) {
        self.backend = backend ?? SystemLocalNotificationBackend()
        self.preferences = preferences ?? SystemLocalReminderPreferences()
        self.now = now
    }
    private var generation = 0
    private var activeIDs: [String] = []
    func enabled(account: UUID) -> Bool {
        preferences.account == account
    }
    /// Only call after the server has durably accepted the user's deletion.
    /// Confirmation covers this device's app-owned local notifications, not APNs.
    func eraseForAccountDeletion(account: UUID, stillBound: @MainActor () -> Bool) async -> Bool {
        guard stillBound(), !Task.isCancelled else { return false }
        generation += 1
        let expected = generation
        let preferenceAccount = preferences.account
        guard let pending = try? await backend.pendingIDs() else { return false }
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        guard let delivered = try? await backend.deliveredIDs() else { return false }
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let pendingPlan = ReminderCleanupPlan(identifiers: pending, account: account)
        let deliveredPlan = ReminderCleanupPlan(identifiers: delivered, account: account)
        backend.removePending(pendingPlan.identifiers)
        backend.removeDelivered(deliveredPlan.identifiers)
        activeIDs.removeAll { pendingPlan.identifiers.contains($0) }
        guard let remainingPending = try? await backend.pendingIDs() else { return false }
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        guard let remainingDelivered = try? await backend.deliveredIDs() else { return false }
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let pendingCheck = ReminderCleanupPlan(identifiers: remainingPending, account: account)
        let deliveredCheck = ReminderCleanupPlan(identifiers: remainingDelivered, account: account)
        guard pendingCheck.identifiers.isEmpty, deliveredCheck.identifiers.isEmpty,
              !pendingCheck.ambiguousLegacy, !deliveredCheck.ambiguousLegacy else { return false }
        if preferenceAccount == account, preferences.account == account { preferences.account = nil }
        return true
    }
    /// Explicit local opt-out for remote delivery setup. Only pending requests
    /// owned by this account are removed; delivered and other-account notices remain.
    func stopPendingForRemoteDelivery(account: UUID, stillBound: @MainActor () -> Bool) async -> Bool {
        guard stillBound(), !Task.isCancelled else { return false }
        generation += 1
        let expected = generation
        guard let pending = try? await backend.pendingIDs() else { return false }
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let plan = ReminderCleanupPlan(identifiers: pending, account: account)
        guard !plan.ambiguousLegacy else { return false }
        backend.removePending(plan.identifiers)
        activeIDs.removeAll { plan.identifiers.contains($0) }
        guard let remaining = try? await backend.pendingIDs() else { return false }
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let check = ReminderCleanupPlan(identifiers: remaining, account: account)
        guard check.identifiers.isEmpty, !check.ambiguousLegacy else { return false }
        if preferences.account == account { preferences.account = nil }
        return true
    }
    @discardableResult func reset(clearPreference: Bool) async -> Bool {
        generation += 1
        let expected = generation
        if clearPreference { preferences.account = nil }
        guard let requests = try? await backend.pendingIDs() else { return false }
        guard expected == generation else { return false }
        backend.removePending(requests.filter { $0.hasPrefix("ouchi.local.") })
        guard let delivered = try? await backend.deliveredIDs() else { return false }
        guard expected == generation else { return false }
        backend.removeDelivered(delivered.filter { $0.hasPrefix("ouchi.local.") })
        activeIDs = []
        return true
    }
    func enable(data: Household, account: UUID, schedule: ReminderSchedule = .free,
                premiumValidUntil: Date? = nil) async throws -> Bool {
        if schedule != .free {
            guard let premiumValidUntil, premiumValidUntil.timeIntervalSince1970.isFinite else { throw CloudError.invalidInput }
        }
        let expected = generation
        let granted = try await backend.requestAuthorization()
        guard granted, expected == generation, !Task.isCancelled else { return false }
        preferences.account = account
        return try await reconcile(data: data, account: account, schedule: schedule, premiumValidUntil: premiumValidUntil)
    }
    /// Custom options require the caller's fresh server-verified expiry. The
    /// release caller continues using the free defaults until that flow is ready.
    func reconcile(data: Household, account: UUID, schedule: ReminderSchedule = .free,
                   premiumValidUntil: Date? = nil) async throws -> Bool {
        guard preferences.account == account else { return false }
        let expected = generation
        let authorized = try await backend.notificationAuthorized()
        guard expected == generation, preferences.account == account, !Task.isCancelled else { return false }
        guard authorized else {
            await reset(clearPreference: true); return false
        }
        let plan: [DailyReminder]
        if schedule != .free {
            guard let premiumValidUntil else { throw CloudError.invalidInput }
            plan = try ReminderPlan.make(data, now: now(), premiumSchedule: schedule, premiumValidUntil: premiumValidUntil)
        } else { plan = try ReminderPlan.make(data, now: now()) }
        // In-memory identifiers disappear on process restart. Read the actual
        // account-scoped requests so a refresh cannot leave duplicate schedules.
        let pending = try await backend.pendingIDs()
        guard expected == generation, preferences.account == account, !Task.isCancelled else { return false }
        let previous = ReminderCleanupPlan(identifiers: pending, account: account)
        guard !previous.ambiguousLegacy else { throw CloudError.invalidInput }
        generation += 1
        let current = generation
        backend.removePending(previous.identifiers)
        activeIDs = []
        let prefix = "ouchi.local." + account.uuidString.lowercased() + "." + UUID().uuidString + "."
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        var added: [String] = []
        do {
            for (index, reminder) in plan.enumerated() {
                guard current == generation, preferences.account == account, !Task.isCancelled else { backend.removePending(added); return false }
                let id = prefix + String(index)
                let content = UNMutableNotificationContent()
                content.title = "おうちメンテ"
                content.body = "保存したお手入れの予定が\(reminder.count)件あります。アプリで最新の予定を確認してください。"
                content.sound = .default
                var components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: reminder.date)
                components.calendar = calendar; components.timeZone = calendar.timeZone
                try await backend.addNotification(UNNotificationRequest(identifier: id, content: content,
                    trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)))
                added.append(id)
                guard current == generation, preferences.account == account, !Task.isCancelled else { backend.removePending(added); return false }
            }
            activeIDs = added
            return true
        } catch { backend.removePending(added); throw error }
    }
}
