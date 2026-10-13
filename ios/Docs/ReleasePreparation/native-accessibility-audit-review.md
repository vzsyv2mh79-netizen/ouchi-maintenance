# Automatic accessibility audit baseline — 2026-10-13

Status: **failed; not accessibility or release approval**.

The in-memory sample was audited at AX5/light on an owned iPhone simulator.
All five initial tab viewports were visited. Seven categories were requested:
contrast, Dynamic Type, element detection, hit region, sufficient element
description, clipped text and traits. No issue handler or suppression was used.
The initial test failed with 32 issue occurrences: 17 partial Dynamic Type,
13 potential text clipping, and 2 contrast issues. These are repeated findings,
not 32 independently established shipping defects.

Log-to-element correlation identifies 24 occurrences on the three home-picker
labels across four tabs; five Dynamic Type findings identify the Debug-only
sample badge whose source deliberately caps text size. One clipping finding
identifies the reload label. Contrast findings identify below-fold care/count
labels; inspected element screenshots show tab-bar overlap/offscreen content.
These observations need further validation rather than categorical dismissal.
The UI issue inspector and device review remain necessary.

A NavigationLink-only replacement in the accessibility-size branch was tried
with the same seven categories and five tabs. It also produced 17/13/2 findings.
It was reverted: no improvement was proved and no selection behavior test ran.
The shipping Swift source digest is restored to
`b9d39483bbeda16c4ebf25b9115cb1e46f8d6fcd`. Both owned simulators were removed.
The diagnostic test remains local and has not been added to the draft PR.

Next: distinguish Debug instrumentation and the structure change at the
accessibility-size threshold from actual shipping problems, examine complete
visible controls as well as initial viewports, and validate any resulting UI
change with selection/interaction tests. Do not mark VoiceOver, all forms,
dark-mode accessibility, physical iPhone or release readiness complete.

Official API reference:
https://developer.apple.com/documentation/xcuiautomation/xcuiaccessibilityaudittype

## Stable home-menu candidate and Release-header diagnostic

A subsequent local candidate keeps a Menu at every Dynamic Type size, avoiding
replacement of the picker control during resizing. Only the guarded in-memory
Debug sample can omit its Debug-only build badges for a Release-layout audit;
shipping Release already omits those badges. No audit issue is suppressed.

The AX5/light five-tab audit at source digest
`8f3b8e6032b92900a81153cc95b1f740adceecf2` failed with two occurrences:
reload-label clipping on Home, and contrast on the sample product memo.
There were no Dynamic Type findings in this run. This proves a narrower
improvement, not overall accessibility approval. The memo screenshot is partly
under the tab bar and must also be checked after scrolling into view.
Artifacts: `output/ios-development/accessibility-audit-20261013-stable-home-ax5`.
The test's owned simulator was removed, as recorded in verification.json.

The next local candidate explicitly wraps the reload text vertically and gives
the theme symbol a fixed 22-point font inside its existing 44-point hit area.
Its verification is pending. A separate current-home menu reselection test is
now complete: AX5/light passed (1 passed, 0 failed, 0 skipped). Both menu-open
and reselected attachments were reviewed and its owned simulator was removed.
Its source digest is `8f3b8e6032b92900a81153cc95b1f740adceecf2`, before the
refresh-label/theme-symbol edits. Its one-home fixture does not prove switching
between two homes. Artifacts: `output/ios-development/home-menu-interactions-20261013-ax5`.
These candidate source changes and diagnostic tests remain unpublished.

A focused `memo` test mode has also been prepared. It scrolls the actual sample
memo fully between the navigation bar and tab bar using the existing strict
reach helper, captures the view, and requests all seven categories without an
issue handler. Its AX5/light run is now in progress; source parsing passed.
It does not yet establish that the initial contrast finding is a false positive.

The wrapped-refresh/theme-symbol candidate's five-tab test log now reports two
contrast occurrences (overdue care on Home, sample memo on Products), with no
reload text-clipping or Dynamic Type issue reported. The test case failed; the
result bundle and cleanup were still being finalized at this observation.
Do not mark the candidate accessibility-approved. Artifacts:
`output/ios-development/accessibility-audit-20261013-wrapped-refresh-ax5`.

Result finalization is currently collecting Xcode's `simctl diagnose` for the
owned simulator (600-second diagnostic timeout). Its live process was checked;
the result reader still lacks the final Info.plist. Do not restart solely on
that observation or claim bundle inspection/cleanup complete before it exits.

