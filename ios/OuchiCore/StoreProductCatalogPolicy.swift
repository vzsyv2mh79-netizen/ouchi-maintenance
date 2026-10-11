import Foundation

/// Public store metadata only. This policy never verifies a transaction or grants access.
public struct StoreProductDescriptor: Equatable, Sendable {
    public enum Kind: Equatable, Sendable { case consumable, autoRenewable, other }
    public enum Period: Equatable, Sendable { case month, year, other }
    public let id: String
    public let kind: Kind
    public let period: Period?
    public let periodValue: Int?
    public let subscriptionGroupID: String?
    public init(id: String, kind: Kind, period: Period? = nil, periodValue: Int? = nil, subscriptionGroupID: String? = nil) {
        self.id=id;self.kind=kind;self.period=period
        self.periodValue=periodValue;self.subscriptionGroupID=subscriptionGroupID
    }
}

public enum StoreProductCatalogPolicy {
    public static func eligibleProductIDs(_ products: [StoreProductDescriptor]) throws -> Set<String> {
        guard Set(products.map(\.id)).count==products.count else { throw CloudError.malformedResponse }
        let tipIDs:Set<String>=["ouchi.tip.small","ouchi.tip.medium","ouchi.tip.large"]
        var result=Set(products.filter { tipIDs.contains($0.id) && $0.kind == .consumable && $0.subscriptionGroupID==nil && $0.period==nil && $0.periodValue==nil }.map(\.id))
        // Both durations represent the same level of service. Require one verified
        // public StoreKit group before offering either; do not guess missing metadata.
        guard let monthly=products.first(where: { $0.id=="ouchi.premium.monthly" }),
              let annual=products.first(where: { $0.id=="ouchi.premium.annual" }),
              monthly.kind == .autoRenewable,annual.kind == .autoRenewable,
              monthly.period == .month,annual.period == .year,
              monthly.periodValue==1,annual.periodValue==1,
              let group=monthly.subscriptionGroupID,!group.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
              annual.subscriptionGroupID==group else { return result }
        result.formUnion([monthly.id,annual.id])
        return result
    }
}
