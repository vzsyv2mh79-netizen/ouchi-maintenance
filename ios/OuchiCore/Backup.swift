import Foundation
import CryptoKit

public enum Backup {
    public static let maximumBytes = 10 * 1024 * 1024
    private struct Envelope: Codable {
        let app: String
        let version: Int
        let exportedAt: String
        let data: Household
    }
    public static func encode(_ household: Household, now: Date = Date()) throws -> Data {
        _ = try canonical(household)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let bytes = try encoder.encode(Envelope(app: "ouchi-maintenance", version: 1,
            exportedAt: ISO8601DateFormatter().string(from: now), data: household))
        guard bytes.count <= maximumBytes else { throw CloudError.invalidInput }
        return bytes
    }
    public static func decode(_ bytes: Data) throws -> Household {
        guard bytes.count <= maximumBytes else { throw CloudError.invalidInput }
        let envelope = try JSONDecoder().decode(Envelope.self, from: bytes)
        guard envelope.app == "ouchi-maintenance", envelope.version == 1 else { throw CloudError.invalidInput }
        _ = try canonical(envelope.data)
        return envelope.data
    }
    // Match Web validateData's field order and absent optional fields before hashing.
    // This makes repeat restore detection independent of JSON file formatting and platform.
    public static func canonical(_ data: Household) throws -> Data {
        func string(_ value: String, required: Bool = false) throws -> String {
            guard value.utf16.count <= 10000, !required || !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw CloudError.invalidInput }
            return String(data: try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .withoutEscapingSlashes]), encoding: .utf8)!
        }
        func day(_ value: String) throws -> String {
            guard RecordRules.date(value) else { throw CloudError.invalidInput }
            return try string(value)
        }
        func object(_ fields: [(String, String?)]) -> String {
            "{" + fields.compactMap { key, value in value.map { "\"" + key + "\":" + $0 } }.joined(separator: ",") + "}"
        }
        func checkIDs(_ ids: [String]) throws {
            guard ids.count <= 10000, Set(ids).count == ids.count else { throw CloudError.invalidInput }
            for id in ids { _ = try string(id, required: true) }
        }
        try checkIDs(data.homes.map(\.id)); try checkIDs(data.products.map(\.id))
        try checkIDs(data.tasks.map(\.id)); try checkIDs(data.history.map(\.id))
        guard !data.homes.isEmpty else { throw CloudError.invalidInput }
        let homeIDs = Set(data.homes.map(\.id)), productIDs = Set(data.products.map(\.id))
        let taskProducts = Dictionary(uniqueKeysWithValues: data.tasks.map { ($0.id, $0.productId) })
        guard data.products.allSatisfy({ homeIDs.contains($0.homeId) }),
              data.tasks.allSatisfy({ productIDs.contains($0.productId) }),
              data.history.allSatisfy({ taskProducts[$0.taskId] == $0.productId }) else { throw CloudError.invalidInput }
        let homes = try data.homes.map { home in
            guard ["home", "parents", "second", "rental"].contains(home.kind) else { throw CloudError.invalidInput }
            return object([("id", try string(home.id, required: true)), ("name", try string(home.name, required: true)), ("kind", try string(home.kind))])
        }
        let products = try data.products.map { p in
            try object([("id", string(p.id, required: true)), ("homeId", string(p.homeId, required: true)),
                ("categoryId", string(p.categoryId, required: true)), ("maker", string(p.maker)), ("name", string(p.name, required: true)),
                ("modelNumber", string(p.modelNumber)), ("purchaseDate", p.purchaseDate.map(day)), ("installedDate", p.installedDate.map(day)), ("memo", p.memo.map { try string($0) })])
        }
        let tasks = try data.tasks.map { t in
            guard RecordRules.kinds.contains(t.kind), (1...3650).contains(t.intervalDays),
                  ["メーカー公式", "取扱説明書", "公的情報", "一般的な目安", "ユーザー設定"].contains(t.sourceKind) else { throw CloudError.invalidInput }
            if let url = t.sourceUrl, !url.isEmpty, !url.hasPrefix("http://"), !url.hasPrefix("https://") { throw CloudError.invalidInput }
            if ["メーカー公式", "取扱説明書", "公的情報"].contains(t.sourceKind), t.sourceUrl?.hasPrefix("https://") != true { throw CloudError.invalidInput }
            return try object([("id", string(t.id, required: true)), ("productId", string(t.productId, required: true)), ("name", string(t.name, required: true)),
                ("kind", string(t.kind)), ("intervalDays", String(t.intervalDays)), ("nextDueAt", day(t.nextDueAt)),
                ("lastCompletedAt", t.lastCompletedAt.map(day)), ("sourceKind", string(t.sourceKind)),
                ("sourceUrl", t.sourceUrl.map { try string($0) }), ("sourceNote", t.sourceNote.map { try string($0) }), ("sourceFrequency", t.sourceFrequency.map { try string($0) })])
        }
        let history = try data.history.map { h in
            try object([("id", string(h.id, required: true)), ("taskId", string(h.taskId, required: true)), ("productId", string(h.productId, required: true)),
                        ("completedAt", day(h.completedAt)), ("note", h.note.map { try string($0) })])
        }
        return Data(object([("homes", "[" + homes.joined(separator: ",") + "]"), ("products", "[" + products.joined(separator: ",") + "]"),
                            ("tasks", "[" + tasks.joined(separator: ",") + "]"), ("history", "[" + history.joined(separator: ",") + "]")]).utf8)
    }
    public struct Prepared: Sendable { public let hash: String; public let payload: Data }
    public static func prepareRestore(_ data: Household) throws -> Prepared {
        let canonical = try canonical(data)
        let hash = SHA256.hash(data: canonical).map { String(format: "%02x", $0) }.joined()
        var object = try JSONSerialization.jsonObject(with: canonical) as! [String: [[String: Any]]]
        let homes = Dictionary(uniqueKeysWithValues: data.homes.map { ($0.id, UUID().uuidString.lowercased()) })
        let products = Dictionary(uniqueKeysWithValues: data.products.map { ($0.id, UUID().uuidString.lowercased()) })
        let tasks = Dictionary(uniqueKeysWithValues: data.tasks.map { ($0.id, UUID().uuidString.lowercased()) })
        object["homes"] = object["homes"]!.map { value in var row = value; row["id"] = homes[value["id"] as! String]!; return row }
        object["products"] = object["products"]!.map { value in var row = value; row["id"] = products[value["id"] as! String]!; row["homeId"] = homes[value["homeId"] as! String]!; return row }
        object["tasks"] = object["tasks"]!.map { value in var row = value; row["id"] = tasks[value["id"] as! String]!; row["productId"] = products[value["productId"] as! String]!; return row }
        object["history"] = object["history"]!.map { value in var row = value; row["id"] = UUID().uuidString.lowercased(); row["taskId"] = tasks[value["taskId"] as! String]!; row["productId"] = products[value["productId"] as! String]!; return row }
        let payload = try JSONSerialization.data(withJSONObject: object)
        guard payload.count <= maximumBytes else { throw CloudError.invalidInput }
        return Prepared(hash: hash, payload: payload)
    }
}