The helper now also supports `--appearance light|dark` (default light) and an
`overdue` mode that brings the reported Home label entirely above the tab bar
before the same seven unfiltered categories. These additions passed parsing
only; no dark appearance run or overdue-focused audit has run yet. The ongoing
memo run predates these test-helper additions and remains independently scoped.

The focused memo test case subsequently failed with one contrast occurrence;
the log identifies the static text `製品`, rather than the memo. The strict reach
helper completed and its full-viewport attachment was captured, but the result
bundle/images still require inspection after finalization. This is evidence
that the reported element changed after scrolling, not a passing screen audit
or permission to suppress system/navigation elements. Source changes remain
local and release readiness is still unproven.

The five-tab wrapped-refresh result is now finalized and independently read:
0 passed, 1 failed, 0 skipped; two contrast occurrences. Its source digest is
`99e1b8b8917da44ff860bdf56f788305778f5026`; owned simulator removal was verified.
Three exported app screenshots were reviewed. The reload text wraps without
visible truncation and the theme symbol remains compact; reported overdue/memo
content is partially under the translucent tab bar in these initial viewports.
This observation does not override the failed audit. Verification.json records
the exact images reviewed and limitations. A current-source AX3/dark home-menu
reselection test has now started at
`output/ios-development/home-menu-interactions-20261013-dark-ax3`; its result is
pending. The memo result is still being finalized and the overdue mode remains
unrun. No current-source change was published or activated.

The AX3/dark current-home reselection run completed successfully: xcresult
reports 1 passed, 0 failed, 0 skipped; both menu-open and reselected images were
reviewed and the owned simulator was removed. It uses source digest
`99e1b8b8917da44ff860bdf56f788305778f5026` and is limited to the one-home fixture.
The compact sun symbol, wrapping refresh text and menu labels are visible.

The focused memo bundle was finalized and read (0 passed, 1 failed, 0 skipped),
and all three PNG attachments were reviewed. The memo is wholly visible above
the tab bar. The reported element crop identifies black `製品` title text; the
app screenshot includes its translucent navigation bar over scrolled content.
The remaining title contrast failure is unresolved; no issue was suppressed.
Its owned simulator was removed. The later live-post-failure screenshot showed
the simulator home screen and is not evidence for the audit-time app layout.

A local two-home fixture variant is now prepared behind the exact sample bundle,
Debug/sample-data guards and an explicit `OUCHI_REVIEW_TWO_HOMES=1` environment
flag. Default captures retain their one-home data. The `home-switch` test selects
the empty member home, checks the owner home's product/history are not displayed,
then returns to the owner home and checks those records reappear. Its AX5/light
run is in progress at `output/ios-development/two-home-interactions-20261013-ax5`.
Parsing passed; result/images remain unverified. This tests UI filtering only,
not live cloud authorization/RLS. These fixture, store, UI-test and helper changes
remain local and have not been added to PR #167.

A separate `theme` test mode is prepared to toggle the actual appearance button,
terminate/relaunch the sample app, verify the same choice is retained, and restore
the starting appearance. Parsing passed; this new test has not run yet. It does
not infer persistence from a source flag or a static screenshot. Its AX5/light
run is now in progress at `output/ios-development/theme-retention-interactions-20261013-ax5`.

The two-home AX5/light run completed: xcresult reports 1 passed, 0 failed,
0 skipped, all three exported images were reviewed, and owned simulator removal
was verified. Source digest: `3f0791be3dd1cb4cd01a68890c03943c57754ca7`.
The empty member-home product/history views and restored owner-home product
are visible in the attachments. This is UI filtering proof, not cloud RLS proof.

The theme AX5/light-start run completed successfully: 1 passed, 0 failed,
0 skipped; both dark-after-toggle and dark-after-relaunch images were reviewed,
the final toggle restored the starting appearance, and its owned simulator was
removed. Source digest remains `3f0791be3dd1cb4cd01a68890c03943c57754ca7`.

The validated UI changes and sample-only tests are being prepared for the draft
PR after bdf0bfb's five workflows passed. This preserves failed contrast audit
evidence and does not mark VoiceOver, dark audits, all forms, normal-size final
screenshots, physical-device verification or release readiness complete.

Seven exact files were subsequently published to draft PR #167 at
`a49a6991686f8a43d2bec5c4b39bbefa0eeec5e9`, parent bdf0bfb. Prepared blob hashes
matched the tested local files and the published Git tree was read back. Its
five new CI checks are running; previous-head success is not new-head approval.
Current-source normal-size light/dark five-tab capture is now in progress at
`output/ios-development/current-ui-normal-captures-20261013-a49a`. It is a sample
Debug capture, not final signed App Store screenshots. No production or billing
gate was enabled. The publication manifest is saved under output/ios-development.

