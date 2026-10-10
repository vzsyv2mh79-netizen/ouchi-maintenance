import Foundation

public struct DailyReminder: Sendable {
    public let date: Date
    public let count: Int
}
public enum ReminderPlan {
    public static func make(_ data: Household, now: Date = Date()) throws -> [DailyReminder] {
        _ = try Backup.canonical(data)
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar; formatter.timeZone = calendar.timeZone; formatter.dateFormat = "yyyy-MM-dd"
        let start = calendar.startOfDay(for: now)
        return (0..<30).compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: offset, to: start),
                  let date = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: day), date > now else { return nil }
            let key = formatter.string(from: date)
            let count = data.tasks.filter { $0.nextDueAt <= key }.count
            return count > 0 ? DailyReminder(date: date, count: count) : nil
        }
    }
}
