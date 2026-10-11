import Foundation
import Combine
import StoreKit
import OuchiCore

// Server persistence must succeed before finish. Default remains Sandbox; production sales are not wired.
@MainActor
final class PurchaseManager: ObservableObject {
    enum Outcome { case saved, pending, cancelled }
    struct RestoreOutcome: Sendable {
        let savedTransactions: Int
        let otherAccountSubscriptionFound: Bool
    }
    let environment: BillingEnvironment
    init(environment: BillingEnvironment = .sandbox) { self.environment = environment }
    private var storeEnvironment: AppStore.Environment {
        environment == .sandbox ? .sandbox : .production
    }
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
              ids.contains(transaction.productID), transaction.environment == storeEnvironment,
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
    private func descriptor(_ product: Product) -> StoreProductDescriptor {
        let kind: StoreProductDescriptor.Kind = product.type == .consumable ? .consumable : product.type == .autoRenewable ? .autoRenewable : .other
        var period: StoreProductDescriptor.Period?
        if let unit=product.subscription?.subscriptionPeriod.unit {
            switch unit {
            case .month: period = .month
            case .year: period = .year
            default: period = .other
            }
        }
        return .init(id:product.id,kind:kind,period:period,periodValue:product.subscription?.subscriptionPeriod.value,subscriptionGroupID:product.subscription?.subscriptionGroupID)
    }
    func load() async throws {
        try Task.checkCancellation()
        // A failed reload must not leave previously accepted purchase options active.
        products = []
        let loaded = try await Product.products(for: ids)
        try Task.checkCancellation()
        let eligible=try StoreProductCatalogPolicy.eligibleProductIDs(loaded.map(descriptor))
        products = loaded.filter { eligible.contains($0.id) }
    }
    func purchase(_ product: Product, account: UUID) async throws -> Outcome {
        guard ids.contains(product.id), product.type == expectedType(for: product.id),
              products.contains(where: { descriptor($0)==descriptor(product) }),
              persist != nil, boundAccount == account else { throw PurchaseError.notConfigured }
        let expected = bindingGeneration
        guard case .verified(let app) = try await AppTransaction.shared, app.environment == storeEnvironment,
              app.bundleID == Bundle.main.bundleIdentifier else { throw PurchaseError.unverified }
        guard expected == bindingGeneration, boundAccount == account, persist != nil else { throw CancellationError() }
        if product.type == .autoRenewable {
            // StoreKit includes subscribed and grace-period subscriptions here.
            // This prevents a second purchase prompt; it never grants app rights.
            for await entitlement in Transaction.currentEntitlements {
                guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
                try Task.checkCancellation()
                guard case .verified(let transaction) = entitlement else { throw PurchaseError.unverified }
                guard ids.contains(transaction.productID),
                      transaction.environment == storeEnvironment,
                      transaction.productType == .autoRenewable else { continue }
                guard !app.appTransactionID.isEmpty,
                      transaction.appTransactionID == app.appTransactionID else { throw PurchaseError.unverified }
                if transaction.appAccountToken != account { throw PurchaseError.subscriptionBoundElsewhere }
                throw PurchaseError.subscriptionAlreadyActive
            }
        }
        guard expected == bindingGeneration, boundAccount == account, persist != nil else { throw CancellationError() }
        try Task.checkCancellation()
        let result = try await product.purchase(options: [.appAccountToken(account)])
        guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
        try Task.checkCancellation()
        switch result {
        case .success(let result):
            guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
            try await deliver(result, account: account, finish: true)
            return .saved
        case .pending: return .pending
        case .userCancelled: return .cancelled
        @unknown default: throw PurchaseError.unverified
        }
    }
    func restore(account: UUID) async throws -> RestoreOutcome {
        guard persist != nil, boundAccount == account else { throw PurchaseError.notConfigured }
        let expected = bindingGeneration
        try await AppStore.sync()
        guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
        try Task.checkCancellation()
        guard case .verified(let app) = try await AppTransaction.shared,
              app.environment == storeEnvironment,
              app.bundleID == Bundle.main.bundleIdentifier else { throw PurchaseError.unverified }
        guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
        var saved = 0
        var otherAccountSubscription = false
        // Include expired/revoked history; the server decides current rights from verified dates.
        for await result in Transaction.all {
            guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
            try Task.checkCancellation()
            guard case .verified(let transaction) = result else { throw PurchaseError.unverified }
            guard ids.contains(transaction.productID), transaction.environment == storeEnvironment else { continue }
            guard transaction.productType == expectedType(for: transaction.productID) else { throw PurchaseError.unverified }
            if transaction.productType == .autoRenewable {
                // Matching signed store identity is consistency evidence only.
                // Never rebind a different enrollment's purchase from this path.
                guard !app.appTransactionID.isEmpty,
                      transaction.appTransactionID == app.appTransactionID else { throw PurchaseError.unverified }
                guard transaction.ownershipType == .purchased else { throw PurchaseError.unverified }
                if transaction.appAccountToken != account {
                    otherAccountSubscription = true
                    continue
                }
            }
            guard transaction.appAccountToken == account else { continue }
            // History import never finishes or redelivers a consumable benefit.
            try await deliver(result, account: account, finish: false)
            saved += 1
        }
        guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
        try Task.checkCancellation()
        return RestoreOutcome(savedTransactions: saved, otherAccountSubscriptionFound: otherAccountSubscription)
    }
    func observeUnfinished(account: UUID) async throws {
        guard persist != nil, boundAccount == account else { throw PurchaseError.notConfigured }
        let expected = bindingGeneration
        for await result in Transaction.unfinished {
            guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
            guard case .verified(let transaction) = result,
                  ids.contains(transaction.productID), transaction.environment == storeEnvironment,
                  transaction.appAccountToken == account,
              transaction.productType == expectedType(for: transaction.productID) else { continue }
            try await deliver(result, account: account, finish: true)
        }
        guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
        try Task.checkCancellation()
        needsRetry = false
    }
    enum PurchaseError: Error { case notConfigured, unverified, subscriptionAlreadyActive, subscriptionBoundElsewhere }
}
