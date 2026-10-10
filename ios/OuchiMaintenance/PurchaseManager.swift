import Foundation
import StoreKit

// Native adapter: only Sandbox/TestFlight, server persistence must succeed before finish.
@MainActor
final class PurchaseManager: ObservableObject {
    enum Outcome { case saved, pending, cancelled }
    @Published private(set) var products: [Product] = []
    private let ids: Set<String> = ["ouchi.premium.monthly", "ouchi.premium.annual", "ouchi.tip.small", "ouchi.tip.medium", "ouchi.tip.large"]
    var persist: ((String) async throws -> Void)?
    func load() async throws { products = try await Product.products(for: ids) }
    func purchase(_ product: Product, account: UUID) async throws -> Outcome {
        guard ids.contains(product.id), let persist else { throw PurchaseError.notConfigured }
        switch try await product.purchase(options: [.appAccountToken(account)]) {
        case .success(let result):
            guard case .verified(let transaction) = result,
                  transaction.environment == .sandbox,
                  transaction.appAccountToken == account else { throw PurchaseError.unverified }
            try await persist(result.jwsRepresentation)
            await transaction.finish()
            return .saved
        case .pending: return .pending
        case .userCancelled: return .cancelled
        @unknown default: throw PurchaseError.unverified
        }
    }
    func restore(account: UUID) async throws {
        guard let persist else { throw PurchaseError.notConfigured }
        try await AppStore.sync()
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  ids.contains(transaction.productID), transaction.environment == .sandbox,
                  transaction.appAccountToken == account else { continue }
            try await persist(result.jwsRepresentation)
        }
    }
    func observeUnfinished(account: UUID) async throws {
        guard let persist else { throw PurchaseError.notConfigured }
        for await result in Transaction.unfinished {
            guard case .verified(let transaction) = result,
                  ids.contains(transaction.productID), transaction.environment == .sandbox,
                  transaction.appAccountToken == account else { continue }
            try await persist(result.jwsRepresentation)
            await transaction.finish()
        }
    }
    enum PurchaseError: Error { case notConfigured, unverified }
}
