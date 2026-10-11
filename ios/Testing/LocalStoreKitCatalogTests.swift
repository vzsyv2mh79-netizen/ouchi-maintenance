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
        session.resetToDefaultState()
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
    @MainActor private func fixtureWindow() -> NSWindow {
        let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 240, height: 160),
                              styleMask: [.titled], backing: .buffered, defer: false)
        window.title = "おうちメンテ・購入コード検証"
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        return window
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
        for await result in Transaction.unfinished {
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
