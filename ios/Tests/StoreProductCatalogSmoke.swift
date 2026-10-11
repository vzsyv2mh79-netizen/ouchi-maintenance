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
        let terms = "https://ouchi.invalid/terms", privacy = "https://ouchi.invalid/privacy", support = "https://ouchi.invalid/support"
        let links = PurchaseDisclosureLinks(reviewed: true, terms: terms, privacy: privacy, support: support)
        precondition(links?.terms.absoluteString == terms && links?.privacy.absoluteString == privacy && links?.support.absoluteString == support)
        precondition(PurchaseDisclosureLinks(reviewed: false, terms: terms, privacy: privacy, support: support) == nil,
                     "Valid-looking destinations do not substitute for release review")
        for invalid in ["", "/privacy", "http://ouchi.invalid/privacy", "file:///tmp/privacy", "javascript:alert(1)", "https:///privacy", "https://user:secret@ouchi.invalid/privacy", " https://ouchi.invalid/privacy "] {
            precondition(PurchaseDisclosureLinks(reviewed: true, terms: invalid, privacy: privacy, support: support) == nil)
            precondition(PurchaseDisclosureLinks(reviewed: true, terms: terms, privacy: invalid, support: support) == nil)
            precondition(PurchaseDisclosureLinks(reviewed: true, terms: terms, privacy: privacy, support: invalid) == nil)
        }
        print("PASS: new purchase disclosure configuration requires reviewed destinations; missing, relative, insecure, credential-bearing and malformed destinations are refused. Synthetic URLs are not published or fetched; policy contents and availability remain unverified.")
        print("PASS: synthetic store metadata offers same-group one-month/one-year plans; refuses missing/mismatched group, duration/type errors, unknown IDs and duplicate catalogs; optional consumable tips remain independent. No StoreKit price lookup, purchase, entitlement or actual App Store Connect configuration verified.")
    }
}
