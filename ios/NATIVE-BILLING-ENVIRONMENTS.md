# Native billing environment preparation

Updated 2026-10-11. This change prepares production code paths; it does not activate sales.

BillingAPI and PurchaseManager default to Sandbox. Production must be explicitly selected in both adapters by a future approved release configuration; the current NativeStore still constructs defaults and only binds development billing through the existing debug gate. No environment setting, backend configuration, paid infrastructure or production UI has been enabled.

The native entitlement adapter requires the server response and saved-transaction acknowledgement to match its selected environment. Unconfigured free responses without an environment are accepted only by the disabled Sandbox default. Production requires explicit Production even for free rights. Unknown and Xcode environments cannot provide premium rights. Existing Sandbox screen naming remains as a source-compatible type alias while the real sales UI is prepared.

A paid period does not depend on availability of new sales: production rights remain valid until their verified expiry when salesEnabled is false. Server ownership, nonzero purchase binding, allowlisted subscription product, matching environment and expiry are still required. No local purchase flag grants rights. The StoreKit adapter requires verified AppTransaction/Transaction environment, product type and account binding before delivering the exact signed JWS, and does not finish before server persistence.

Validation: 23 freshly compiled Swift smoke tests, macOS normal/DEBUG typechecks, UI syntax and project/privacy plists passed. Billing tests use synthetic transport replies to prove cross-environment refusal, production acknowledgement scoping, paid-period retention with paused sales and expiry. They do not prove actual signed Apple purchase, restore, refund, renewal, notifications or App Store publication. iOS SDK CI must separately pass.

Release gates still required: actual Apple enrollment/app/products/prices, signed Sandbox lifecycle tests, native/Web same-account validation, production sales UI with actual available benefits/legal links, production backend and database rollout approval, premium availability/retention, archive/TestFlight and App Review. Do not enable production from this document alone.

Official API references checked 2026-10-11:
- https://developer.apple.com/documentation/storekit/apptransaction/environment
- https://developer.apple.com/documentation/storekit/appstore/environment
