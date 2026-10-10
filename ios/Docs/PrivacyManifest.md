# Native privacy manifest audit

The app uses UserDefaults only within its own container: appearance via
NativeRootView @AppStorage and the account-scoped reminder preference in
LocalReminders. CA92.1 declares this required-reason API usage. The manifest
is included in the application resource build phase. No third-party native SDK
is currently linked; OuchiCore is the local package.

This is a required-reason API declaration, NOT a completed App Store privacy
label or a declaration that no personal data is collected. Cloud authentication,
email, account identifiers, family nicknames, household records and verified
purchase records need a separate data-collection assessment, including backend
logs, retention, processors and deletion. Do not submit an empty collection
label on the basis of this file. Photos/storage and APNs must be assessed again
when implemented. No tracking declaration is finalized by this change.

Before submission, inspect the built archive privacy report, bundled manifests,
all final native dependencies, production data paths and App Store Connect
answers. These have not been verified without Xcode. The local verifier checks
plist syntax, the intended reason and membership in the resource build phase;
it does not prove archive inclusion or Apple's acceptance.

Official references:
- https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
- https://developer.apple.com/documentation/technotes/tn3183-adding-required-reason-api-entries-to-your-privacy-manifest
- https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests
