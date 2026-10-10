import Foundation

public enum RecordRules {
    public static let categories = ["aircon", "ecocute", "washer", "dryer", "fridge", "dishwasher", "air-purifier", "humidifier", "dehumidifier-appliance", "vacuum", "robot-vacuum", "range-hood", "vent-fan", "water-filter", "fire-alarm", "other-appliance", "pest-control", "dehumidifier", "other-consumable"]
    public static let categoryNames = ["エアコン", "エコキュート", "洗濯機", "乾燥機", "冷蔵庫", "食洗機", "空気清浄機", "加湿器", "除湿機", "掃除機", "ロボット掃除機", "レンジフード", "換気扇", "浄水器", "火災報知器", "その他家電", "防虫用品", "除湿剤", "その他消耗品"]
    public static let kinds = ["掃除", "交換", "点検", "補充"]
    public static func date(_ value: String) -> Bool {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian); f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd"; f.isLenient = false
        guard let date = f.date(from: value) else { return false }
        return f.string(from: date) == value
    }
}
extension Appliance {
    public func validate() throws {
        guard UUID(uuidString: id) != nil, UUID(uuidString: homeId) != nil,
              RecordRules.categories.contains(categoryId), !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              name.count <= 200, maker.count <= 200, modelNumber.count <= 200, (memo?.count ?? 0) <= 10000,
              purchaseDate.map(RecordRules.date) ?? true, installedDate.map(RecordRules.date) ?? true else { throw CloudError.invalidInput }
    }
}
extension CareTask {
    public func validate() throws {
        guard UUID(uuidString: id) != nil, UUID(uuidString: productId) != nil,
              !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 200,
              RecordRules.kinds.contains(kind), (1...3650).contains(intervalDays), RecordRules.date(nextDueAt),
              lastCompletedAt.map(RecordRules.date) ?? true,
              ["メーカー公式", "取扱説明書", "公的情報", "一般的な目安", "ユーザー設定"].contains(sourceKind) else { throw CloudError.invalidInput }
        if ["メーカー公式", "取扱説明書", "公的情報"].contains(sourceKind) {
            guard let sourceUrl, let url = URL(string: sourceUrl), url.scheme == "https", url.host != nil else { throw CloudError.invalidInput }
        }
    }
}
