import Foundation
import OuchiCore
@main struct ReminderSmoke {
    static func main() throws {
        let fixtures = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures")
        let data = try Backup.decode(Data(contentsOf: fixtures.appendingPathComponent("web-backup.json")))
        let date = ISO8601DateFormatter()
        let plan = try ReminderPlan.make(data, now: date.date(from: "2026-10-10T23:59:00Z")!)
        precondition(plan.count == 24 && plan.allSatisfy { $0.count == 1 })
        precondition(plan.first?.date == date.date(from: "2026-10-17T00:00:00Z"))
        let passed = try ReminderPlan.make(data, now: date.date(from: "2026-10-17T00:00:00Z")!)
        precondition(passed.count == 29 && passed.first?.date == date.date(from: "2026-10-18T00:00:00Z"))
        precondition(passed.allSatisfy { $0.date > date.date(from: "2026-10-17T00:00:00Z")! })
        let custom = try ReminderSchedule(minuteOfDay: 20 * 60 + 30, weekdays: [7], leadDays: 1, includeOverdue: false)
        let saturday = try ReminderPlan.make(data, now: date.date(from: "2026-10-10T23:59:00Z")!, schedule: custom)
        precondition(saturday.count == 1)
        precondition(saturday.first?.date == date.date(from: "2026-10-17T11:30:00Z"))
        let advance = try ReminderSchedule(minuteOfDay: 6 * 60, weekdays: Array(1...7), leadDays: 3, includeOverdue: false)
        let early = try ReminderPlan.make(data, now: date.date(from: "2026-10-10T23:59:00Z")!, schedule: advance)
        precondition(early.count == 4 && early.first?.date == date.date(from: "2026-10-13T21:00:00Z"))
        let now = date.date(from: "2026-10-10T23:59:00Z")!
        let expiry = date.date(from: "2026-10-15T21:00:00Z")!
        let bounded = try ReminderPlan.make(data, now: now, premiumSchedule: advance, premiumValidUntil: expiry)
        let expectedDates = (early.filter { $0.date < expiry } + plan.filter { $0.date >= expiry }).map(\.date).sorted()
        precondition(bounded.map(\.date) == expectedDates)
        precondition(!bounded.contains { $0.date == expiry }) // Paid custom trigger expires at this exact instant.
        precondition(bounded.filter { $0.date >= expiry }.allSatisfy { plan.map(\.date).contains($0.date) })
        let alreadyExpired = try ReminderPlan.make(data, now: now, premiumSchedule: advance, premiumValidUntil: now)
        precondition(alreadyExpired.map(\.date) == plan.map(\.date))
        let future = try ReminderPlan.make(data, now: now, premiumSchedule: advance,
            premiumValidUntil: date.date(from: "2027-01-01T00:00:00Z")!)
        precondition(future.map(\.date) == early.map(\.date))
        do {
            _ = try ReminderPlan.make(data, now: now, premiumSchedule: advance, premiumValidUntil: Date(timeIntervalSince1970: .infinity))
            fatalError("unbounded premium period accepted")
        } catch { precondition(error as? CloudError == .invalidInput) }
        let encoded = try JSONEncoder().encode(custom)
        let decoded = try JSONDecoder().decode(ReminderSchedule.self, from: encoded)
        precondition(decoded == custom)
        for invalid in [
            #"{"minuteOfDay":1440,"weekdays":[1],"leadDays":0,"includeOverdue":true}"#,
            #"{"minuteOfDay":540,"weekdays":[],"leadDays":0,"includeOverdue":true}"#,
            #"{"minuteOfDay":540,"weekdays":[1,1],"leadDays":0,"includeOverdue":true}"#,
            #"{"minuteOfDay":540,"weekdays":[8],"leadDays":0,"includeOverdue":true}"#,
            #"{"minuteOfDay":540,"weekdays":[1],"leadDays":2,"includeOverdue":true}"#
        ] {
            do { _ = try JSONDecoder().decode(ReminderSchedule.self, from: Data(invalid.utf8)); fatalError("invalid reminder schedule accepted") }
            catch { precondition(error as? CloudError == .invalidInput) }
        }
        print("ReminderSmoke PASS: 30-day bound, Tokyo9am defaults, custom options, exact expiry fallback without app reopening, validated persistence, no past notification. No OS notification scheduled.")
    }
}
