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
