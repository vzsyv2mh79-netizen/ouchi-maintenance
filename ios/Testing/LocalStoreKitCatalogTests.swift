import Foundation
import XCTest
import StoreKitTest
import StoreKit

// Dedicated test bundle only. Do not include in OuchiMaintenance app sources.
// This checks local catalog loading, not PurchaseManager or verified server rights.
final class LocalStoreKitCatalogTests: XCTestCase {
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
}
