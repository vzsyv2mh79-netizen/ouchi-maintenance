import Foundation
import UserNotifications
import OuchiCore

@MainActor private final class TestReminderPreferences: LocalReminderPreferences {
    var account: UUID?
}
@MainActor private final class TestNotificationBackend: LocalNotificationBackend {
    var pending: [String: UNNotificationRequest] = [:]
    var delivered: [String] = []
    var queriesFail = false
    var authorized = true
    var granted = true
    var requests = 0
    var additions = 0
    var failAt: Int?
    var onPending: (@MainActor () async -> Void)?
    var ignoreRemoval = false
    var onAdd: (@MainActor () async -> Void)?
    func pendingIDs() async throws -> [String] {
        if queriesFail { throw CloudError.unavailable }
        let hook = onPending; onPending = nil
        await hook?()
        return Array(pending.keys)
    }
    func deliveredIDs() async throws -> [String] {
        if queriesFail { throw CloudError.unavailable }; return delivered
    }
    func notificationAuthorized() async -> Bool { authorized }
    func requestAuthorization() async throws -> Bool { requests += 1; return granted }
    func addNotification(_ request: UNNotificationRequest) async throws {
        additions += 1
        if additions == failAt { throw CloudError.unavailable }
        pending[request.identifier] = request
        let hook = onAdd; onAdd = nil
        await hook?()
    }
    func removePending(_ identifiers: [String]) { if ignoreRemoval { return }; for id in identifiers { pending.removeValue(forKey: id) } }
    func removeDelivered(_ identifiers: [String]) { delivered.removeAll { identifiers.contains($0) } }
}

