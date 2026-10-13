# Native screenshot review

The capture script builds the actual SwiftUI screens with the existing in-memory
sample transport. It cannot sign in to a real household. Its Debug bundle is
`dev.ouchi.review.storecaptures`; initial-tab selection is ignored by shipping
builds and by other review bundles. Source stamps hash the local Swift sources,
Info.plist and project configuration, not an unmodified remote commit.

Run from the repository with a fresh output directory:

```
python3 ios/scripts/capture-store-review.py --output /absolute/fresh/review-directory
```

The script creates its own iPhone simulator, builds without signing, captures
five tab screens only after the in-memory household reports ready, and removes
only that simulator in its cleanup. A bounded 45-second wait fails without
accepting an image when sample loading cannot be confirmed. Existing
simulators, accounts and display preferences are untouched. Outputs include
source digest, image digests, build diagnostics and a review-only manifest.
These are genuine native sample captures, **not submission-approved screenshots**.

Before submission, capture the signed final build, review personal-data absence,
text clipping, current supported features, dimensions and alpha channels. The
native review PNGs contain an alpha channel and are not submission-format
assets; use a direct simulator JPEG capture for the final opaque image. Capture
family-sharing detail separately; the settings tab alone does not demonstrate a
successful family join. Do not advertise attachments, paid reports, unconfigured
purchase prices or other disabled features through these images.

Apple's screenshot specifications checked on 2026-10-13 require a Dynamic Island
medium-display iPhone screenshot; the current iPhone 18 Pro simulator uses an
accepted 1206 × 2622 portrait size. The project currently supports iPad as well,
so a 13-inch iPad image is a separate outstanding requirement. The earlier
1320 × 2868 SVGs are layout templates and must not stand in for actual captures.

Source: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/

## Verified sample capture — 2026-10-13

Debug build succeeded. All five actual tab screens were inspected: home counters,
care schedule/completion button, product entry, history entry and settings with
free export were visible with synthetic data. Capture source digest:
`b9d39483bbeda16c4ebf25b9115cb1e46f8d6fcd`.
The first attempt stayed at login; the second had one early settings frame. Both
are explicitly recorded as rejected/partial evidence. The final run requires
a fresh per-launch sample-ready marker and succeeded for all five screens.

Dimensions are 1206 × 2622. Native PNGs contain alpha channels, so submission
format remains unproven. These are UI review assets, not final publication assets,
and do not prove physical-device accessibility, family join or purchases.
