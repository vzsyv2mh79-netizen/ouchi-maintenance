# Purchase disclosure release gate

New purchases require the existing environment, account binding, fresh server rights and explicit product rollout gates. They additionally require `OUCHI_PURCHASE_DISCLOSURES_REVIEWED` to be a Boolean `true` and all three published destinations:

- `OUCHI_TERMS_URL`
- `OUCHI_PRIVACY_URL`
- `OUCHI_SUPPORT_URL`

The shipping defaults are `false` and empty strings. Missing, relative, non-HTTPS, surrounding-whitespace and credential-bearing URLs are refused. Valid syntax is not evidence that a destination works or that its contents are sufficient. Do not set the review flag from a successful URL parse or a test result.

The purchase and contract screen displays the configured links. Until review is complete, it explains that new purchases are unavailable. Existing contract checks and restore remain independent of this new-purchase gate; users must still be able to recover their purchases when new sales are paused. No client setting grants a paid entitlement.

Before enabling the flag, review all three live public destinations in a logged-out browser, on iPhone, and in the submitted build. Record their URLs and the reviewed content version. Confirm the operator and actual support channel, actual feature delivery, capacity and retention, shared-household access, cancellation, purchase restoration, post-expiry reading/export, and actual processing by service providers. Complete App Store metadata separately with the same applicable policy links.

Apple's subscription guidance requires the purchase screen to explain the name, duration, services, full localized renewal price and restore/sign-in, with terms and privacy links in the app and metadata:
https://developer.apple.com/app-store/subscriptions/

The subscription purchase section is prepared separately. It requires the report and reminder environments to equal the purchase environment, the formal attachment switch to be enabled without the isolated lifecycle fixture, and `OUCHI_SUBSCRIPTION_OFFER_REVIEWED` to be Boolean true. Its additional inputs are `OUCHI_ATTACHMENT_MAXIMUM_BYTES`, `OUCHI_ATTACHMENT_MAXIMUM_FILES`, `OUCHI_ATTACHMENT_MAXIMUM_FILE_BYTES` and `OUCHI_ATTACHMENT_RETENTION_DESCRIPTION`. The shipping defaults are zero, empty and false. Positive capacity limits, a per-file limit no greater than total capacity, and a nonempty retention explanation are required. Do not populate these with draft numbers or mark them reviewed before actual service delivery and backend limits are verified. A configuration match is not that verification.

When configured, the section shows the three available benefits, the reviewed capacity/retention description, and StoreKit's full monthly or annual display price and one-month/one-year period. The annual amount is never replaced by an equivalent monthly price. It explains automatic renewal, provides Apple cancellation management, and uses the existing purchase handler with fresh account/server checks. Current rights suppress another subscription purchase. Confirmation is cleared on account or availability changes. Legal/support links and the restore operation are in the surrounding purchase/contract screen. The local hosted UI and actual Apple Sandbox flow of this new section still need verification.

This gate is a configuration prerequisite, not a legal-compliance certification. Actual StoreKit/Sandbox/service verification remains incomplete. Tips remain optional consumable one-time payments without feature rewards. No payment or backend deployment is enabled by adding these keys.

The strictly isolated macOS LocalStoreKit fixture deliberately bypasses shipping configuration through its existing test-only purchase override. It may test purchase persistence and UI with synthetic accounts while shipping sales are disabled. Its success is not evidence of configured production links, real Apple transactions or paid access. Test-only code must remain absent from normal Debug/Release builds.
