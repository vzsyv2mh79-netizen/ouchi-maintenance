import Foundation
import AppKit
import XCTest
import StoreKitTest
import StoreKit

// Dedicated test bundle only. Do not include in OuchiMaintenance app sources.
// Local StoreKit fixtures only; never Apple-signed Sandbox/server rights evidence.
final class LocalStoreKitCatalogTests: XCTestCase {
    enum FixtureError: Error { case wrongEnvironment, missingTransaction }
    @MainActor private func disposableSession() async throws -> SKTestSession {
        let bundle = Bundle(for: Self.self)
        guard bundle.bundleIdentifier == "dev.ouchi.review.storekit.catalog.tests",
              Bundle.main.bundleIdentifier == "dev.ouchi.review.storekit.catalog" else { throw FixtureError.wrongEnvironment }
        let url = try XCTUnwrap(bundle.url(forResource: "OuchiLocal", withExtension: "storekit"))
        let session = try SKTestSession(contentsOf: url)
        guard case .verified(let app) = try await AppTransaction.shared,
              app.environment == .xcode, app.bundleID == Bundle.main.bundleIdentifier else { throw FixtureError.wrongEnvironment }
        session.disableDialogs = true
        // Only this dedicated local app's disposable journal, after .xcode proof.
        session.clearTransactions()
        return session
    }
    @MainActor private func latest(_ id: String, phase: String, accepting predicate: (Transaction) -> Bool) async throws -> Transaction {
        for _ in 0..<100 {
            if let result = await Transaction.latest(for: id) {
                switch result {
                case .verified(let transaction):
                    guard transaction.environment == .xcode else { throw FixtureError.wrongEnvironment }
                    if predicate(transaction) { return transaction }
                case .unverified(_, let error): throw error
                }
            }
            try await Task.sleep(for: .milliseconds(50))
        }
        throw NSError(domain: "OuchiLocalStoreKitFixture", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "No matching local transaction after " + phase])
    }
    @MainActor private func unfinishedContains(_ id: UInt64) async throws -> Bool {
        for _ in 0..<100 {
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, transaction.id == id {
                    guard transaction.environment == .xcode else { throw FixtureError.wrongEnvironment }
                    return true
                }
            }
            try await Task.sleep(for: .milliseconds(50))
        }
        return false
    }
    @MainActor private func purchaseLocal(_ id: String, account: UUID) async throws -> Transaction {
        guard case .verified(let app) = try await AppTransaction.shared, app.environment == .xcode,
              app.bundleID == "dev.ouchi.review.storekit.catalog" else { throw FixtureError.wrongEnvironment }
        let products = try await Product.products(for: [id])
        let product = try XCTUnwrap(products.first)
        let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 240, height: 160),
                              styleMask: [.titled], backing: .buffered, defer: false)
        window.title = "おうちメンテ・ローカル購入テスト"
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        defer { window.close() }
        let result = try await product.purchase(confirmIn: window, options: [.appAccountToken(account)])
        guard case .success(.verified(let transaction)) = result, transaction.environment == .xcode else {
            throw FixtureError.missingTransaction
        }
        return transaction
    }
    func testLocalCatalogLoadsWithoutPurchase() async throws {
        let bundle = Bundle(for: Self.self)
        guard bundle.bundleIdentifier == "dev.ouchi.review.storekit.catalog.tests" else {
            XCTFail("Run only in the dedicated local StoreKit test bundle")
            return
        }
        let url = try XCTUnwrap(bundle.url(forResource: "OuchiLocal", withExtension: "storekit"))
        let session = try SKTestSession(contentsOf: url)
        // Session construction can succeed while its service logs a save error.
        // Product retrieval must prove the catalog is actually active.
        let expected: Set<String> = ["ouchi.premium.monthly", "ouchi.premium.annual", "ouchi.tip.small", "ouchi.tip.medium", "ouchi.tip.large"]
        let products = try await Product.products(for: expected)
        XCTAssertEqual(Set(products.map(\.id)), expected)
        let byID = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
        let monthly = try XCTUnwrap(byID["ouchi.premium.monthly"])
        let annual = try XCTUnwrap(byID["ouchi.premium.annual"])
        XCTAssertEqual(monthly.type, .autoRenewable)
        XCTAssertEqual(annual.type, .autoRenewable)
        XCTAssertEqual(monthly.subscription?.subscriptionPeriod.unit, .month)
        XCTAssertEqual(annual.subscription?.subscriptionPeriod.unit, .year)
        XCTAssertEqual(monthly.subscription?.subscriptionPeriod.value, 1)
        XCTAssertEqual(annual.subscription?.subscriptionPeriod.value, 1)
        let group = try XCTUnwrap(monthly.subscription?.subscriptionGroupID)
        XCTAssertFalse(group.isEmpty)
        XCTAssertEqual(group, annual.subscription?.subscriptionGroupID)
        for (id, price) in [("ouchi.tip.small",100),("ouchi.tip.medium",300),("ouchi.tip.large",1000)] {
            let tip = try XCTUnwrap(byID[id])
            XCTAssertEqual(tip.type, .consumable)
            XCTAssertEqual(tip.price, Decimal(price))
            XCTAssertNil(tip.subscription)
        }
        XCTAssertEqual(monthly.price, Decimal(300))
        XCTAssertEqual(annual.price, Decimal(3000))
        withExtendedLifetime(session) {}
        // No buyProduct, clearTransactions, transaction history or rights grants.
    }
    @MainActor func testActualPurchaseManagerLoadsCatalogWithoutRights() async throws {
        let bundle = Bundle(for: Self.self)
        let url = try XCTUnwrap(bundle.url(forResource: "OuchiLocal", withExtension: "storekit"))
        let session = try SKTestSession(contentsOf: url)
        let manager = PurchaseManager()
        try await manager.load()
        XCTAssertEqual(manager.products.count, 5)
        XCTAssertNil(manager.persist)
        XCTAssertFalse(manager.needsRetry)
        withExtendedLifetime(session) {}
        // No observing, purchase, restore, server write or entitlement grant.
    }
    @MainActor func testLocalRenewalExpiryAndRefundMetadata() async throws {
        let session = try await disposableSession()
        let updates = Task { for await _ in Transaction.updates { if Task.isCancelled { break } } }
        defer { updates.cancel() }
        await Task.yield()
        let account = UUID(uuidString: "A1111111-1111-4111-8111-111111111111")!
        session.timeRate = .oneRenewalEveryTwoSeconds
        let monthly = try await purchaseLocal("ouchi.premium.monthly", account: account)
        XCTAssertEqual(monthly.environment, .xcode)
        XCTAssertEqual(monthly.appAccountToken, account)
        XCTAssertEqual(monthly.productType, .autoRenewable)
        XCTAssertNotNil(monthly.expirationDate)
        await monthly.finish() // fixture-only; no application persistence acknowledgement
        try session.forceRenewalOfSubscription(productIdentifier: monthly.productID)
        print("LOCAL_RENEWAL_FIXTURE_COUNT", session.allTransactions().count)
        let renewed = try await latest(monthly.productID, phase: "forced renewal") { $0.id != monthly.id }
        XCTAssertEqual(renewed.originalID, monthly.originalID)
        XCTAssertEqual(renewed.appAccountToken, account)
        XCTAssertGreaterThan(try XCTUnwrap(renewed.expirationDate), try XCTUnwrap(monthly.expirationDate))
        try session.expireSubscription(productIdentifier: monthly.productID)
        let monthlyProducts = try await Product.products(for: [monthly.productID])
        let info = try XCTUnwrap(monthlyProducts.first?.subscription)
        var expiredStatusObserved = false
        for _ in 0..<100 {
            if try await info.status.contains(where: { $0.state == .expired }) { expiredStatusObserved = true; break }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertTrue(expiredStatusObserved, "forced expiration must appear in current subscription status")
        session.timeRate = .realTime
        let annual = try await purchaseLocal("ouchi.premium.annual", account: account)
        XCTAssertEqual(annual.environment, .xcode)
        try session.refundTransaction(identifier: XCTUnwrap(UInt(exactly: annual.id)))
        let refunded = try await latest(annual.productID, phase: "refund") { $0.revocationDate != nil }
        XCTAssertEqual(refunded.id, annual.id)
        XCTAssertNotNil(refunded.revocationDate)
        withExtendedLifetime(session) {}
        // This verifies local metadata only, not server entitlement/expiry handling.
    }
    @MainActor func testActualManagerRefusesLocalTransactionWithoutFinishing() async throws {
        let session = try await disposableSession()
        let updates = Task { for await _ in Transaction.updates { if Task.isCancelled { break } } }
        defer { updates.cancel() }
        await Task.yield()
        let account = UUID(uuidString: "B2222222-2222-4222-8222-222222222222")!
        let tip = try await purchaseLocal("ouchi.tip.small", account: account)
        XCTAssertEqual(tip.environment, .xcode)
        XCTAssertEqual(tip.productType, .consumable)
        XCTAssertNil(tip.expirationDate)
        let unfinishedBeforeManager = try await unfinishedContains(tip.id)
        XCTAssertTrue(unfinishedBeforeManager, "fixture must establish unfinished input before testing manager")
        let manager = PurchaseManager(environment: .sandbox)
        var persistenceCalls = 0
        manager.persist = { _ in persistenceCalls += 1 }
        manager.startObserving(account: account)
        defer { manager.stopObserving() }
        try await manager.load()
        try await manager.observeUnfinished(account: account)
        XCTAssertEqual(persistenceCalls, 0, "local .xcode transaction must not be submitted as Sandbox")
        let product = try XCTUnwrap(manager.products.first { $0.id == tip.productID })
        do {
            _ = try await manager.purchase(product, account: account)
            XCTFail("Sandbox manager accepted Xcode app identity")
        } catch PurchaseManager.PurchaseError.unverified { }
        XCTAssertEqual(persistenceCalls, 0)
        let stillUnfinished = try await unfinishedContains(tip.id)
        XCTAssertTrue(stillUnfinished, "refused local transaction must remain unfinished")
        await tip.finish() // owned fixture only, after the refusal assertion
        withExtendedLifetime(session) {}
    }
}
