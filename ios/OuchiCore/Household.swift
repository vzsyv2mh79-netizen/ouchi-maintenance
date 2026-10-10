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
    public init(id: String, homeId: String, categoryId: String, maker: String, name: String, modelNumber: String, purchaseDate: String?, installedDate: String?, memo: String?) {
        self.id = id
        self.homeId = homeId
        self.categoryId = categoryId
        self.maker = maker
        self.name = name
        self.modelNumber = modelNumber
        self.purchaseDate = purchaseDate
        self.installedDate = installedDate
        self.memo = memo
    }
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
    public init(id: String, productId: String, name: String, kind: String, intervalDays: Int, lastCompletedAt: String?, nextDueAt: String, sourceKind: String, sourceUrl: String?, sourceNote: String?, sourceFrequency: String?) {
        self.id = id
        self.productId = productId
        self.name = name
        self.kind = kind
        self.intervalDays = intervalDays
        self.lastCompletedAt = lastCompletedAt
        self.nextDueAt = nextDueAt
        self.sourceKind = sourceKind
        self.sourceUrl = sourceUrl
        self.sourceNote = sourceNote
        self.sourceFrequency = sourceFrequency
    }
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
