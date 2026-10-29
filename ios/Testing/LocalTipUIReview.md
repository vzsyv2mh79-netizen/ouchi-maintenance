# Optional local tip UI review

This creates an NSHostingView of the actual shipping ReleaseTipPurchaseSection
inside the disposable local StoreKit test host. The generator extracts its body
from NativeRootView.swift and changes only private visibility for the test module.
It does not replace the shipping view or add a development flag to the iOS app.

The host and test module have fixed dev.ouchi.review.storekit.catalog bundle IDs.
The test verifies AppTransaction.environment == .xcode before resetting its own
journal. Authentication is synthetic in memory, HTTP acknowledgement is mocked,
and the default shipping purchase gates remain false. This proves no real
App Store price, server signature verification, premium entitlement or device flow.

Run create-local-storekit-project.py, then the LocalStoreKitCatalog scheme with
OUCHI_LOCAL_TIP_UI_REVIEW=YES and only-testing
LocalStoreKitCatalogTests/LocalStoreKitCatalogTests/testOptionalActualTipViewRendering.
The test logs LOCAL_TIP_UI_REVIEW_READY and holds its window for at most 90 seconds.
Use CUA to observe the actual returned local prices, open one confirmation and
cancel it. Do not press the final payment button for a visual-only review.
The test requires zero mock submissions and an empty local transaction journal.

With OUCHI_LOCAL_TIP_UI_REVIEW=NO (or no opt-in), the visual review test skips;
routine CI never waits for operator interaction. Re-generate the project/view
when shipping UI source changes. No owner credentials or Local.xcconfig are read.

The initial hosted-view test completed with zero submissions, but CUA timed out
and no screenshot or dialog observation was obtained. Visual verification remains
incomplete. NSHostingView creation is not a substitute for an observed iPhone UI.

## Optional subscription UI review

The generator also extracts the actual ReleaseSubscriptionPurchaseSection into
ReleaseSubscriptionUIReview.swift, with only its visibility changed. Use
OUCHI_LOCAL_TIP_UI_REVIEW=SUBSCRIPTION and only-testing
LocalStoreKitCatalogTests/LocalStoreKitCatalogTests/testOptionalActualSubscriptionViewRendering.
The window logs LOCAL_SUBSCRIPTION_UI_REVIEW_READY and closes after the same
bounded 90-second hold. Its capacity and retention are explicitly synthetic test
values, not approved service conditions. The two products are actual local
StoreKit products; the account and HTTP rights/acknowledgement are fixtures.

Observe both full renewal prices and one-month/one-year periods, benefit and
synthetic retention text, automatic renewal and cancellation management. Open a
price confirmation and cancel. The test requires zero submissions and no local
transactions. The surrounding legal-link and restore sections must be verified
separately in the full purchase/contract screen, and then on iPhone with actual
service settings. The isolated purchase override is not evidence that the
shipping feature/disclosure release gates are enabled or complete.

Default runs skip both interactive tests. If the Mac is locked, leave visual
verification incomplete; do not bypass the lock or interpret window construction
as a screenshot or a successful confirmation/cancellation interaction.

One MainActor-owned SKTestSession is retained for the dedicated test-host process.
Both product-loading tests use that same owner without clearing transactions or
granted rights. Transaction tests reset its overrides and disposable history.
This avoids interleaving multiple session owners for the app-wide testing service;
it does not change shipping PurchaseManager or Apple's real store environment.

Fixture isolation confirms both its disposable journal and StoreKit's latest
transaction view are empty before a case starts. Forced renewal also checks the
current journal's renewal eligibility and requires a new matching journal entry
before validating the verified SDK transaction. Failures remain test failures;
bounded waiting does not enable retries of the force-renewal command or silently
skip an unavailable renewal. These are local fixture controls, not a fix or proof
for Apple Sandbox/Production renewal behavior.

## Scheduled renewal controller coverage

`testAutomaticRenewalPersistsThroughActualController` separately uses the local
StoreKit ten-second renewal rate. It invokes the actual NativeStore purchase
handler with synthetic account binding and attachment quota, then requires a new
verified `.xcode` transaction with the same original ID and issued purchase token,
a later expiry, and mock submissions containing both the exact initial and new
renewal transaction IDs through the controller's observer. Resubmitting the
initial transaction cannot satisfy the renewal assertion. Mock acknowledgements must not turn free server rights into premium.
The scheduled-renewal test does not retry, replace or skip the force-renewal
metadata case. Its success proves neither Apple Sandbox JWS validation nor
Production subscription updates.

Apple documents accelerated time and forced renewal as separate testing controls:
https://developer.apple.com/documentation/storekittest/sktestsession/timerate-swift.property
https://developer.apple.com/documentation/storekittest/sktestsession/forcerenewalofsubscription(productidentifier:)

## 2026-10-15 current-source review

The dedicated host initially failed to compile after NativeStore gained two
Keychain adapters. The generator now includes the existing
DeletionReadCredentialVault and AccountClosureReviewVault sources, without
stubs or changes to the shipping target. Both extracted purchase sections were
compared byte-for-byte with their current shipping bodies before review.

The optional macOS forms now explicitly use grouped style. The automatic macOS
Form style truncated the tip explanation; changing the review container to
grouped style displayed the complete explanation and separate test-environment
notice. No shipping iOS view change was needed. In the grouped form, CUA observed
all three local prices (JPY 100, 300, 1,000), opened the JPY 300 one-time-payment
confirmation, pressed Cancel, and observed the original three choices again.
The final payment action was never pressed. These are local catalog prices,
not registered App Store products or approved selling prices.

StoreKit emitted SKInternalErrorDomain code 3 diagnostics while resetting and
reading its test journal in this environment. Do not treat an empty journal
assertion alone as definitive service-state proof. The observed interaction
proves only local view content and cancellation before entering the purchase
handler; mock submission checks remain separate. Signed Apple Sandbox, actual
iPhone rendering, surrounding legal links/restore, and transaction-lifecycle
verification remain release requirements.

The grouped subscription form was also observed through CUA: both local
JPY 300 / one-month and JPY 3,000 / one-year full prices, automatic renewal,
Apple management link, post-expiry record access/export, and explicitly synthetic
capacity/retention were visible without truncation. Each plan opened a
confirmation with its own full price/period; Cancel returned to both plan
choices. No final contract action or external management link was pressed.
The stated benefits remain gated off in the shipping app until actually ready.
