import Foundation
import OuchiCore
@main struct CalendarSmoke {
    static func main() throws {
        let fixtures = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures")
        let data = try Backup.decode(Data(contentsOf: fixtures.appendingPathComponent("web-backup.json")))
        let output = try CalendarExport.encode(data, now: ISO8601DateFormatter().date(from: "2026-10-10T00:00:00Z")!)
        let expected = try Data(contentsOf: fixtures.appendingPathComponent("web-calendar.ics"))
        precondition(output == expected, "Web/native calendar differs")
        let text = String(data: output, encoding: .utf8)!
        precondition(text.components(separatedBy: "\r\n").allSatisfy { $0.utf8.count <= 75 })
        precondition(text.contains("DTSTART;TZID=Asia/Tokyo:20261017T090000"))
        precondition(text.contains("TRIGGER:-P1D") && text.contains("RRULE:FREQ=DAILY;INTERVAL=7"))
        print("CalendarSmoke PASS: exact actual Web export, UTF8 folding, Tokyo9am, interval and previous-day alarm. No calendar modified.")
    }
}