The current-source iPhone normal-size capture completed: ten light/dark initial
tab JPEGs were visually reviewed, independently checked as 1206×2622 without
alpha, and the owned simulator's absence was confirmed. The capture manifest
records all ten images and remaining scope. Menu/refresh/theme controls and
sample products/history/settings are visible; this does not prove every scrolled
screen, accessibility, family detail, signed release or App Store submission.

Current-source iPad light/dark initial tab capture also completed. All ten JPEGs
were reviewed, independently measured as 2064×2752 without alpha, and the owned
simulator's absence was confirmed. Artifacts:
`output/ios-development/current-ui-ipad-captures-20261013-a49a`.
Along with the current iPhone set, this provides twenty sample initial viewports
at the same source digest. It does not approve device interactions, accessibility,
final signed screenshots or submission. All five a49a699 CI workflows completed
successfully; the Native job's Release build, built SDK metadata checks and Debug
build steps were individually confirmed successful.

An opaque adaptive system-background navigation-bar trial was built and audited
at AX5/light on 2026-10-13. Artifact directory:
`output/ios-development/opaque-navigation-memo-audit-20261013-ax5`.
The xcresult summary reports 0 passed, 1 failed, 0 skipped. Three exported PNGs
were reviewed. The visible memo is above the tab bar and the product title is
black on an opaque white bar. The unfiltered audit reports a SwiftUI node
identified by XCTest as `住まい`; its exported element crop instead shows the
status-clock region. The `住まい` header is above the currently visible scrolled
content. This disagreement is not treated as an approved false positive or
suppressed finding. The trial remains local; it does not establish full-screen
contrast compliance or eliminate the historical navigation-title finding.
The helper finished with test failure. Its manifest confirms the owned simulator
was removed; source digest is `8db946a7cb1b28d91af49dad84e5f9f387bc427b`.

The same-source AX5/light five-initial-tab audit is running in
`output/ios-development/opaque-navigation-full-audit-20261013-ax5`. This broader
unfiltered pass is required to assess the candidate; no new shipping change
has been published and the focused result remains failed.

The opaque-bar five-tab AX5/light run finished at source digest
`8db946a7cb1b28d91af49dad84e5f9f387bc427b`: xcresult 0 passed, 1 failed,
0 skipped. Its test log reports two contrast failures. All five initial-view
PNGs, both failure app screenshots and the exported element crop were reviewed
(eight PNGs). The two app views show Home/Product text underneath the floating
tab bar. This remains a failed unfiltered audit, not an approved false positive.
The helper manifest confirms its owned simulator was removed.

The initial captures also show the three-part home selector using most of the
viewport at AX5. A subsequent local candidate presents only the selected home
name with a down-chevron, using the same Menu for all text sizes. Its semantic
accessibility label states the switch action and its value states the selected
home; it does not hide text from the audit. Name wrapping and the 44pt minimum
control height remain. The exact sample's five-tab AX5/light audit is now running
at `output/ios-development/compact-home-menu-full-audit-20261013-ax5`.
Results, menu operation, two-home filtering, dark appearance and VoiceOver
remain unverified for this candidate. The opaque-bar and compact selector edits
are local and have not been added to PR #167 or activated in production.

The compact-selector two-home AX5/dark run completed at source digest
`d872ee3f52011d96f89ca9e92a908763698778b4`: xcresult 1 passed, 0 failed,
0 skipped. All three exported PNGs were reviewed and owned-simulator removal
was confirmed in the helper manifest. The revised query checks the Menu action
label and selected-home accessibility value, not a visually repeated name in
the action label. Member-home products/history are empty and returning restores
the owner-home sample record. This proves isolated UI filtering, not live RLS
or VoiceOver. The AX5/light five-tab test log reports one text-clipping failure
for the task's product label and one contrast failure for its next-date label;
its result bundle is still finalizing. These findings are not suppressed.

The compact-selector initial audit bundle finalized: 0 passed, 1 failed,
0 skipped, and owned-simulator removal is confirmed. Both failure app views and
both element crops were reviewed (the five initial screenshots remain to be
reviewed). The product-name crop shows two complete-looking wrapped lines; the
audit nevertheless reports text clipping, so it remains unresolved. The next-
date crop intersects the floating tab bar, corroborating occlusion. No issue
was suppressed. Dark two-home operation passes at the same source digest; this
does not prove full accessibility or all forms. Both helpers have completed.

