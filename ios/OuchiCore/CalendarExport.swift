import Foundation

public enum CalendarExport {
    public static func encode(_ data: Household, now: Date = Date()) throws -> Data {
        _ = try Backup.canonical(data)
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian); formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        let stamp = formatter.string(from: now)
        var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ouchi Maintenance//JA", "CALSCALE:GREGORIAN", "X-WR-CALNAME:おうちメンテ", "BEGIN:VTIMEZONE", "TZID:Asia/Tokyo", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:JST", "END:STANDARD", "END:VTIMEZONE"]
        let products = Dictionary(uniqueKeysWithValues: data.products.map { ($0.id, $0) })
        for task in data.tasks {
            guard let product = products[task.productId] else { throw CloudError.invalidInput }
            let date = task.nextDueAt.replacingOccurrences(of: "-", with: "")
            let uid = task.id.utf8.map { String(format: "%02x", $0) }.joined()
            lines += ["BEGIN:VEVENT", "UID:\(uid)@ouchi-maintenance", "DTSTAMP:\(stamp)", "DTSTART;TZID=Asia/Tokyo:\(date)T090000", "DTEND;TZID=Asia/Tokyo:\(date)T093000", "RRULE:FREQ=DAILY;INTERVAL=\(task.intervalDays)", "SUMMARY:" + escape(product.name + "・" + task.name), "DESCRIPTION:" + escape("おうちメンテで登録した周期です。実施後の次回予定はアプリで確認し、必要に応じてカレンダーも更新してください。"), "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-P1D", "DESCRIPTION:" + escape(task.name + "の予定が明日です"), "END:VALARM", "END:VEVENT"]
        }
        lines.append("END:VCALENDAR")
        let result = Data((lines.map(fold).joined(separator: "\r\n") + "\r\n").utf8)
        guard result.count <= Backup.maximumBytes else { throw CloudError.invalidInput }
        return result
    }
    private static func escape(_ value: String) -> String {
        value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n").replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: ";", with: "\\;").replacingOccurrences(of: ",", with: "\\,")
    }
    private static func fold(_ line: String) -> String {
        var result = "", current = "", bytes = 0
        for scalar in line.unicodeScalars {
            let value = String(scalar), length = value.utf8.count
            if bytes + length > 75 { result += current + "\r\n"; current = " "; bytes = 1 }
            current += value; bytes += length
        }
        return result + current
    }
}
