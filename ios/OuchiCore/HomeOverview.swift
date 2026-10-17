import Foundation

public struct HomeOverview: Sendable {
    public let today: String
    public let overdue: Int
    public let dueToday: Int
    public let upcoming: Int
    public let productCount: Int
    public let completedThisMonth: Int
}
extension Household {
    public func overview(home: String, now: Date = Date()) -> HomeOverview {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar; formatter.timeZone = calendar.timeZone; formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: now)
        let last = formatter.string(from: calendar.date(byAdding: .day, value: 7, to: now)!)
        let month = String(today.prefix(7))
        let values = tasks(in: home)
        return HomeOverview(today: today, overdue: values.filter { $0.nextDueAt < today }.count,
            dueToday: values.filter { $0.nextDueAt == today }.count,
            upcoming: values.filter { $0.nextDueAt > today && $0.nextDueAt <= last }.count,
            productCount: products(in: home).count,
            completedThisMonth: history(in: home).filter { $0.completedAt.hasPrefix(month + "-") && $0.completedAt <= today }.count)
    }
}
