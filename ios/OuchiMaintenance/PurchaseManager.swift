import Foundation
import Combine
import StoreKit
import OuchiCore
#if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
import AppKit
#endif

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
    #if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
    // Dedicated hosted-test module only. Shipping targets never define this flag.
    // No local entitlement: the test persistence callback is still required.
    private var localFixtureWindow: NSWindow?
    convenience init(localStoreKitFixtureWindow window: NSWindow) throws {
        self.init(environment: .sandbox)
        guard Bundle.main.bundleIdentifier == "dev.ouchi.review.storekit.catalog",
              Bundle(for: PurchaseManager.self).bundleIdentifier == "dev.ouchi.review.storekit.catalog.tests" else {
            throw PurchaseError.notConfigured
        }
        localFixtureWindow = window
    }
    #endif
    private var storeEnvironment: AppStore.Environment {
        #if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
        if localFixtureWindow != nil { return .xcode }
        #endif
        return environment == .sandbox ? .sandbox : .production
    }
    @Published private(set) var products: [Product] = []
    @Published private(set) var needsRetry = false
    private var observer: Task<Void, Never>?
    private var bindingGeneration = 0
    private var boundAccount: UUID?
    private var purchaseReservation: UUID?
    // Prompt suppression only, never premium rights. Bridges StoreKit propagation
    // after a verified purchase; cleared with the authentication binding.
    private var verifiedSubscriptionPromptGuard: Transaction?
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
    func stopObserving() { bindingGeneration += 1; boundAccount = nil; verifiedSubscriptionPromptGuard = nil; observer?.cancel(); observer = nil }
    private func rememberSubscriptionForPrompt(_ transaction: Transaction) {
        guard transaction.productType == .autoRenewable else { return }
        if let current = verifiedSubscriptionPromptGuard,
           current.originalID == transaction.originalID, current.purchaseDate > transaction.purchaseDate { return }
        if transaction.revocationDate != nil || (transaction.expirationDate ?? .distantPast) <= Date() {
            if verifiedSubscriptionPromptGuard?.originalID == transaction.originalID { verifiedSubscriptionPromptGuard = nil }
        } else { verifiedSubscriptionPromptGuard = transaction }
    }
    private func deliver(_ result: VerificationResult<Transaction>, account: UUID, finish: Bool) async throws {
        guard case .verified(let transaction) = result,
              ids.contains(transaction.productID), transaction.environment == storeEnvironment,
              transaction.appAccountToken == account,
              transaction.productType == expectedType(for: transaction.productID) else { throw PurchaseError.unverified }
        guard let persist, boundAccount == account else { throw PurchaseError.notConfigured }
        let expected = bindingGeneration
        try Task.checkCancellation()
        rememberSubscriptionForPrompt(transaction)
        try await persist(result.jwsRepresentation)
        guard bindingGeneration == expected, boundAccount == account else { throw CancellationError() }
        try Task.checkCancellation()
        if finish { await transaction.finish() }
    }
    private func expectedType(for id: String) -> Product.ProductType {
        id.hasPrefix("ouchi.tip.") ? .consumable : .autoRenewable
    }
    // Evidence collection only. The server must verify both signatures, consume a
    // fresh App Attest challenge, reserve ownership and confirm persistence.
    // No externally supplied JWS or device identifier can enter this path.
    struct SandboxRestoreEvidence: Sendable {
        let signedAppTransaction: String
        let signedTransaction: String
        let originalTransactionID: String
        let appTransactionID: String
    }
    func sandboxRestoreEvidence(account: UUID, originalTransactionID: String) async throws -> SandboxRestoreEvidence {
        guard environment == .sandbox, storeEnvironment == .sandbox,
              persist != nil, boundAccount == account,
              !originalTransactionID.isEmpty, originalTransactionID.utf8.count <= 128,
              originalTransactionID.utf8.allSatisfy({ (48...57).contains($0) }),
              let bundleID = Bundle.main.bundleIdentifier,
              let deviceID = AppStore.deviceVerificationID else { throw PurchaseError.notConfigured }
        let expected = bindingGeneration
        try Task.checkCancellation()
        let appResult = try await AppTransaction.shared
        guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
        try Task.checkCancellation()
        guard case .verified(let app) = appResult,
              app.environment == .sandbox, app.bundleID == bundleID,
              let appJSON = try JSONSerialization.jsonObject(with: app.jsonRepresentation) as? [String: Any],
              appJSON["appRevocationDate"] == nil || appJSON["appRevocationDate"] is NSNull,
              !app.appTransactionID.isEmpty,
              StoreDeviceVerification.matches(nonce: app.deviceVerificationNonce,
                  deviceID: deviceID, signedDigest: app.deviceVerification),
              !appResult.jwsRepresentation.isEmpty,
              appResult.jwsRepresentation.utf8.count <= 131_072 else { throw PurchaseError.unverified }
        var found: (SandboxRestoreEvidence, Date)?
        for await result in Transaction.currentEntitlements {
            guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
            try Task.checkCancellation()
            guard case .verified(let transaction) = result else { throw PurchaseError.unverified }
            guard String(transaction.originalID) == originalTransactionID else { continue }
            guard found == nil, transaction.environment == .sandbox,
                  ["ouchi.premium.monthly", "ouchi.premium.annual"].contains(transaction.productID),
                  transaction.productType == .autoRenewable,
                  transaction.ownershipType == .purchased,
                  transaction.appTransactionID == app.appTransactionID,
                  transaction.revocationDate == nil, !transaction.isUpgraded,
                  let expiry = transaction.expirationDate, expiry > Date(),
                  StoreDeviceVerification.matches(nonce: transaction.deviceVerificationNonce,
                      deviceID: deviceID, signedDigest: transaction.deviceVerification),
                  !result.jwsRepresentation.isEmpty,
                  result.jwsRepresentation.utf8.count <= 131_072 else { throw PurchaseError.unverified }
            found = (.init(signedAppTransaction: appResult.jwsRepresentation,
                signedTransaction: result.jwsRepresentation,
                originalTransactionID: String(transaction.originalID),
                appTransactionID: app.appTransactionID), expiry)
        }
        guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
        try Task.checkCancellation()
        guard AppStore.deviceVerificationID == deviceID,
              let found, found.1 > Date() else { throw PurchaseError.unverified }
        // An old appAccountToken is not permission to transfer this subscription.
        // Keep the exact signed pair for the independent server authorization.
        return found.0
    }
    // Prepared orchestration boundary. No UI dispatches this path yet. A future
    // authenticated API supplies the exact stored challenge, never a client nonce.
    func sandboxRestoreAssertion(account: UUID, originalTransactionID: String,
        registration: AppAttestRegistrationScope, requestID: UUID,
        fetchChallenge: @Sendable (SandboxRestoreEvidence, RestoreAssertionScope) async throws -> Data,
        validateCurrentScope: @Sendable () async throws -> Void,
        device: RestoreAssertionDeviceService = .init(),
        now: @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) async throws -> (SandboxRestoreEvidence, RestoreAssertionChallenge, Data) {
        guard registration.epochID == account, boundAccount == account,
              let bundleID = Bundle.main.bundleIdentifier,
              registration.appID.hasSuffix("." + bundleID) else { throw PurchaseError.notConfigured }
        let generation = bindingGeneration
        try Task.checkCancellation()
        try await validateCurrentScope()
        let evidence = try await sandboxRestoreEvidence(account: account, originalTransactionID: originalTransactionID)
        guard generation == bindingGeneration, boundAccount == account else { throw CancellationError() }
        let scope = RestoreAssertionScope(userID: registration.userID, sessionID: registration.sessionID,
            epochID: registration.epochID, keyID: registration.keyID, appID: registration.appID,
            environment: registration.environment, requestID: requestID,
            proofSHA256: try RestoreAssertionChallenge.pairDigest(signedApp: evidence.signedAppTransaction,
                signedTransaction: evidence.signedTransaction))
        try await validateCurrentScope()
        try Task.checkCancellation()
        let bytes = try await fetchChallenge(evidence, scope)
        guard generation == bindingGeneration, boundAccount == account else { throw CancellationError() }
        try Task.checkCancellation()
        let challenge = try RestoreAssertionChallenge.parse(canonicalClientData: bytes, expected: scope, nowMilliseconds: now())
        let assertion = try await device.generate(challenge: challenge, scope: scope,
            validateCurrentScope: validateCurrentScope, now: now)
        guard generation == bindingGeneration, boundAccount == account else { throw CancellationError() }
        try Task.checkCancellation()
        return (evidence, challenge, assertion)
    }
    // Fixed authenticated HTTP path, still not connected to a UI action. The
    // API's session provider must come from the current enrollment/registered key.
    func sandboxRestoreAssertion(captured: AppAttestRegistrationSession, originalTransactionID: String,
        requestID: UUID, api: RestoreChallengeAPI,
        device: RestoreAssertionDeviceService = .init()) async throws -> (SandboxRestoreEvidence, RestoreAssertionChallenge, Data) {
        try await sandboxRestoreAssertion(account: captured.scope.epochID, originalTransactionID: originalTransactionID,
            registration: captured.scope, requestID: requestID,
            fetchChallenge: { evidence, _ in
                try await api.challenge(captured: captured, requestID: requestID,
                    signedAppTransaction: evidence.signedAppTransaction,
                    signedTransaction: evidence.signedTransaction).clientData
            }, validateCurrentScope: { try await api.validate(captured) }, device: device)
    }
    // Persist the exact own-device evidence before a future commit transport.
    // Unknown outcome must resume status using these bytes, never a new proof.
    func stageSandboxRestore(captured: AppAttestRegistrationSession, originalTransactionID: String,
                             requestID: UUID, api: RestoreChallengeAPI, storage: PendingRestoreStorage,
                             device: RestoreAssertionDeviceService = .init()) async throws -> PendingRestore {
        let generation = bindingGeneration
        let (evidence,challenge,assertion) = try await sandboxRestoreAssertion(captured:captured,
            originalTransactionID:originalTransactionID,requestID:requestID,api:api,device:device)
        try await api.validate(captured)
        guard bindingGeneration == generation, boundAccount == captured.scope.epochID else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        let pending = try PendingRestore(scope:captured.scope,challenge:challenge,
            signedAppTransaction:evidence.signedAppTransaction,signedTransaction:evidence.signedTransaction,
            assertion:assertion,nowMilliseconds:Int64(Date().timeIntervalSince1970 * 1000))
        try await storage.stage(pending,nowMilliseconds:Int64(Date().timeIntervalSince1970 * 1000))
        try await api.validate(captured)
        guard bindingGeneration == generation, boundAccount == captured.scope.epochID else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        return pending
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
        guard purchaseReservation == nil else { throw PurchaseError.purchaseInProgress }
        let reservation = UUID()
        purchaseReservation = reservation
        defer { if purchaseReservation == reservation { purchaseReservation = nil } }
        let expected = bindingGeneration
        guard case .verified(let app) = try await AppTransaction.shared, app.environment == storeEnvironment,
              app.bundleID == Bundle.main.bundleIdentifier else { throw PurchaseError.unverified }
        guard expected == bindingGeneration, boundAccount == account, persist != nil else { throw CancellationError() }
        if product.type == .autoRenewable {
            if let recent = verifiedSubscriptionPromptGuard,
               recent.revocationDate == nil, (recent.expirationDate ?? .distantPast) > Date(),
               !app.appTransactionID.isEmpty, recent.appTransactionID == app.appTransactionID {
                if recent.appAccountToken != account { throw PurchaseError.subscriptionBoundElsewhere }
                throw PurchaseError.subscriptionAlreadyActive
            }
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
        let result: Product.PurchaseResult
        #if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
        if let window = localFixtureWindow {
            guard #available(macOS 15.2, *) else { throw PurchaseError.notConfigured }
            result = try await product.purchase(confirmIn: window, options: [.appAccountToken(account)])
        } else {
            result = try await product.purchase(options: [.appAccountToken(account)])
        }
        #else
        result = try await product.purchase(options: [.appAccountToken(account)])
        #endif
        guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
        try Task.checkCancellation()
        switch result {
        case .success(let result):
            guard expected == bindingGeneration, boundAccount == account else { throw CancellationError() }
            try await deliver(result, account: account, finish: true)
            // A verified success can replay an already revoked transaction.
            // Persist that state, but do not report a current purchase as saved.
            guard case .verified(let transaction) = result,
                  transaction.revocationDate == nil, !transaction.isUpgraded,
                  transaction.productType != .autoRenewable ||
                    (transaction.expirationDate ?? .distantPast) > Date() else {
                throw PurchaseError.purchaseNotActive
            }
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
    enum PurchaseError: Error { case notConfigured, unverified, subscriptionAlreadyActive, subscriptionBoundElsewhere, purchaseInProgress, purchaseNotActive }
}