@main struct LocalReminderLifecycleSmoke {
    @MainActor static func main() async throws {
        let immediate: Int = try await boundedNotificationQuery(timeout: 0.02) { reply in reply(7); reply(8) }
        precondition(immediate == 7, "Only the first callback may resolve a query")
        do {
            let _: [String] = try await boundedNotificationQuery(timeout: 0.02) { _ in }
            fatalError("Missing callback must time out, not produce an empty list")
        } catch { precondition(error as? CloudError == .unavailable) }
        do {
            let _: [String] = try await boundedNotificationQuery(timeout: 0.02) { reply in
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.05) { reply([]); reply([]) }
            }
            fatalError("Late callback must not turn a timeout into success")
        } catch { precondition(error as? CloudError == .unavailable) }
        try await Task.sleep(for: .milliseconds(80))
        let unavailableBackend = TestNotificationBackend(), unavailablePreferences = TestReminderPreferences()
        let unavailableAccount = UUID(); unavailablePreferences.account = unavailableAccount
        unavailableBackend.queriesFail = true
        let unavailable = LocalReminders(backend: unavailableBackend, preferences: unavailablePreferences)
        let resetSucceeded = await unavailable.reset(clearPreference: false)
        let deletionSucceeded = await unavailable.eraseForAccountDeletion(account: unavailableAccount, stillBound: { true })
        let remoteStopSucceeded = await unavailable.stopPendingForRemoteDelivery(account: unavailableAccount, stillBound: { true })
        precondition(!resetSucceeded && !deletionSucceeded && !remoteStopSucceeded)
        precondition(unavailablePreferences.account == unavailableAccount, "Unknown notification state must not confirm account cleanup")
        let fixtures = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures")
        let household = try Backup.decode(Data(contentsOf: fixtures.appendingPathComponent("web-backup.json")))
        let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let other = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
        let formatter = ISO8601DateFormatter()
        let now = formatter.date(from: "2026-10-10T23:59:00Z")!
        let backend = TestNotificationBackend(), preferences = TestReminderPreferences()
        let reminders = LocalReminders(backend: backend, preferences: preferences, now: { now })
        let custom = try ReminderSchedule(minuteOfDay: 360, weekdays: Array(1...7), leadDays: 3, includeOverdue: false)
        do { _ = try await reminders.enable(data: household, account: account, schedule: custom); fatalError("unverified custom expiry accepted") }
        catch { precondition(error as? CloudError == .invalidInput) }
        precondition(backend.requests == 0 && preferences.account == nil)
        backend.granted = false
        let denied = try await reminders.enable(data: household, account: account)
        precondition(!denied && preferences.account == nil && backend.pending.isEmpty)
        backend.granted = true
        let enabled = try await reminders.enable(data: household, account: account)
        let initialIDs = Set(backend.pending.keys)
        precondition(enabled && reminders.enabled(account: account) && initialIDs.count == 24)
        precondition(backend.pending.values.allSatisfy { $0.content.body.contains("1件") && !($0.trigger as! UNCalendarNotificationTrigger).repeats })
        let foreign = "ouchi.local." + other.uuidString.lowercased() + "." + UUID().uuidString + ".0"
        backend.pending[foreign] = UNNotificationRequest(identifier: foreign, content: UNMutableNotificationContent(), trigger: nil)
        backend.pending["another-feature"] = UNNotificationRequest(identifier: "another-feature", content: UNMutableNotificationContent(), trigger: nil)
        let restarted = LocalReminders(backend: backend, preferences: preferences, now: { now })
        let refreshed = try await restarted.reconcile(data: household, account: account)
        precondition(refreshed && backend.pending.count == 26 && Set(backend.pending.keys).isDisjoint(with: initialIDs))
        precondition(backend.pending[foreign] != nil && backend.pending["another-feature"] != nil)
        let expiry = formatter.date(from: "2026-10-15T21:00:00Z")!
        let applied = try await restarted.reconcile(data: household, account: account, schedule: custom, premiumValidUntil: expiry)
        let plan = try ReminderPlan.make(household, now: now, premiumSchedule: custom, premiumValidUntil: expiry)
        let scoped = backend.pending.values.filter { $0.identifier.hasPrefix("ouchi.local." + account.uuidString.lowercased() + ".") }
        precondition(applied && scoped.count == plan.count)
        let dates = scoped.map { request -> Date in
            let trigger = request.trigger as! UNCalendarNotificationTrigger
            precondition(!trigger.repeats && trigger.dateComponents.timeZone?.identifier == "Asia/Tokyo")
            return trigger.dateComponents.calendar!.date(from: trigger.dateComponents)!
        }.sorted()
        precondition(dates == plan.map(\.date))
        backend.failAt = backend.additions + 2
        do { _ = try await restarted.reconcile(data: household, account: account); fatalError("partial scheduling failure accepted") }
        catch { precondition(error as? CloudError == .unavailable) }
        precondition(backend.pending.count == 2 && backend.pending[foreign] != nil && backend.pending["another-feature"] != nil)
        backend.failAt = nil
        backend.onPending = { preferences.account = other }
        let switched = try await restarted.reconcile(data: household, account: account)
        precondition(!switched && backend.pending.count == 2 && preferences.account == other)
        preferences.account = account
        backend.onAdd = { await restarted.reset(clearPreference: true) }
        let interrupted = try await restarted.reconcile(data: household, account: account)
        precondition(!interrupted && preferences.account == nil && backend.pending.keys.sorted() == ["another-feature"])
        preferences.account = account
        let old = "ouchi.local." + account.uuidString.lowercased() + "." + UUID().uuidString + ".0"
        backend.pending[old] = UNNotificationRequest(identifier: old, content: UNMutableNotificationContent(), trigger: nil)
        backend.delivered = [old, foreign, "another-feature"]
        backend.pending[foreign] = UNNotificationRequest(identifier: foreign, content: UNMutableNotificationContent(), trigger: nil)
        backend.onPending = { preferences.account = other }
        let erased = await restarted.eraseForAccountDeletion(account: account, stillBound: { true })
        precondition(erased && preferences.account == other && backend.pending[foreign] != nil && backend.delivered.contains(foreign))
        precondition(backend.pending[old] == nil && !backend.delivered.contains(old))
        // Explicit remote setup opt-out is pending-only, exact-account and verified.
        preferences.account = account
        backend.pending[old] = UNNotificationRequest(identifier: old, content: UNMutableNotificationContent(), trigger: nil)
        backend.delivered = [old, foreign]
        backend.ignoreRemoval = true
        let unconfirmed = await restarted.stopPendingForRemoteDelivery(account: account, stillBound: { true })
        precondition(!unconfirmed && preferences.account == account && backend.pending[old] != nil)
        backend.ignoreRemoval = false
        var bound = true
        backend.onPending = { bound = false }
        let changed = await restarted.stopPendingForRemoteDelivery(account: account, stillBound: { bound })
        precondition(!changed && backend.pending[old] != nil && preferences.account == account)
        let stopped = await restarted.stopPendingForRemoteDelivery(account: account, stillBound: { true })
        precondition(stopped && preferences.account == nil && backend.pending[old] == nil)
        precondition(backend.pending[foreign] != nil && backend.pending["another-feature"] != nil && backend.delivered == [old, foreign])
        let repeatStop = await restarted.stopPendingForRemoteDelivery(account: account, stillBound: { true })
        precondition(repeatStop)
        print("LocalReminderLifecycleSmoke PASS: opt-in, restart replacement, scoped preservation, expiry trigger dates, partial failure cleanup, account switch and interruption. Injected backend only; no OS permissions/notifications or user preferences changed.")
    }
}
