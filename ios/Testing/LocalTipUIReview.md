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
