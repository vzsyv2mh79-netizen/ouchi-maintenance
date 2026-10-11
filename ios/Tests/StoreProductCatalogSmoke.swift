import Foundation
import OuchiCore

@main struct StoreProductCatalogSmoke {
    static func main() throws {
        let monthly=StoreProductDescriptor(id:"ouchi.premium.monthly",kind:.autoRenewable,period:.month,periodValue:1,subscriptionGroupID:"synthetic-group")
        let annual=StoreProductDescriptor(id:"ouchi.premium.annual",kind:.autoRenewable,period:.year,periodValue:1,subscriptionGroupID:"synthetic-group")
        let tip=StoreProductDescriptor(id:"ouchi.tip.small",kind:.consumable)
        let valid=try StoreProductCatalogPolicy.eligibleProductIDs([monthly,annual,tip])
        precondition(valid==Set([monthly.id,annual.id,tip.id]))
        let wrongGroup=StoreProductDescriptor(id:annual.id,kind:.autoRenewable,period:.year,periodValue:1,subscriptionGroupID:"another-group")
        let wrongDuration=StoreProductDescriptor(id:annual.id,kind:.autoRenewable,period:.year,periodValue:2,subscriptionGroupID:"synthetic-group")
        let emptyGroup=StoreProductDescriptor(id:annual.id,kind:.autoRenewable,period:.year,periodValue:1,subscriptionGroupID:" ")
        let wrongKind=StoreProductDescriptor(id:annual.id,kind:.consumable)
        for invalid in [wrongGroup,wrongDuration,emptyGroup,wrongKind] {
            let accepted=try StoreProductCatalogPolicy.eligibleProductIDs([monthly,invalid,tip])
            precondition(accepted==[tip.id],"Invalid subscriptions must not hide independently valid optional tips")
        }
        let partial=try StoreProductCatalogPolicy.eligibleProductIDs([monthly,tip]);precondition(partial==[tip.id])
        let unknown=StoreProductDescriptor(id:"unapproved.product",kind:.consumable)
        let disguisedTip=StoreProductDescriptor(id:tip.id,kind:.autoRenewable,period:.month,periodValue:1,subscriptionGroupID:"synthetic-group")
        let rejected=try StoreProductCatalogPolicy.eligibleProductIDs([unknown,disguisedTip]);precondition(rejected.isEmpty)
        do { _ = try StoreProductCatalogPolicy.eligibleProductIDs([monthly,monthly,annual]);fatalError("Duplicate catalog identifier accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        print("PASS: synthetic store metadata offers same-group one-month/one-year plans; refuses missing/mismatched group, duration/type errors, unknown IDs and duplicate catalogs; optional consumable tips remain independent. No StoreKit price lookup, purchase, entitlement or actual App Store Connect configuration verified.")
    }
}
