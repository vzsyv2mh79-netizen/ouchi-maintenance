import Foundation

public struct DailyReminder: Sendable {
    public let date: Date
    public let count: Int
}
/// Schedule data only; changing premium options requires server-verified rights
/// in the caller. This type does not authorize a purchase or enable a paid UI.
public struct ReminderSchedule: Codable, Equatable, Sendable {
    public let minuteOfDay: Int
    public let weekdays: [Int] // Gregorian Sunday=1 through Saturday=7, Tokyo.
    public let leadDays: Int
    public let includeOverdue: Bool
    public static let free = try! ReminderSchedule(minuteOfDay: 540, weekdays: Array(1...7), leadDays: 0, includeOverdue: true)
    public init(minuteOfDay: Int, weekdays: [Int], leadDays: Int, includeOverdue: Bool) throws {
        guard (0..<1440).contains(minuteOfDay), !weekdays.isEmpty,
              Set(weekdays).count == weekdays.count, weekdays.allSatisfy({ (1...7).contains($0) }),
              [0, 1, 3, 7].contains(leadDays) else { throw CloudError.invalidInput }
        self.minuteOfDay = minuteOfDay; self.weekdays = weekdays.sorted()
        self.leadDays = leadDays; self.includeOverdue = includeOverdue
    }
    private enum CodingKeys: String, CodingKey { case minuteOfDay, weekdays, leadDays, includeOverdue }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(minuteOfDay: c.decode(Int.self, forKey: .minuteOfDay), weekdays: c.decode([Int].self, forKey: .weekdays),
                      leadDays: c.decode(Int.self, forKey: .leadDays), includeOverdue: c.decode(Bool.self, forKey: .includeOverdue))
    }
}
public enum ReminderPlan {
    /// An already verified paid period bounds custom notifications. Pending
    /// requests after expiry use the free schedule even if the app stays closed.
    /// This helper does not verify or grant an entitlement itself.
    public static func make(_ data: Household, now: Date = Date(),
                            premiumSchedule: ReminderSchedule, premiumValidUntil: Date) throws -> [DailyReminder] {
        guard premiumValidUntil.timeIntervalSince1970.isFinite else { throw CloudError.invalidInput }
        let custom = try make(data, now: now, schedule: premiumSchedule).filter { $0.date < premiumValidUntil }
        let free = try make(data, now: now, schedule: .free).filter { $0.date >= premiumValidUntil }
        return (custom + free).sorted { $0.date < $1.date }
    }
    public static func make(_ data: Household, now: Date = Date(), schedule: ReminderSchedule = .free) throws -> [DailyReminder] {
        _ = try Backup.canonical(data)
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar; formatter.timeZone = calendar.timeZone; formatter.dateFormat = "yyyy-MM-dd"
        let start = calendar.startOfDay(for: now)
        return (0..<30).compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: offset, to: start),
                  schedule.weekdays.contains(calendar.component(.weekday, from: day)),
                  let date = calendar.date(bySettingHour: schedule.minuteOfDay / 60, minute: schedule.minuteOfDay % 60, second: 0, of: day),
                  date > now, let horizon = calendar.date(byAdding: .day, value: schedule.leadDays, to: day) else { return nil }
            let key = formatter.string(from: date), last = formatter.string(from: horizon)
            let count = data.tasks.filter { $0.nextDueAt <= last && (schedule.includeOverdue || $0.nextDueAt >= key) }.count
            return count > 0 ? DailyReminder(date: date, count: count) : nil
        }
    }
}
