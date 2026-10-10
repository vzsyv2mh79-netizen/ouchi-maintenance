import Foundation
import UserNotifications
import OuchiCore

@MainActor final class LocalReminders {
    private let center = UNUserNotificationCenter.current()
    private let preference = "ouchi.localReminder.account"
    private var generation = 0
    private var activeIDs: [String] = []
    func reset(clearPreference: Bool) async {
        generation += 1
        let expected = generation
        if clearPreference { UserDefaults.standard.removeObject(forKey: preference) }
        let requests = await center.pendingNotificationRequests()
        guard expected == generation else { return }
        center.removePendingNotificationRequests(withIdentifiers: requests.map(\.identifier).filter { $0.hasPrefix("ouchi.local.") })
        let delivered = await center.deliveredNotifications()
        guard expected == generation else { return }
        center.removeDeliveredNotifications(withIdentifiers: delivered.map { $0.request.identifier }.filter { $0.hasPrefix("ouchi.local.") })
        activeIDs = []
    }
    func enable(data: Household, account: UUID) async throws -> Bool {
        let expected = generation
        let granted = try await center.requestAuthorization(options: [.alert, .sound])
        guard granted, expected == generation else { return false }
        UserDefaults.standard.set(account.uuidString, forKey: preference)
        return try await reconcile(data: data, account: account)
    }
    func reconcile(data: Household, account: UUID) async throws -> Bool {
        guard UserDefaults.standard.string(forKey: preference) == account.uuidString else { return false }
        let expected = generation
        let settings = await center.notificationSettings()
        guard expected == generation else { return false }
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            await reset(clearPreference: true); return false
        }
        let plan = try ReminderPlan.make(data)
        generation += 1
        let current = generation
        center.removePendingNotificationRequests(withIdentifiers: activeIDs)
        activeIDs = []
        let prefix = "ouchi.local." + UUID().uuidString + "."
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        var added: [String] = []
        do {
            for (index, reminder) in plan.enumerated() {
                guard current == generation else { center.removePendingNotificationRequests(withIdentifiers: added); return false }
                let id = prefix + String(index)
                let content = UNMutableNotificationContent()
                content.title = "おうちメンテ"
                content.body = "保存した予定では、期限が来たお手入れが\(reminder.count)件あります。アプリで最新の予定を確認してください。"
                content.sound = .default
                var components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: reminder.date)
                components.calendar = calendar; components.timeZone = calendar.timeZone
                try await center.add(UNNotificationRequest(identifier: id, content: content,
                    trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)))
                added.append(id)
                guard current == generation else { center.removePendingNotificationRequests(withIdentifiers: added); return false }
            }
            activeIDs = added
            return true
        } catch { center.removePendingNotificationRequests(withIdentifiers: added); throw error }
    }
}
