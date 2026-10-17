# Native privacy manifest and collection inventory

UserDefaults is used inside the app container for appearance and account-scoped reminder preferences. CA92.1 remains the required-reason declaration and the manifest remains in the resource build phase. OuchiCore is the local package; Package.swift currently declares no external native dependencies.

The manifest now records the four data categories directly supported by the current free cloud-authentication/household paths: email address, family display name, user ID and other user content (household/product/task/history records and notes). These are linked to the account and used for app functionality. Tracking is false for the current native implementation; this is not permission to introduce advertising/tracking or a certification of unreviewed provider practices.

See AppPrivacyInventory.json for source evidence, additional feature categories and unresolved items. Prepared cloud photos, verified purchase history and native push/App Attest identifiers need final category declarations when those paths are enabled in the submitted configuration. Do not enable those features and submit the current four-category manifest unchanged. Public model lookup query/log retention, diagnostics, providers, support and retention need an actual deployment review. No App Store Connect label has been submitted or approved by this change.

Local validation checks plist structure and resource membership only. It does not prove final signed-archive inclusion, production provider collection or Apple's acceptance. Before submission, generate the privacy report from the actual archive, inspect all bundled manifests/final dependencies, confirm active data paths and provider retention/tracking, then reconcile the manifest, App Store Connect answers and public privacy policy. Local storage, user-selected exports and Apple-handled card details must not be falsely described as operator collection without evidence.

Official references (checked 2026-10-12):
- https://developer.apple.com/app-store/app-privacy-details/
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- https://developer.apple.com/documentation/technotes/tn3184-adding-data-collection-details-to-your-privacy-manifest
- https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests
- https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
