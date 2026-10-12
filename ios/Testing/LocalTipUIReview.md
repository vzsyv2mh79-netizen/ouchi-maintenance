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
