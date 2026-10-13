# Native screenshot review

The capture script builds the actual SwiftUI screens with the existing in-memory
sample transport. It cannot sign in to a real household. Its Debug bundle is
`dev.ouchi.review.storecaptures`; initial-tab selection is ignored by shipping
builds and by other review bundles. Source stamps hash the local Swift sources,
Info.plist and project configuration, not an unmodified remote commit.

Run from the repository with a fresh output directory:

```
python3 ios/scripts/capture-store-review.py --device iphone --appearances light dark --output /absolute/fresh/iphone-review
python3 ios/scripts/capture-store-review.py --device ipad --appearances light dark --output /absolute/fresh/ipad-review
```

The script creates its own iPhone or 13-inch iPad simulator, builds without signing, captures
five tab screens only after the in-memory household reports ready, and removes
only that simulator in its cleanup. A bounded 45-second wait fails without
accepting an image when sample loading cannot be confirmed. Existing
simulators, accounts and display preferences are untouched. Outputs include
source digest, image digests, build diagnostics and a review-only manifest.
New captures are direct simulator JPEGs in separate appearance directories; no
app pixels are fabricated or edited. These are genuine native sample captures,
**not submission-approved screenshots**.

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

## 13-inch iPad and opaque format — 2026-10-13

The updated capture script supports iPhone/13-inch iPad and light/dark variants,
and directly captures JPEG. An unsigned Debug simulator build succeeded; all
five real tab screens in each of the two appearances were visually reviewed.
All ten files were independently inspected as 2064 × 2752 JPEG without alpha.
No real household, payment or user device was used. This establishes review
image format and sample iPad layout only; the final signed-build submission
images, family detail, iPhone dark/opaque variants and accessibility remain.

## iPhone light/dark opaque format — 2026-10-13

The guarded capture script was run for both appearances on its own iPhone 18
Pro simulator. Debug build succeeded; all ten JPEGs were visually inspected
and independently measured as 1206 × 2622 without alpha. The current-source
feature gates were checked as disabled before building. Family detail, large
text/physical accessibility and final signed-build submission assets remain.

## Large-text initial viewports — 2026-10-13

The script now accepts `--text-sizes large accessibility-extra-large
accessibility-extra-extra-extra-large`. It sets the content size on its own
created simulator only and stores captures under appearance/text-size directories.
AX3 and AX5 initial viewports were captured for all five tabs in light appearance
on an isolated iPhone. All ten images were visually inspected and measured as
1206 × 2622 opaque JPEG. Visible home names, product/task labels and settings
labels wrap; accessibility-size navigation titles are inline.

This is partial accessibility evidence. Long cards extend below the viewport.
The screenshots do not prove scrolling to those controls, activation, VoiceOver
focus/reading order, keyboard handling, dark-mode large text or physical-device
behavior. No accessibility requirement is marked complete from these captures.
Shipping Swift sources were not changed by this capture-tool update.
