import Foundation
import AppKit
import XCTest
import StoreKitTest
import SwiftUI
import OuchiCore

private actor ReleaseBillingHTTPFixture {
    static let epoch = UUID(uuidString: "6CCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC")!
    private var premium = false
    private var fail = false
    private var block = false
    private var gate: CheckedContinuation<Void, Never>?
    private(set) var blocked = false
    private(set) var submissions = 0
    func setPremium(_ value: Bool) { premium = value }
    func failReads() { fail = true }
    func blockNextRead() { block = true }
    func resumeRead() { gate?.resume(); gate = nil }
    func reply(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        guard let url = request.url, url.scheme == "https", url.host == "ouchi-maintenance.vercel.app",
              request.value(forHTTPHeaderField: "Authorization") == "Bearer " + NativeReviewFixture.token else { throw CloudError.invalidInput }
        let body: [String: Any]
        switch (request.httpMethod, url.path) {
        case ("GET", "/api/billing/entitlement"):
            if block {
                block = false; blocked = true
                await withCheckedContinuation { gate = $0 }
            }
            if fail { throw URLError(.notConnectedToInternet) }
            var rights: [String: Any] = ["plan": premium ? "premium" : "free", "salesEnabled": false,
                "environment": "Sandbox", "purchaseAccountToken": Self.epoch.uuidString]
            if premium {
                rights["productId"] = "ouchi.premium.monthly"
                rights["expiresAt"] = Date().addingTimeInterval(3600).timeIntervalSince1970 * 1000
            }
            body = rights
        case ("POST", "/api/billing/transactions"):
            let input = try JSONDecoder().decode([String: String].self, from: request.httpBody ?? Data())
            guard input.count == 1, input["signedTransaction"]?.split(separator: ".").count == 3 else { throw CloudError.invalidInput }
            submissions += 1; body = ["saved": true, "environment": "Sandbox"]
        default: throw CloudError.unavailable
        }
        return (try JSONSerialization.data(withJSONObject: body), HTTPURLResponse(url: url, statusCode: 200,
            httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
        // Mock acknowledgement, not Apple JWS verification or a paid-right grant.
    }
}
import StoreKit

// Dedicated test bundle only. Do not include in OuchiMaintenance app sources.
// Local StoreKit fixtures only; never Apple-signed Sandbox/server rights evidence.
final class LocalStoreKitCatalogTests: XCTestCase {
    enum FixtureError: Error { case wrongEnvironment, missingTransaction }
    // StoreKit testing controls one app-wide service. Retain one owner for this
    // dedicated host rather than interleave construction/destruction of sessions.
    @MainActor private static var catalogSession: SKTestSession?
    @MainActor private func sharedCatalogSession() async throws -> SKTestSession {
        let bundle = Bundle(for: Self.self)
        guard bundle.bundleIdentifier == "dev.ouchi.review.storekit.catalog.tests",
              Bundle.main.bundleIdentifier == "dev.ouchi.review.storekit.catalog" else { throw FixtureError.wrongEnvironment }
        let url = try XCTUnwrap(bundle.url(forResource: "OuchiLocal", withExtension: "storekit"))
        let session = try Self.catalogSession ?? SKTestSession(contentsOf: url)
        guard case .verified(let app) = try await AppTransaction.shared,
              app.environment == .xcode, app.bundleID == Bundle.main.bundleIdentifier else { throw FixtureError.wrongEnvironment }
        Self.catalogSession = session
        return session
    }
    @MainActor private func disposableSession() async throws -> SKTestSession {
        let session = try await sharedCatalogSession()
        session.resetToDefaultState()
        session.disableDialogs = true
        // Only this dedicated local app's disposable journal, after .xcode proof.
        session.clearTransactions()
        // Journal mutation and the StoreKit receipt view can settle separately.
        // Do not begin the next case while a previous case's purchase/refund is
        // still visible through the SDK, even when the journal is already empty.
        let ids = ["ouchi.premium.monthly", "ouchi.premium.annual", "ouchi.tip.small", "ouchi.tip.medium", "ouchi.tip.large"]
        for attempt in 0..<100 {
            var cleared = session.allTransactions().isEmpty
            for id in ids {
                if await StoreKit.Transaction.latest(for: id) != nil { cleared = false }
            }
            if cleared {
                if attempt > 0 { print("LOCAL_RECEIPT_RESET_WAIT_ROUNDS", attempt) }
                return session
            }
            try await Task.sleep(for: .milliseconds(50))
        }
        throw NSError(domain: "OuchiLocalStoreKitFixture", code: 2,
                      userInfo: [NSLocalizedDescriptionKey: "Disposable journal and StoreKit receipt reset were not both confirmed"])
    }
    @MainActor private func latest(_ id: String, phase: String, accepting predicate: (StoreKit.Transaction) -> Bool) async throws -> StoreKit.Transaction {
        for _ in 0..<100 {
            if let result = await StoreKit.Transaction.latest(for: id) {
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
            for await result in StoreKit.Transaction.unfinished {
                if case .verified(let transaction) = result, transaction.id == id {
                    guard transaction.environment == .xcode else { throw FixtureError.wrongEnvironment }
                    return true
                }
            }
            try await Task.sleep(for: .milliseconds(50))
        }
        return false
    }
    @MainActor private func purchaseLocal(_ id: String, account: UUID) async throws -> StoreKit.Transaction {
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
    @MainActor private func fixtureWindow() -> NSWindow {
        let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 240, height: 160),
                              styleMask: [.titled], backing: .buffered, defer: false)
        window.title = "おうちメンテ・購入コード検証"
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        return window
    }
    @MainActor private func releaseStore(_ fixture: ReleaseBillingHTTPFixture, window: NSWindow, allowPurchases: Bool = false) async throws -> NativeStore {
        let householdFixture = NativeReviewFixture()
        let configuration = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!,
                                                   publishableKey: "sb_publishable_synthetic_review_only")
        let household = HouseholdAPI(config: configuration, transport: { try await householdFixture.reply($0) })
        let session = SessionController(api: household, storage: NativeReviewSessionStorage(try NativeReviewFixture.sessionBytes()))
        let restored = try await session.restore()
        XCTAssertTrue(restored)
        let billing = BillingAPI(environment: .sandbox, transport: { try await fixture.reply($0) })
        return try NativeStore(localStoreKitWindow: window, household: household, session: session, billing: billing,
                               account: NativeReviewFixture.account, allowPurchases: allowPurchases)
    }
    @MainActor func testReleaseControllerClearsRightsOnReadFailure() async throws {
        let session = try await disposableSession(), window = fixtureWindow(), fixture = ReleaseBillingHTTPFixture()
        defer { window.close() }
        await fixture.setPremium(true)
        let store = try await releaseStore(fixture, window: window)
        defer { store.releasePurchases.stopObserving() }
        await store.loadReleasePurchaseState()
        XCTAssertTrue(store.releaseEntitlement?.premiumIsCurrent(expectedEnvironment: .sandbox) == true)
        await fixture.failReads()
        await store.loadReleasePurchaseState()
        XCTAssertNil(store.releaseEntitlement, "failed verification must not retain an old premium display")
        XCTAssertTrue(store.releasePurchases.needsRetry)
        XCTAssertFalse(store.busy)
        withExtendedLifetime(session) {}
    }
    @MainActor func testReleaseControllerDiscardsDelayedRightsAfterBindingReplacement() async throws {
        let session = try await disposableSession(), window = fixtureWindow(), fixture = ReleaseBillingHTTPFixture()
        defer { window.close() }
        await fixture.setPremium(true); await fixture.blockNextRead()
        let store = try await releaseStore(fixture, window: window)
        defer { store.releasePurchases.stopObserving() }
        let request = Task { await store.loadReleasePurchaseState() }
        for _ in 0..<200 {
            if await fixture.blocked { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        let blocked = await fixture.blocked
        XCTAssertTrue(blocked)
        try store.replaceReleaseFixtureBinding()
        await fixture.resumeRead(); await request.value
        XCTAssertNil(store.releaseEntitlement)
        XCTAssertNil(store.releasePurchases.persist)
        XCTAssertFalse(store.busy)
        withExtendedLifetime(session) {}
    }
    @MainActor func testReleaseControllerPurchasePersistenceAndRestoreUseIssuedEpoch() async throws {
        XCTAssertEqual(Bundle.main.infoDictionary?["SKIncludeConsumableInAppPurchaseHistory"] as? Bool, true,
                       "host must match shipping consumable-history configuration")
        let session = try await disposableSession(), window = fixtureWindow(), fixture = ReleaseBillingHTTPFixture()
        defer { window.close() }
        let store = try await releaseStore(fixture, window: window, allowPurchases: true)
        defer { store.releasePurchases.stopObserving() }
        XCTAssertFalse(store.releasePurchaseSalesAvailable(subscription: false))
        await store.loadReleasePurchaseState()
        XCTAssertTrue(store.releasePurchaseSalesAvailable(subscription: false))
        XCTAssertEqual(store.releaseEntitlement?.purchaseAccountToken, ReleaseBillingHTTPFixture.epoch)
        XCTAssertEqual(store.releaseEntitlement?.plan, .free)
        await store.loadReleasePurchaseProducts()
        let tip = try XCTUnwrap(store.releasePurchases.products.first { $0.id == "ouchi.tip.small" })
        await store.purchaseReleaseProduct(tip)
        XCTAssertTrue(store.message?.contains("チップの保存") == true)
        XCTAssertTrue(store.message?.contains("実際の請求はありません") == true)
        XCTAssertFalse(store.busy)
        let transaction = try await latest(tip.id, phase: "release controller persistence") { $0.appAccountToken == ReleaseBillingHTTPFixture.epoch }
        let calls = await fixture.submissions
        XCTAssertGreaterThanOrEqual(calls, 1)
        XCTAssertEqual(store.releaseEntitlement?.plan, .free, "a tip must not create premium rights")
        await store.restoreReleasePurchases()
        XCTAssertTrue(store.message?.contains("購入履歴") == true)
        XCTAssertEqual(store.releaseEntitlement?.purchaseAccountToken, ReleaseBillingHTTPFixture.epoch)
        let restoredCalls = await fixture.submissions
        XCTAssertGreaterThan(restoredCalls, calls)
        let unfinished = try await unfinishedContains(transaction.id)
        XCTAssertFalse(unfinished)
        withExtendedLifetime(session) {}
    }
    @MainActor func testReleasePurchaseDisabledGateNeverStartsApplePurchase() async throws {
        let session = try await disposableSession(), window = fixtureWindow(), fixture = ReleaseBillingHTTPFixture()
        defer { window.close() }
        let store = try await releaseStore(fixture, window: window)
        defer { store.releasePurchases.stopObserving() }
        await store.loadReleasePurchaseState()
        // Catalog can be loaded by a caller; that must not bypass the sales gate.
        try await store.releasePurchases.load()
        let tip = try XCTUnwrap(store.releasePurchases.products.first { $0.id == "ouchi.tip.small" })
        await store.purchaseReleaseProduct(tip)
        XCTAssertTrue(session.allTransactions().isEmpty)
        let submissions = await fixture.submissions
        XCTAssertEqual(submissions, 0)
        XCTAssertFalse(store.releaseNewPurchaseConfigured(subscription: false))
    }
    @MainActor func testReleasePurchaseFreshRightsFailureNeverStartsApplePurchase() async throws {
        let session = try await disposableSession(), window = fixtureWindow(), fixture = ReleaseBillingHTTPFixture()
        defer { window.close() }
        let store = try await releaseStore(fixture, window: window, allowPurchases: true)
        defer { store.releasePurchases.stopObserving() }
        await store.loadReleasePurchaseState(); await store.loadReleasePurchaseProducts()
        let tip = try XCTUnwrap(store.releasePurchases.products.first { $0.id == "ouchi.tip.small" })
        await fixture.failReads()
        await store.purchaseReleaseProduct(tip)
        XCTAssertTrue(session.allTransactions().isEmpty)
        let submissions = await fixture.submissions
        XCTAssertEqual(submissions, 0)
        XCTAssertNil(store.releaseEntitlement)
        XCTAssertFalse(store.releasePurchaseSalesAvailable(subscription: false))
        XCTAssertTrue(store.releasePurchases.needsRetry)
        XCTAssertFalse(store.busy)
    }
    @MainActor func testReleaseSubscriptionFreshPremiumPreventsSecondPurchase() async throws {
        let session = try await disposableSession(), window = fixtureWindow(), fixture = ReleaseBillingHTTPFixture()
        defer { window.close() }
        let store = try await releaseStore(fixture, window: window, allowPurchases: true)
        defer { store.releasePurchases.stopObserving() }
        await store.loadReleasePurchaseState(); await store.loadReleasePurchaseProducts()
        let product = try XCTUnwrap(store.releasePurchases.products.first { $0.id == "ouchi.premium.monthly" })
        await fixture.setPremium(true)
        await store.purchaseReleaseProduct(product)
        XCTAssertTrue(session.allTransactions().isEmpty)
        XCTAssertTrue(store.message?.contains("有効な契約") == true)
        XCTAssertTrue(store.releaseEntitlement?.premiumIsCurrent(expectedEnvironment: .sandbox) == true)
        XCTAssertFalse(store.busy)
    }
    @MainActor func testReleasePurchaseBindingChangeDuringFreshReadDoesNotPrompt() async throws {
        let session = try await disposableSession(), window = fixtureWindow(), fixture = ReleaseBillingHTTPFixture()
        defer { window.close() }
        let store = try await releaseStore(fixture, window: window, allowPurchases: true)
        defer { store.releasePurchases.stopObserving() }
        await store.loadReleasePurchaseState(); await store.loadReleasePurchaseProducts()
        let product = try XCTUnwrap(store.releasePurchases.products.first { $0.id == "ouchi.tip.small" })
        await fixture.blockNextRead()
        let request = Task { await store.purchaseReleaseProduct(product) }
        for _ in 0..<200 {
            if await fixture.blocked { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        let blocked = await fixture.blocked
        XCTAssertTrue(blocked)
        try store.replaceReleaseFixtureBinding()
        await fixture.resumeRead(); await request.value
        XCTAssertTrue(session.allTransactions().isEmpty)
        XCTAssertNil(store.releaseEntitlement)
        XCTAssertFalse(store.releasePurchaseSalesAvailable(subscription: false))
        XCTAssertNil(store.releasePurchases.persist)
        XCTAssertFalse(store.busy)
    }
    @MainActor func testReleasePurchaseCancellationDoesNotShowSavedOrRetry() async throws {
        let session = try await disposableSession(), window = fixtureWindow(), fixture = ReleaseBillingHTTPFixture()
        defer { window.close() }
        let store = try await releaseStore(fixture, window: window, allowPurchases: true)
        defer { store.releasePurchases.stopObserving() }
        await store.loadReleasePurchaseState(); await store.loadReleasePurchaseProducts()
        let product = try XCTUnwrap(store.releasePurchases.products.first { $0.id == "ouchi.tip.small" })
        try await session.setSimulatedError(.generic(.userCancelled), forAPI: .purchase)
        await store.purchaseReleaseProduct(product)
        XCTAssertNil(store.message)
        let submissions = await fixture.submissions
        XCTAssertEqual(submissions, 0)
        XCTAssertFalse(store.releasePurchases.needsRetry)
        XCTAssertFalse(store.busy)
    }
    @MainActor func testOptionalActualTipViewRendering() async throws {
        guard Bundle.main.infoDictionary?["OUCHI_LOCAL_TIP_UI_REVIEW"] as? String == "YES" else {
            throw XCTSkip("Opt-in CUA review of actual shipping tip view; no real store/server.")
        }
        let session = try await disposableSession(), window = fixtureWindow(), fixture = ReleaseBillingHTTPFixture()
        defer { window.close() }
        let store = try await releaseStore(fixture, window: window, allowPurchases: true)
        defer { store.releasePurchases.stopObserving() }
        await store.loadReleasePurchaseState(); await store.loadReleasePurchaseProducts()
        XCTAssertEqual(store.releasePurchases.products.filter { $0.type == .consumable }.count, 3)
        XCTAssertTrue(store.releasePurchaseSalesAvailable(subscription: false))
        window.title = "おうちメンテ・チップ画面確認（請求なし）"
        window.setContentSize(NSSize(width: 460, height: 620))
        window.contentView = NSHostingView(rootView:
            Form { ReleaseTipPurchaseSection(purchases: store.releasePurchases) }
                .environmentObject(store).preferredColorScheme(.light).padding())
        window.makeKeyAndOrderFront(nil)
        print("LOCAL_TIP_UI_REVIEW_READY")
        // Opt-in visual review only, not part of routine CI. CUA opens a price
        // confirmation then cancels. Bounded hold; disposable host and mock API.
        try await Task.sleep(for: .seconds(90))
        let submissions = await fixture.submissions
        XCTAssertEqual(submissions, 0, "visual review cancels before local purchase")
        XCTAssertTrue(session.allTransactions().isEmpty)
    }
    @MainActor func testOptionalActualSubscriptionViewRendering() async throws {
        guard Bundle.main.infoDictionary?["OUCHI_LOCAL_TIP_UI_REVIEW"] as? String == "SUBSCRIPTION" else {
            throw XCTSkip("Opt-in CUA review of actual subscription view with synthetic limits; no real store/server.")
        }
        let session = try await disposableSession(), window = fixtureWindow(), fixture = ReleaseBillingHTTPFixture()
        defer { window.close() }
        let store = try await releaseStore(fixture, window: window, allowPurchases: true)
        defer { store.releasePurchases.stopObserving() }
        await store.loadReleasePurchaseState(); await store.loadReleasePurchaseProducts()
        XCTAssertEqual(store.releasePurchases.products.filter { $0.type == .autoRenewable }.count, 2)
        XCTAssertTrue(store.releasePurchaseSalesAvailable(subscription: true))
        let disclosure = try XCTUnwrap(SubscriptionOfferDisclosure(reviewed: true,
            maximumBytes: 100 * 1024 * 1024, maximumFiles: 100, maximumFileBytes: 5 * 1024 * 1024,
            retention: "合成テスト用の保存方針です。正式なサービスの条件ではありません。"))
        window.title = "おうちメンテ・契約画面確認（請求なし）"
        window.setContentSize(NSSize(width: 460, height: 780))
        window.contentView = NSHostingView(rootView: Form {
            Section { Text("表示確認専用・合成の容量と保存方針・実際の請求なし") }
            ReleaseSubscriptionPurchaseSection(purchases: store.releasePurchases, disclosure: disclosure)
        }.environmentObject(store).preferredColorScheme(.light).padding())
        window.makeKeyAndOrderFront(nil)
        print("LOCAL_SUBSCRIPTION_UI_REVIEW_READY")
        try await Task.sleep(for: .seconds(90))
        let submissions = await fixture.submissions
        XCTAssertEqual(submissions, 0, "visual review cancels before local purchase")
        XCTAssertTrue(session.allTransactions().isEmpty)
    }
    private func localClaims(_ jws: String) throws -> [String: Any] {
        let segments = jws.split(separator: ".")
        guard segments.count == 3 else { throw FixtureError.missingTransaction }
        var body = String(segments[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        body += String(repeating: "=", count: (4 - body.count % 4) % 4)
        let data = try XCTUnwrap(Data(base64Encoded: body))
        let claims = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return claims
        // Fixture callback bookkeeping only; SDK verifies local signature.
        // This parser is NOT server-side verification and grants no rights.
    }
    private func localTransactionID(_ jws: String) throws -> String {
        try XCTUnwrap(localClaims(jws)["transactionId"] as? String)
    }
    @MainActor func testActualManagerRestoresRefundAndRefusesRevokedPurchaseReplay() async throws {
        let session = try await disposableSession(), window = fixtureWindow()
        defer { window.close() }
        let account = UUID(uuidString: "39999999-9999-4999-8999-999999999999")!
        let manager = try PurchaseManager(localStoreKitFixtureWindow: window)
        var acknowledged = Set<String>(), revoked = Set<String>()
        manager.persist = { [self] jws in
            let claims = try localClaims(jws)
            let id = try XCTUnwrap(claims["transactionId"] as? String)
            acknowledged.insert(id)
            if claims["revocationDate"] != nil { revoked.insert(id) }
        }
        manager.startObserving(account: account)
        defer { manager.stopObserving() }
        await Task.yield(); try await manager.load()
        let product = try XCTUnwrap(manager.products.first { $0.id == "ouchi.premium.monthly" })
        guard case .saved = try await manager.purchase(product, account: account) else { XCTFail("subscription not saved"); return }
        let original = try await latest(product.id, phase: "subscription before refund") { $0.appAccountToken == account }
        XCTAssertEqual(acknowledged, [String(original.id)])
        XCTAssertTrue(revoked.isEmpty)
        try session.refundTransaction(identifier: XCTUnwrap(UInt(exactly: original.id)))
        let refund = try await latest(product.id, phase: "subscription refund") { $0.id == original.id && $0.revocationDate != nil }
        XCTAssertNotNil(refund.revocationDate)
        let restored = try await manager.restore(account: account)
        XCTAssertGreaterThanOrEqual(restored.savedTransactions, 1)
        XCTAssertFalse(restored.otherAccountSubscriptionFound)
        XCTAssertEqual(revoked, [String(original.id)], "actual restore must submit verified revocation before a later purchase")
        do {
            _ = try await manager.purchase(product, account: account)
            XCTFail("revoked transaction replay reported a current purchase")
        } catch PurchaseManager.PurchaseError.purchaseNotActive { }
        XCTAssertEqual(acknowledged, [String(original.id)], "revoked replay must retain the original identity")
        XCTAssertEqual(revoked, [String(original.id)])
        XCTAssertEqual(session.allTransactions().count, 1)
        withExtendedLifetime(session) {}
        // Mock persistence inspects SDK-verified local payloads only. No server
        // entitlement, money, real App Store refund or retention change.
    }
    @MainActor func testLocalCatalogLoadsWithoutPurchase() async throws {
        let session = try await sharedCatalogSession()
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
        let session = try await sharedCatalogSession()
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
        let updates = Task { for await _ in StoreKit.Transaction.updates { if Task.isCancelled { break } } }
        defer { updates.cancel() }
        await Task.yield()
        let account = UUID(uuidString: "A1111111-1111-4111-8111-111111111111")!
        // This case explicitly forces each transition. Avoid racing the same
        // subscription against a two-second automatic renewal clock.
        session.timeRate = .realTime
        let monthly = try await purchaseLocal("ouchi.premium.monthly", account: account)
        XCTAssertEqual(monthly.environment, .xcode)
        XCTAssertEqual(monthly.appAccountToken, account)
        XCTAssertEqual(monthly.productType, .autoRenewable)
        XCTAssertNotNil(monthly.expirationDate)
        XCTAssertNil(monthly.revocationDate)
        XCTAssertFalse(monthly.isUpgraded)
        await monthly.finish() // fixture-only; no application persistence acknowledgement
        try session.enableAutoRenewForTransaction(identifier: XCTUnwrap(UInt(exactly: monthly.id)))
        let initialProducts = try await Product.products(for: [monthly.productID])
        let initialInfo = try XCTUnwrap(initialProducts.first?.subscription)
        var currentRenewalObserved = false
        for _ in 0..<100 {
            for status in try await initialInfo.status {
                if case .verified(let transaction) = status.transaction,
                   case .verified(let renewal) = status.renewalInfo,
                   transaction.id == monthly.id, renewal.willAutoRenew {
                    currentRenewalObserved = true
                }
            }
            if currentRenewalObserved { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        guard currentRenewalObserved else {
            XCTFail("current new subscription must acknowledge auto-renew before forcing renewal")
            return
        }
        var journalReady = false
        for _ in 0..<100 {
            journalReady = session.allTransactions().contains {
                UInt64($0.identifier) == monthly.id && $0.autoRenewingEnabled &&
                !$0.hasPurchaseIssue && !$0.pendingAskToBuyConfirmation && !$0.isPendingPriceIncreaseConsent
            }
            if journalReady { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        guard journalReady else {
            XCTFail("local journal must confirm current transaction renewal without a pending issue")
            return
        }
        try session.forceRenewalOfSubscription(productIdentifier: monthly.productID)
        var journalRenewed = false
        for _ in 0..<300 {
            journalRenewed = session.allTransactions().contains {
                $0.productIdentifier == monthly.productID && UInt64($0.identifier) != monthly.id &&
                UInt64($0.originalTransactionIdentifier) == monthly.originalID
            }
            if journalRenewed { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        print("LOCAL_RENEWAL_FIXTURE_COUNT", session.allTransactions().count,
              "JOURNAL_UPDATED", journalRenewed, "BILLING_RETRY", session.shouldEnterBillingRetryOnRenewal)
        guard journalRenewed else {
            XCTFail("forced renewal did not produce a new matching local journal transaction")
            return
        }
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
        let updates = Task { for await _ in StoreKit.Transaction.updates { if Task.isCancelled { break } } }
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
    @MainActor func testActualManagerPersistenceFailureThenRetry() async throws {
        let session = try await disposableSession(), window = fixtureWindow()
        defer { window.close() }
        let manager = try PurchaseManager(localStoreKitFixtureWindow: window)
        let account = UUID(uuidString: "C3333333-3333-4333-8333-333333333333")!
        var attempts: [String] = [], shouldFail = true, acknowledgements = Set<String>()
        manager.persist = { [self] jws in
            let id = try localTransactionID(jws); attempts.append(id)
            if shouldFail { throw URLError(.notConnectedToInternet) }
            acknowledgements.insert(id) // disposable idempotent mock acknowledgement
        }
        manager.startObserving(account: account)
        defer { manager.stopObserving() }
        await Task.yield()
        try await manager.load()
        let product = try XCTUnwrap(manager.products.first { $0.id == "ouchi.tip.medium" })
        do { _ = try await manager.purchase(product, account: account); XCTFail("failed persistence accepted") }
        catch is URLError { }
        let transaction = try await latest(product.id, phase: "lost persistence acknowledgement") { $0.appAccountToken == account }
        XCTAssertTrue(acknowledgements.isEmpty)
        let retained = try await unfinishedContains(transaction.id)
        XCTAssertTrue(retained, "server failure must precede finish")
        shouldFail = false
        try await manager.observeUnfinished(account: account)
        XCTAssertEqual(acknowledgements, [String(transaction.id)])
        XCTAssertTrue(attempts.count >= 2 && Set(attempts) == [String(transaction.id)])
        let remains = try await unfinishedContains(transaction.id)
        XCTAssertFalse(remains, "mock acknowledgement must precede fixture finish")
        XCTAssertFalse(manager.needsRetry)
        withExtendedLifetime(session) {}
    }
    @MainActor func testActualManagerRestoreAndOtherAccountRefusal() async throws {
        let session = try await disposableSession(), window = fixtureWindow()
        defer { window.close() }
        let account = UUID(uuidString: "D4444444-4444-4444-8444-444444444444")!
        let other = UUID(uuidString: "E5555555-5555-4555-8555-555555555555")!
        let manager = try PurchaseManager(localStoreKitFixtureWindow: window)
        var acknowledgements = Set<String>()
        manager.persist = { [self] jws in acknowledgements.insert(try localTransactionID(jws)) }
        manager.startObserving(account: account)
        defer { manager.stopObserving() }
        await Task.yield(); try await manager.load()
        let product = try XCTUnwrap(manager.products.first { $0.id == "ouchi.premium.monthly" })
        guard case .saved = try await manager.purchase(product, account: account) else { XCTFail("purchase not acknowledged"); return }
        XCTAssertEqual(acknowledgements.count, 1)
        let before = session.allTransactions().count
        do { _ = try await manager.purchase(product, account: account); XCTFail("second subscription allowed") }
        catch PurchaseManager.PurchaseError.subscriptionAlreadyActive { }
        XCTAssertEqual(session.allTransactions().count, before)
        let restored = try await manager.restore(account: account)
        XCTAssertEqual(restored.savedTransactions, 1)
        XCTAssertFalse(restored.otherAccountSubscriptionFound)
        XCTAssertEqual(acknowledgements.count, 1, "replay must not create another mock acknowledgement")
        manager.stopObserving()
        let otherManager = try PurchaseManager(localStoreKitFixtureWindow: window)
        var otherPersistenceCalls = 0
        otherManager.persist = { _ in otherPersistenceCalls += 1 }
        otherManager.startObserving(account: other)
        defer { otherManager.stopObserving() }
        await Task.yield(); try await otherManager.load()
        let otherProduct = try XCTUnwrap(otherManager.products.first { $0.id == product.id })
        do { _ = try await otherManager.purchase(otherProduct, account: other); XCTFail("other-account subscription accepted") }
        catch PurchaseManager.PurchaseError.subscriptionBoundElsewhere { }
        let otherRestore = try await otherManager.restore(account: other)
        XCTAssertEqual(otherRestore.savedTransactions, 0)
        XCTAssertTrue(otherRestore.otherAccountSubscriptionFound)
        XCTAssertEqual(otherPersistenceCalls, 0)
        XCTAssertEqual(session.allTransactions().count, before)
        withExtendedLifetime(session) {}
    }
    @MainActor func testActualManagerCancelledPurchaseAllowsLaterAttempt() async throws {
        let session = try await disposableSession(), window = fixtureWindow()
        defer { window.close() }
        let manager = try PurchaseManager(localStoreKitFixtureWindow: window)
        let account = UUID(uuidString: "F6666666-6666-4666-8666-666666666666")!
        var persistenceCalls = 0
        manager.persist = { _ in persistenceCalls += 1 }
        manager.startObserving(account: account)
        defer { manager.stopObserving() }
        await Task.yield(); try await manager.load()
        let product = try XCTUnwrap(manager.products.first { $0.id == "ouchi.tip.small" })
        try await session.setSimulatedError(.generic(.userCancelled), forAPI: .purchase)
        guard case .cancelled = try await manager.purchase(product, account: account) else { XCTFail("cancel outcome not preserved"); return }
        XCTAssertEqual(persistenceCalls, 0)
        XCTAssertFalse(session.allTransactions().contains { $0.state == .purchased })
        try await session.setSimulatedError(nil, forAPI: .purchase)
        session.resetToDefaultState(); session.disableDialogs = true
        guard case .saved = try await manager.purchase(product, account: account) else { XCTFail("reservation not released after cancel"); return }
        XCTAssertGreaterThanOrEqual(persistenceCalls, 1)
        XCTAssertEqual(session.allTransactions().filter { $0.state == .purchased }.count, 1)
        withExtendedLifetime(session) {}
    }
    @MainActor func testActualManagerPendingPurchaseWaitsForApproval() async throws {
        let session = try await disposableSession(), window = fixtureWindow()
        defer { window.close() }
        session.askToBuyEnabled = true
        let manager = try PurchaseManager(localStoreKitFixtureWindow: window)
        let account = UUID(uuidString: "17777777-7777-4777-8777-777777777777")!
        var acknowledgements = Set<String>()
        manager.persist = { [self] jws in acknowledgements.insert(try localTransactionID(jws)) }
        manager.startObserving(account: account)
        defer { manager.stopObserving() }
        await Task.yield(); try await manager.load()
        let product = try XCTUnwrap(manager.products.first { $0.id == "ouchi.tip.large" })
        guard case .pending = try await manager.purchase(product, account: account) else { XCTFail("pending outcome not preserved"); return }
        XCTAssertTrue(acknowledgements.isEmpty, "pending purchase must not be acknowledged")
        let pending = try XCTUnwrap(session.allTransactions().first { $0.pendingAskToBuyConfirmation })
        try session.approveAskToBuyTransaction(identifier: pending.identifier)
        let approved = try await latest(product.id, phase: "approval propagation") { $0.appAccountToken == account }
        var unfinishedIDs = Set<UInt64>()
        for await result in StoreKit.Transaction.unfinished {
            if case .verified(let transaction) = result, transaction.environment == .xcode { unfinishedIDs.insert(transaction.id) }
        }
        XCTAssertTrue(unfinishedIDs.contains(approved.id), "approval must remain unfinished before acknowledgement")
        // Foreground/startup replay also covers a missed approval notification.
        // Real device notification delivery is a separate acceptance requirement.
        try await manager.observeUnfinished(account: account)
        for _ in 0..<100 {
            if acknowledgements.count == 1 { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertEqual(acknowledgements.count, 1, "approved purchase must be recovered from unfinished transactions")
        let id = try XCTUnwrap(acknowledgements.first.flatMap(UInt64.init))
        let stillUnfinished = try await unfinishedContains(id)
        XCTAssertFalse(stillUnfinished, "only acknowledged approval may finish")
        XCTAssertFalse(manager.needsRetry)
        withExtendedLifetime(session) {}
    }
    @MainActor func testActualManagerAccountSwitchDuringPersistenceDoesNotFinishStalePurchase() async throws {
        let session = try await disposableSession(), window = fixtureWindow()
        defer { window.close() }
        let manager = try PurchaseManager(localStoreKitFixtureWindow: window)
        let account = UUID(uuidString: "4AAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")!
        let other = UUID(uuidString: "5BBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB")!
        var gates: [CheckedContinuation<Void, Never>] = []
        var oldAcknowledgements = Set<String>()
        manager.persist = { [self] jws in
            await withCheckedContinuation { gates.append($0) }
            oldAcknowledgements.insert(try localTransactionID(jws))
        }
        manager.startObserving(account: account)
        defer { manager.stopObserving() }
        await Task.yield(); try await manager.load()
        let product = try XCTUnwrap(manager.products.first { $0.id == "ouchi.tip.small" })
        let first = Task { try await manager.purchase(product, account: account) }
        defer { first.cancel(); for gate in gates { gate.resume() }; gates.removeAll() }
        for _ in 0..<200 {
            if !gates.isEmpty { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        guard !gates.isEmpty else { XCTFail("purchase did not reach persistence"); return }
        let transaction = try await latest(product.id, phase: "account switch during persistence") { $0.appAccountToken == account }
        manager.stopObserving()
        var otherPersistenceCalls = 0
        manager.persist = { _ in otherPersistenceCalls += 1 }
        manager.startObserving(account: other)
        try await manager.observeUnfinished(account: other)
        XCTAssertEqual(otherPersistenceCalls, 0, "new account must not submit old purchase")
        // Returning to A is a new binding, not permission for old callbacks.
        manager.stopObserving()
        var replayAcknowledgements = Set<String>()
        manager.persist = { [self] jws in replayAcknowledgements.insert(try localTransactionID(jws)) }
        manager.startObserving(account: account)
        let waiting = gates; gates.removeAll()
        for gate in waiting { gate.resume() }
        do { _ = try await first.value; XCTFail("old binding reported purchase success") }
        catch is CancellationError { }
        XCTAssertEqual(oldAcknowledgements, [String(transaction.id)])
        XCTAssertTrue(replayAcknowledgements.isEmpty)
        let retained = try await unfinishedContains(transaction.id)
        XCTAssertTrue(retained, "late acknowledgement must not finish an old binding's transaction")
        try await manager.observeUnfinished(account: account)
        XCTAssertEqual(replayAcknowledgements, [String(transaction.id)])
        let remains = try await unfinishedContains(transaction.id)
        XCTAssertFalse(remains, "current binding replay may finish after its own acknowledgement")
        XCTAssertEqual(otherPersistenceCalls, 0)
        withExtendedLifetime(session) {}
        // Only synthetic accounts and mocked acknowledgement; no Auth session,
        // server entitlement, owner credentials or real Apple purchase.
    }
    @MainActor func testActualManagerRejectsOverlappingPurchase() async throws {
        let session = try await disposableSession(), window = fixtureWindow()
        defer { window.close() }
        let manager = try PurchaseManager(localStoreKitFixtureWindow: window)
        let account = UUID(uuidString: "28888888-8888-4888-8888-888888888888")!
        var startedPersistence = false, acknowledgements = Set<String>()
        manager.persist = { [self] jws in
            startedPersistence = true
            try await Task.sleep(for: .milliseconds(300))
            acknowledgements.insert(try localTransactionID(jws))
        }
        manager.startObserving(account: account)
        defer { manager.stopObserving() }
        await Task.yield(); try await manager.load()
        let product = try XCTUnwrap(manager.products.first { $0.id == "ouchi.tip.medium" })
        let first = Task { try await manager.purchase(product, account: account) }
        defer { first.cancel() }
        for _ in 0..<200 {
            if startedPersistence { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertTrue(startedPersistence)
        do { _ = try await manager.purchase(product, account: account); XCTFail("overlapping purchase accepted") }
        catch PurchaseManager.PurchaseError.purchaseInProgress { }
        guard case .saved = try await first.value else { XCTFail("first purchase not acknowledged"); return }
        XCTAssertEqual(acknowledgements.count, 1)
        XCTAssertEqual(session.allTransactions().count, 1)
        withExtendedLifetime(session) {}
    }
}
