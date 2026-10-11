import Foundation
import UserNotifications
import OuchiCore

@MainActor final class LocalReminders {
    private let center = UNUserNotificationCenter.current()
    private let preference = "ouchi.localReminder.account"
    private var generation = 0
    private var activeIDs: [String] = []
    func enabled(account: UUID) -> Bool {
        UserDefaults.standard.string(forKey: preference) == account.uuidString
    }
    /// Only call after the server has durably accepted the user's deletion.
    /// Confirmation covers this device's app-owned local notifications, not APNs.
    func eraseForAccountDeletion(account: UUID, stillBound: @MainActor () -> Bool) async -> Bool {
        guard stillBound(), !Task.isCancelled else { return false }
        generation += 1
        let expected = generation
        let preferenceAccount = UserDefaults.standard.string(forKey: preference).flatMap(UUID.init(uuidString:))
        let pending = await pendingIDs()
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let delivered = await deliveredIDs()
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let pendingPlan = ReminderCleanupPlan(identifiers: pending, account: account)
        let deliveredPlan = ReminderCleanupPlan(identifiers: delivered, account: account)
        center.removePendingNotificationRequests(withIdentifiers: pendingPlan.identifiers)
        center.removeDeliveredNotifications(withIdentifiers: deliveredPlan.identifiers)
        activeIDs.removeAll { pendingPlan.identifiers.contains($0) }
        let remainingPending = await pendingIDs()
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let remainingDelivered = await deliveredIDs()
        guard generation == expected, stillBound(), !Task.isCancelled else { return false }
        let pendingCheck = ReminderCleanupPlan(identifiers: remainingPending, account: account)
        let deliveredCheck = ReminderCleanupPlan(identifiers: remainingDelivered, account: account)
        guard pendingCheck.identifiers.isEmpty, deliveredCheck.identifiers.isEmpty,
              !pendingCheck.ambiguousLegacy, !deliveredCheck.ambiguousLegacy else { return false }
        if preferenceAccount == account { UserDefaults.standard.removeObject(forKey: preference) }
        return true
    }
    func reset(clearPreference: Bool) async {
        generation += 1
        let expected = generation
        if clearPreference { UserDefaults.standard.removeObject(forKey: preference) }
        let requests = await pendingIDs()
        guard expected == generation else { return }
        center.removePendingNotificationRequests(withIdentifiers: requests.filter { $0.hasPrefix("ouchi.local.") })
        let delivered = await deliveredIDs()
        guard expected == generation else { return }
        center.removeDeliveredNotifications(withIdentifiers: delivered.filter { $0.hasPrefix("ouchi.local.") })
        activeIDs = []
    }
    // Older SDK notification objects are not Sendable. Map inside the callback;
    // only immutable identifiers/Bool cross back to the main actor.
    private func pendingIDs() async -> [String] {
        await withCheckedContinuation { continuation in
            center.getPendingNotificationRequests { requests in
                continuation.resume(returning: requests.map(\.identifier))
            }
        }
    }
    private func deliveredIDs() async -> [String] {
        await withCheckedContinuation { continuation in
            center.getDeliveredNotifications { notifications in
                continuation.resume(returning: notifications.map { $0.request.identifier })
            }
        }
    }
    private func notificationAuthorized() async -> Bool {
        await withCheckedContinuation { continuation in
            center.getNotificationSettings { settings in
                continuation.resume(returning: settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional)
            }
        }
    }
    private func requestAuthorization() async throws -> Bool {
        try await withCheckedThrowingContinuation { continuation in
            center.requestAuthorization(options: [.alert, .sound]) { granted, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: granted) }
            }
        }
    }
    private func addNotification(_ request: UNNotificationRequest) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            center.add(request) { error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume() }
            }
        }
    }
    func enable(data: Household, account: UUID, schedule: ReminderSchedule = .free,
                premiumValidUntil: Date? = nil) async throws -> Bool {
        if schedule != .free {
            guard let premiumValidUntil, premiumValidUntil.timeIntervalSince1970.isFinite else { throw CloudError.invalidInput }
        }
        let expected = generation
        let granted = try await requestAuthorization()
        guard granted, expected == generation, !Task.isCancelled else { return false }
        UserDefaults.standard.set(account.uuidString, forKey: preference)
        return try await reconcile(data: data, account: account, schedule: schedule, premiumValidUntil: premiumValidUntil)
    }
    /// Custom options require the caller's fresh server-verified expiry. The
    /// release caller continues using the free defaults until that flow is ready.
    func reconcile(data: Household, account: UUID, schedule: ReminderSchedule = .free,
                   premiumValidUntil: Date? = nil) async throws -> Bool {
        guard UserDefaults.standard.string(forKey: preference) == account.uuidString else { return false }
        let expected = generation
        let authorized = await notificationAuthorized()
        guard expected == generation, !Task.isCancelled else { return false }
        guard authorized else {
            await reset(clearPreference: true); return false
        }
        let plan: [DailyReminder]
        if schedule != .free {
            guard let premiumValidUntil else { throw CloudError.invalidInput }
            plan = try ReminderPlan.make(data, premiumSchedule: schedule, premiumValidUntil: premiumValidUntil)
        } else { plan = try ReminderPlan.make(data) }
        // In-memory identifiers disappear on process restart. Read the actual
        // account-scoped requests so a refresh cannot leave duplicate schedules.
        let pending = await pendingIDs()
        guard expected == generation, !Task.isCancelled else { return false }
        let previous = ReminderCleanupPlan(identifiers: pending, account: account)
        guard !previous.ambiguousLegacy else { throw CloudError.invalidInput }
        generation += 1
        let current = generation
        center.removePendingNotificationRequests(withIdentifiers: previous.identifiers)
        activeIDs = []
        let prefix = "ouchi.local." + account.uuidString.lowercased() + "." + UUID().uuidString + "."
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        var added: [String] = []
        do {
            for (index, reminder) in plan.enumerated() {
                guard current == generation, !Task.isCancelled else { center.removePendingNotificationRequests(withIdentifiers: added); return false }
                let id = prefix + String(index)
                let content = UNMutableNotificationContent()
                content.title = "おうちメンテ"
                content.body = "保存したお手入れの予定が\(reminder.count)件あります。アプリで最新の予定を確認してください。"
                content.sound = .default
                var components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: reminder.date)
                components.calendar = calendar; components.timeZone = calendar.timeZone
                try await addNotification(UNNotificationRequest(identifier: id, content: content,
                    trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)))
                added.append(id)
                guard current == generation, !Task.isCancelled else { center.removePendingNotificationRequests(withIdentifiers: added); return false }
            }
            activeIDs = added
            return true
        } catch { center.removePendingNotificationRequests(withIdentifiers: added); throw error }
    }
}
