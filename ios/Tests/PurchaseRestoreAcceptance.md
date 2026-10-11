# Purchase and restore device acceptance

These checks have not been executed against Apple Sandbox. Compile success and synthetic core tests do not prove StoreKit behavior. Production sales remain disabled.

Use disposable Ouchi accounts A/B, Apple Sandbox accounts, and a configured monthly/annual subscription group. Never use the owner's records or a real purchase. Confirm server-verified rights in native and Web after each scenario.

| Scenario | Required evidence |
|---|---|
| Active monthly or annual purchase for A | A's attempt to purchase again stops before Apple's purchase sheet and points to Restore. Current subscribed/grace-period StoreKit entries are checked even when server synchronization is delayed. |
| Active purchase for A while signed into B | B cannot launch a second subscription purchase or take A's rights. The message states that the purchase belongs to another Ouchi account. A's Web/native rights remain unchanged. |
| Tip while an active subscription exists | Voluntary consumable tip remains available; no subscription guard applies to tips. Cancelled or pending tip gives no benefit and is not recorded as completed. |
| Restore A's verified history | Exact matching account token, bundle, environment, product type and store app identity are checked. Server persistence failure remains a failure. Restore does not finish historical consumables or grant local-only rights. |
| Restore A's history on B | Other-account subscription is reported and not submitted/rebound. Any rights shown for B must come from B's independently verified server response. |
| Re-created account after deletion | The current path reports that it cannot transfer the prior purchase. Do not advertise deletion/re-enrollment restoration as complete until the authorized server transfer flow is implemented and verified. |
| Missing or mismatched appTransactionID; unverified AppTransaction/Transaction | Fail without transfer, purchase sheet, new entitlement or completed transaction. Test supported older OS versions with refreshed signed data. |
| Account switch during AppStore.sync, AppTransaction.shared, currentEntitlements, history iteration or persistence | No stale request, finish, rights, message or retry badge applies to the replacement account, including signing back into the same account under a new binding generation. |
| Refund, revocation, expiry and grace-period exit | Fresh server rights control premium access. A historical signed pair never makes an expired/refunded purchase current. Normal records remain viewable/exportable. |

Source checked 2026-10-11: [Apple currentEntitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements) includes subscribed/grace-period auto-renewable subscriptions and excludes refunded/revoked purchases. It is used only to stop another purchase prompt; it does not replace authenticated server entitlement verification.

App Store Connect must place monthly and annual products in the intended single subscription group. Plan changes, after-deletion ownership transfer and Apple Family Sharing are separate unfinished flows. Do not interpret Ouchi household sharing as Apple purchase Family Sharing.
