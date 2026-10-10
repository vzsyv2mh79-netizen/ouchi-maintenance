import Foundation
import Combine
import StoreKit

// Native adapter: only Sandbox/TestFlight, server persistence must succeed before finish.
@MainActor
final class PurchaseManager: ObservableObject {
    enum Outcome { case saved, pending, cancelled }
    @Published private(set) var products: [Product] = []
    @Published private(set) var needsRetry = false
    private var observer: Task<Void, Never>?
    private var bindingGeneration = 0
    private var boundAccount: UUID?
    private let ids: Set<String> = ["ouchi.premium.monthly", "ouchi.premium.annual", "ouchi.tip.small", "ouchi.tip.medium", "ouchi.tip.large"]
    var persist: ((String) async throws -> Void)?
    // Start after authentication and stop before switching account/session.
    // Failed deliveries stay unfinished and can be replayed after reconnecting.
    func startObserving(account: UUID) {
        stopObserving()
        boundAccount = account
        needsRetry = false
        let expected = bindingGeneration
        observer = Task { [weak self] in
            for await result in Transaction.updates {
                guard !Task.isCancelled, let self else { return }
                do { try await self.deliver(result, account: account, finish: true) }
                catch { if self.bindingGeneration == expected, self.boundAccount == account, !Task.isCancelled { self.needsRetry = true } }
            }
        }
    }
    func stopObserving() { bindingGeneration += 1; boundAccount = nil; observer?.cancel(); observer = nil }
    private func deliver(_ result: VerificationResult<Transaction>, account: UUID, finish: Bool) async throws {
        guard case .verified(let transaction) = result,
              ids.contains(transaction.productID), transaction.environment == .sandbox,
              transaction.appAccountToken == account,
              transaction.productType == expectedType(for: transaction.productID) else { throw PurchaseError.unverified }
        guard let persist, boundAccount == account else { throw PurchaseError.notConfigured }
        let expected = bindingGeneration
        try Task.checkCancellation()
        try await persist(result.jwsRepresentation)
        guard bindingGeneration == expected, boundAccount == account else { throw CancellationError() }
        try Task.checkCancellation()
        if finish { await transaction.finish() }
    }
    private func expectedType(for id: String) -> Product.ProductType {
        id.hasPrefix("ouchi.tip.") ? .consumable : .autoRenewable
    }
    func markRetryNeeded() { needsRetry = true }
    func load() async throws { products = try await Product.products(for: ids) }
    func purchase(_ product: Product, account: UUID) async throws -> Outcome {
        guard ids.contains(product.id), product.type == expectedType(for: product.id), persist != nil, boundAccount == account else { throw PurchaseError.notConfigured }
        let expected = bindingGeneration
        guard case .verified(let app) = try await AppTransaction.shared, app.environment == .sandbox,
              app.bundleID == Bundle.main.bundleIdentifier else { throw PurchaseError.unverified }
        guard expected == bindingGeneration, boundAccount == account, persist != nil else { throw CancellationError() }
        switch try await product.purchase(options: [.appAccountToken(account)]) {
        case .success(let result):
            guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
            try await deliver(result, account: account, finish: true)
            return .saved
        case .pending: return .pending
        case .userCancelled: return .cancelled
        @unknown default: throw PurchaseError.unverified
        }
    }
    func restore(account: UUID) async throws {
        guard persist != nil, boundAccount == account else { throw PurchaseError.notConfigured }
        let expected = bindingGeneration
        try await AppStore.sync()
        guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
        for await result in Transaction.currentEntitlements {
            guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
            guard case .verified(let transaction) = result,
                  ids.contains(transaction.productID), transaction.environment == .sandbox,
                  transaction.appAccountToken == account,
              transaction.productType == expectedType(for: transaction.productID) else { continue }
            try await deliver(result, account: account, finish: false)
        }
    }
    func observeUnfinished(account: UUID) async throws {
        guard persist != nil, boundAccount == account else { throw PurchaseError.notConfigured }
        let expected = bindingGeneration
        for await result in Transaction.unfinished {
            guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
            guard case .verified(let transaction) = result,
                  ids.contains(transaction.productID), transaction.environment == .sandbox,
                  transaction.appAccountToken == account,
              transaction.productType == expectedType(for: transaction.productID) else { continue }
            try await deliver(result, account: account, finish: true)
        }
        guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
        needsRetry = false
    }
    enum PurchaseError: Error { case notConfigured, unverified }
}
