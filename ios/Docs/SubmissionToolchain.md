# App Store upload SDK verification

Apple's current minimum upload requirement, checked 2026-10-12, is Xcode 26 or later with iOS 26 SDK or later. The app's minimum supported iOS deployment target is a separate setting and is not raised by this change.

The Native workflow uses the standard macos-26 runner and verifies its selected Xcode and iPhoneOS SDK before testing. It checks the actual unsigned Release product's DTPlatformName, DTSDKName and DTXcode after building. Old toolchains, Simulator artifacts and missing/old SDK metadata fail; a green test on an old SDK is not upload eligibility evidence.

The workflow does not select a paid larger runner, create signing credentials, read Local.xcconfig, upload to App Store Connect or enable purchases. The public runner image currently documents stable Xcode 26.6 as default; the preflight checks the actual selected installation rather than trusting the mutable runner label.

Local checks passed using Xcode 27.0/iPhoneOS SDK27.0 and a previously built unsigned iPhoneOS Release product. Synthetic rejection cases for older/non-numeric toolchain versions, Simulator products and old product metadata passed. That previous product is not a fresh current-head build or a signed archive.

Before submission, repeat on the final integrated build with Apple's then-current requirement and an upload-supported stable Xcode. A selected version and unsigned metadata do not prove Apple acceptance, signing, a valid Team, archive integrity or TestFlight/device behavior. Check the actual signed archive, its entitlements and privacy report, then validate/upload with the authorized owner account.

Sources:
- https://developer.apple.com/news/upcoming-requirements/?id=04282026a
- https://developer.apple.com/app-store/submitting/
- https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md
