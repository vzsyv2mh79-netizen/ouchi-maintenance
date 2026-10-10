import Foundation
import OuchiCore
@main struct OverviewSmoke {
    static func main() throws {
        let fixtures = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures")
        let data = try Backup.decode(Data(contentsOf: fixtures.appendingPathComponent("web-backup.json")))
        let iso = ISO8601DateFormatter()
        let before = data.overview(home: "home-old", now: iso.date(from: "2026-10-16T14:59:00Z")!)
        precondition(before.today == "2026-10-16" && before.dueToday == 0 && before.upcoming == 1 && before.completedThisMonth == 1)
        let after = data.overview(home: "home-old", now: iso.date(from: "2026-10-16T15:00:00Z")!)
        precondition(after.today == "2026-10-17" && after.dueToday == 1 && after.upcoming == 0)
        let month = data.overview(home: "home-old", now: iso.date(from: "2026-10-31T15:00:00Z")!)
        precondition(month.today == "2026-11-01" && month.completedThisMonth == 0 && month.overdue == 1)
        let missing = data.overview(home: "other-house", now: iso.date(from: "2026-10-17T00:00:00Z")!)
        precondition(missing.productCount == 0 && missing.dueToday == 0 && missing.completedThisMonth == 0)
        print("OverviewSmoke PASS: Tokyo midnight/month rollover and selected-home isolation.")
    }
}
