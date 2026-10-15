# Care multiline typography - 2026-10-16

Status: focused AX5 dark/light Care checks and the five initial dark tab audits
passed. Manual/physical-device accessibility and final submission remain open.

Care title, product, next date, interval, source kind and note now use the same
multiline UILabel renderer. It measures height at the proposed width, uses the
corresponding preferred headline/subheadline/caption1 text style and semantic
label/secondaryLabel color. It keeps the existing List, navigation and actions.
There is no font shrinking, line cap, fixed device width, accessible-label
replacement or issue filtering.

The neutral UIKit-label comparison passed both stock List and eager ScrollView
contrast checks. That diagnostic was followed by actual in-memory sample app
checks on iPhone17e/iOS27 at AX5, all with the same app source digest:
`fed08f5266d6056d02f0a3ebb7da50fe8d8ee80c`.

- Dark Care: 4 passed, 0 failed/skipped. Completion added exactly one history
  entry and updated the next date; export reached share controls; unfiltered
  product textClipped and visible-date screen contrast audits passed.
- Light Care: 5 passed, 0 failed/skipped. The same four checks plus an accessible
  task-title button -> editor -> same-task return passed. The editor's full
  sample field value was checked; keyboard editing was not part of this test.
- Dark initial tabs: one test visited Home/Care/Products/History/Settings and ran
  all seven categories on each initial viewport: contrast, dynamicType,
  elementDetection, hitRegion, sufficientElementDescription, textClipped, trait.
  It passed without suppressing findings. This is not35 individual tests.

Official xcresult summaries independently confirmed test counts and zero
failures, skips or expected failures. Structured runtimeWarnings were empty;
raw simulator console diagnostics are retained, not described as empty. Four
owned simulators including the neutral comparison were removed. Five initial
screens plus focused dark/light and editor images were visually reviewed.

The dark run used the four-test harness before editor navigation was added.
Its exact older harness was reconstructed and hash-matched. Light and initial
runs use the current harness; `care-regression` now selects five tests. Repeated
flows across appearances are not additional unique coverage areas.

Native bar overlap remains visible while scrolling. Passing the stated label
measurement/semantic-color audits is not proof that every offscreen overlay,
form, text size, rotation, live font change or VoiceOver interaction is resolved.
No real cloud/purchase or final signed IPA is verified by these sample tests.
The previous signed IPA predates this source change and must be rebuilt.

Evidence: `ReleasePreparation/care-semantic-text-20261016.json`.
Fixed source/evidence manifest SHA256:
`a2d1adeba21149e1bf221d63eb1874c4c17a67f5cf05e32cd97e711df1956632`.

## Prior product-only investigation - 2026-10-15 (historical)

The AX5/light iPhone 17e audit identified the complete sample product name as a
SwiftUI text-clipping finding even when its accessible frame was entirely
inside the content viewport: x16/y236.67/w358/h162.67, navigation bottom155 and
tab-bar top761. The screenshot wrapped both lines. That was not enough to dismiss
the finding as a false positive.

The product-name row now uses a multiline UILabel through UIViewRepresentable.
The same text renderer measures its height at the proposed width. It retains
semantic subheadline typography, follows inherited content-size traits, uses
adaptive label color and keeps the full accessible text. There is no font
shrinking, line limit, fixed device width or accessibility override. The change
is limited to the product-name row; task completion and persistence are unchanged.

In the actual iOS simulator, the AX5 sample reported width326, preferred font49pt,
label height116.67 and NSString bounds height116.47. The sample-only DEBUG log
contains dimensions, not product names. An earlier standalone Catalyst attempt
returned an unscaled15pt for every category and was not used as iOS evidence.
A standalone iOS measurement attempt produced no measurements and was also not
used as evidence. The successful numbers came from the actual sample screen.

The unfiltered product textClipped category passed at AX5/light, and passed
again during a subsequent scroll-edge experiment. The screenshots were reviewed
and the full product name remained readable. Every issue-handler return is false;
no audit finding is suppressed. The test runner now checks Swift syntax before
creating a temporary simulator.

The contrast category still fails when neighboring text crosses under a bar.
One recorded finding was the interval row at y717.3/h81.3 behind the tab bar at761.
Trying the standard hard bottom scroll edge instead produced a task-title
finding partly above the navigation bar at y-48.7/h187.3. That trial was rejected
and the prior scroll-edge behavior restored. The product-name renderer remains.
Neither the failed category nor the earlier contrast findings are dismissed.

Normal-text dark completion/export verification passed 2/0/0 on the same source
digest. Completing the actual sample added exactly one history entry and updated
the due date. Export produced the reachable share/save control; no external
destination was opened. Three screenshots were reviewed. Both runs used synthetic
in-memory data, and their temporary simulators were removed.

Live text-size changes, AX5 dark and other categories/viewports, VoiceOver, physical
iPhone, real cloud persistence and the final signed release remain outside this
proof. The known contrast category still fails; this is not full accessibility
or App Store release approval.

References:
- https://developer.apple.com/documentation/swiftui/uiviewrepresentable/sizethatfits(_:uiview:context:)
- https://developer.apple.com/documentation/xcuiautomation/xcuiaccessibilityauditissue
- https://developer.apple.com/documentation/swiftui/scrolledgeeffectstyle

## Rejected tab-background trial, later on 2026-10-15

An explicit system-background/visible tab-bar preference was tested with the
unchanged unfiltered task audits on iPhone 17e, AX5, dark appearance. Product
textClipped passed; contrast failed for the source-kind label at y798.7/h81.3.
The captured viewport still showed text beneath the floating tab controls.
Both saved viewports were inspected. The trial did not resolve the issue and
was removed; NativeRootView was byte-compared with its published starting source.
The ephemeral simulator was removed. There were 2 tests, 1 pass, 1 failure,
0 skipped. This does not improve the accessibility completion claim.
