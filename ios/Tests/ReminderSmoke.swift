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
        print("ReminderSmoke PASS: 30-day bound, Tokyo9am, overdue count, no past notification. No OS notification scheduled.")
    }
}
