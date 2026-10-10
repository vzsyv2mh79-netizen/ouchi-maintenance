import Foundation

public struct Home: Codable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let kind: String
    public let role: String?
}
public struct Appliance: Codable, Identifiable, Sendable {
    public let id: String
    public let homeId: String
    public let categoryId: String
    public let maker: String
    public let name: String
    public let modelNumber: String
    public let purchaseDate: String?
    public let installedDate: String?
    public let memo: String?
}
public struct CareTask: Codable, Identifiable, Sendable {
    public let id: String
    public let productId: String
    public let name: String
    public let kind: String
    public let intervalDays: Int
    public let lastCompletedAt: String?
    public let nextDueAt: String
    public let sourceKind: String
    public let sourceUrl: String?
    public let sourceNote: String?
    public let sourceFrequency: String?
}
public struct CareHistory: Codable, Identifiable, Sendable {
    public let id: String
    public let taskId: String
    public let productId: String
    public let completedAt: String
    public let note: String?
}
public struct Household: Codable, Sendable {
    public let homes: [Home]
    public let products: [Appliance]
    public let tasks: [CareTask]
    public let history: [CareHistory]

    public func products(in home: String) -> [Appliance] { products.filter { $0.homeId == home } }
    public func tasks(in home: String) -> [CareTask] {
        let ids = Set(products(in: home).map(\.id))
        return tasks.filter { ids.contains($0.productId) }.sorted { $0.nextDueAt < $1.nextDueAt }
    }
    public func history(in home: String) -> [CareHistory] {
        let ids = Set(products(in: home).map(\.id))
        return history.filter { ids.contains($0.productId) }.sorted { $0.completedAt > $1.completedAt }
    }
    public func export() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(self)
    }
}
