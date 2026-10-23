import Foundation
import UserNotifications
import OuchiCore

@MainActor protocol LocalNotificationBackend {
    func pendingIDs() async -> [String]
    func deliveredIDs() async -> [String]
    func notificationAuthorized() async -> Bool
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
    func pendingIDs() async -> [String] {
        await withCheckedContinuation { continuation in
            center.getPendingNotificationRequests { requests in
                continuation.resume(returning: requests.map(\.identifier))
            }
        }
    }
    func deliveredIDs() async -> [String] {
        await withCheckedContinuation { continuation in
            center.getDeliveredNotifications { notifications in
                continuation.resume(returning: notifications.map { $0.request.identifier })
            }
        }
    }
    func notificationAuthorized() async -> Bool {
        await withCheckedContinuation { continuation in
            center.getNotificationSettings { settings in
                continuation.resume(returning: settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional)
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
        let pending = await backend.pendingIDs()
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let delivered = await backend.deliveredIDs()
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let pendingPlan = ReminderCleanupPlan(identifiers: pending, account: account)
        let deliveredPlan = ReminderCleanupPlan(identifiers: delivered, account: account)
        backend.removePending(pendingPlan.identifiers)
        backend.removeDelivered(deliveredPlan.identifiers)
        activeIDs.removeAll { pendingPlan.identifiers.contains($0) }
        let remainingPending = await backend.pendingIDs()
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let remainingDelivered = await backend.deliveredIDs()
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
        let pending = await backend.pendingIDs()
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let plan = ReminderCleanupPlan(identifiers: pending, account: account)
        guard !plan.ambiguousLegacy else { return false }
        backend.removePending(plan.identifiers)
        activeIDs.removeAll { plan.identifiers.contains($0) }
        let remaining = await backend.pendingIDs()
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let check = ReminderCleanupPlan(identifiers: remaining, account: account)
        guard check.identifiers.isEmpty, !check.ambiguousLegacy else { return false }
        if preferences.account == account { preferences.account = nil }
        return true
    }
    func reset(clearPreference: Bool) async {
        generation += 1
        let expected = generation
        if clearPreference { preferences.account = nil }
        let requests = await backend.pendingIDs()
        guard expected == generation else { return }
        backend.removePending(requests.filter { $0.hasPrefix("ouchi.local.") })
        let delivered = await backend.deliveredIDs()
        guard expected == generation else { return }
        backend.removeDelivered(delivered.filter { $0.hasPrefix("ouchi.local.") })
        activeIDs = []
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
        let authorized = await backend.notificationAuthorized()
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
        let pending = await backend.pendingIDs()
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