The remaining five initial-view screenshots of the compact-selector audit were
reviewed on 2026-10-13 (all nine exported PNGs now reviewed). The shorter selector
leaves the date, overdue heading, product memo and history record more visible.
The task product-name clipping and next-date contrast findings remain unresolved.
A subsequent local candidate gives each task metadata Text its full vertical
wrapping size without forcing horizontal overflow and fills available row width.
The unfiltered five-tab AX5/light audit is running at
`output/ios-development/wrapped-task-metadata-audit-20261013-ax5`.
A new helper `completion` mode selects the existing meaningful UI test for the
actual completion button, exact next due date and exactly one history addition;
its AX5/light run is active at
`output/ios-development/wrapped-task-completion-20261013-ax5`.
The helper parses successfully (AST check without writing user cache files).
No result or image has been approved for this newer metadata candidate yet.

The explicit metadata wrapping trial completed at source digest
`b9ac1e8829a3d0111667cd511edbbb647e33cc1a`. Initial audit xcresult:
0 passed, 1 failed, 0 skipped, with the same two finding occurrences. Both failure
app screenshots and both element crops were reviewed; the five initial captures
remain to be reviewed. Product-name crop still appears fully wrapped while the
audit reports clipping, and next-date crop is under the floating tab bar. No
finding was dismissed or suppressed. Owned simulator removal is confirmed.

The same-source completion run succeeded: 1 passed, 0 failed, 0 skipped; both
completion-reachable and completion-history PNGs were reviewed and owned-device
removal confirmed. The test executes the actual completion action and checks
the exact 30-day next date and one history addition, not just source flags.
It proves isolated in-memory sample interaction only. Artifacts:
`output/ios-development/wrapped-task-completion-20261013-ax5` and
`output/ios-development/wrapped-task-ui-evidence-20261013-b9ac.json`.
The successful operation does not override the failed accessibility audit.
Next: reassess task metadata row layout and visible element frames; do not repeat
small fixed-size changes as though the audit passed. No simulator/test session
is still active from these two runs. No shipping change was published.

After unchanged clipping/contrast findings in the explicit-size trial, task
metadata was restructured as independent List rows. This keeps each item
independently measurable and scrollable instead of a single nested metadata
VStack. All content, text-size scaling, source distinction and completion action
remain. The new unfiltered five-tab audit and existing meaningful completion
test are running at `separate-task-rows-audit-20261013-ax5` and
`separate-task-rows-completion-20261013-ax5` under output/ios-development.
This is an unverified local candidate, not a shipping/accessibility approval.

The independent task-row completion run succeeded at source digest
`18bbb6dc9cef82434cdee18117b39bfeea2c081f`: xcresult 1 passed, 0 failed,
0 skipped. Both exported PNGs were reviewed and its owned simulator removal
confirmed. The actual button advances the next date by 30 days and adds exactly
one history record. Its unfiltered five-tab audit log still reports two failures
(product-name clipping and next-date contrast); xcresult/diagnostic finalization
is still running, so its result bundle and screenshots are not yet inspected.
This layout keeps metadata independently scrollable but is not a fix proven to
remove those audit findings. No findings were suppressed.

The candidate's NativeRootView was compared against the current remote PR file.
Only the three intended edits are present: compact semantic home Menu, opaque
adaptive navigation background, and independent task metadata rows. The UI test
checks the home selector's action label plus selected value; the helper's new
completion mode invokes the existing behavioral test. These tested candidates,
current negative audit evidence, and read-only Storage cost review are being
prepared for the draft PR. No main/production merge, paid contract or actual
purchase is authorized by this documentation.

The independent-row audit result finished finalizing on 2026-10-13. xcresult
reports 0 passed, 1 failed, 0 skipped; execution log contains two occurrences
(product-name clipping and next-date contrast). All nine exported PNGs were
reviewed: five initial tabs, both failure app screenshots and both element crops.
Product-name crop appears fully wrapped and date crop intersects the floating
tab bar; neither finding is dismissed or suppressed. Its owned-simulator removal
is verified. Source digest remains `18bbb6dc9cef82434cdee18117b39bfeea2c081f`.
No UI test or simulator session from these runs is still active. All five CI
workflows at published head021ee succeeded. Native job115148913599's unsigned
Release/Debug builds and built Release SDK metadata steps were individually
confirmed successful. This does not override the failed accessibility audit.
