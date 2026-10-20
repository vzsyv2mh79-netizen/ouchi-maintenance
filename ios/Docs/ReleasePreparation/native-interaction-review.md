# Native large-text interaction review

`ios/scripts/test-large-text-interactions.py` creates an ephemeral Xcode UI-test
project and its own simulator. It copies the current native sources, keeps every
live feature gate disabled, excludes `Local.xcconfig`, supplies synthetic Auth
configuration and uses the existing in-memory sample transport. The shipping
Xcode project and existing simulators are not changed. Real accounts and StoreKit
purchases are not used. Output directories must be fresh.

Example:

```
python3 ios/scripts/test-large-text-interactions.py --text-size accessibility-extra-extra-extra-large --output /absolute/fresh/ax5-interactions
```

The UI tests scroll to the actual completion and export controls, tap them, and
check the next due date, the exact number of sample history entries, and the
export share control. XCTest attachments capture reachable controls and results.
These tests cover in-memory UI behavior only. They do not prove real cloud
persistence, exported file content, VoiceOver order, keyboard handling, actual
iPhone behavior, purchases, or signed release readiness.

The runner saves an xcresult bundle, full build/test diagnostics and a manifest,
and verifies that the one simulator it created was removed. A successful
process exit must still be reconciled with the actual xcresult test counts and
failures. A failed or interrupted run is not accepted as evidence.

## Current verification

The first local runner preparation failed before creating a simulator because
of a Python helper argument collision. The helper was corrected. The subsequent
AX5 run passed two tests with zero failures and zero skips, and its owned
simulator was removed. Four XCTest attachments were inspected. They showed that
`isHittable` alone can accept a button partly under the translucent tab bar.
The reach helper was tightened to require the complete control rectangle below
the navigation bar and above the tab bar. The strengthened AX5 run passed both tests, with zero failures and zero skips.
The xcresult summary was independently read; all four attachments were visually
inspected. Completion, export and export sharing controls were entirely visible
above the tab bar. The next date advanced 30 days and the sample history had
exactly two entries (one existing, one new). The owned simulator was removed.
The earlier pass does not establish fully visible controls. AX3 interaction,
dark large text, keyboard forms, VoiceOver and physical iPhone remain unverified.
Shipping Swift sources and the shipping Xcode project were not modified.


## AX3 follow-up — 2026-10-13

On a separate newly created iPhone simulator at AX3, both strengthened tests
passed with zero failures and zero skips. The xcresult summary was independently
read and all four screenshots were inspected: completion and export controls
were wholly visible before tapping, and export sharing was wholly visible after
scrolling. The sample date advanced 30 days and history contained exactly the
one old and one new entry. The owned simulator was removed. Together AX3/AX5
have four passing test executions and eight reviewed attachments in light mode.
This still does not prove cloud persistence, export file content, keyboard,
VoiceOver, dark large text, physical iPhone or final signed release behavior.


## Product model keyboard and cancel at AX5 — 2026-10-13

The runner accepts `--test editor` to select the actual product-editor case.
At AX5/light, the real product navigation was activated, the model field scrolled
fully above an actually open software keyboard, and a character was entered.
The character was present in the field. Back navigation without saving returned
to the original sample model. One test passed, zero failed, zero skipped; the
xcresult summary and both attached screenshots were inspected. Its own simulator
was removed. The reach helper accounts for keyboard bounds as well as tab-bar
bounds. The model field is a single-line text input and may scroll horizontally;
this does not prove every long model number is simultaneously visible.

No search, save, cloud mutation, purchase or real account was used. AX3 editor,
other fields/save controls, dark keyboard, landscape, VoiceOver, real iPhone and
cloud persistence remain. Shipping Swift sources were not changed.


## AX3 editor and shared-helper regression — 2026-10-13

With the keyboard-aware reach helper, all three AX3/light tests passed (zero
failures and zero skips). The xcresult summary was independently read and all
six attached screenshots inspected. Software-keyboard model entry and leaving
without save preserved the original model; completion/date/history and export
controls also passed again. The owned simulator was removed. The AX5 editor
case separately passed once. These are four current test executions, not four
different features and not proof of all form fields or cloud persistence.

Long single-line product/model input fields can truncate or scroll horizontally
when unfocused or while editing; the review does not claim that all text is
simultaneously visible. Other fields/save controls, dark keyboard, landscape,
VoiceOver, physical iPhone and final signed release still require review.

## Independent accessibility audit matrix — 2026-10-19

The combined seven-category audit at AX5/dark timed out on the Home viewport.
Its xcresult reports one failure, zero passes, and zero skips. Five initial
viewport screenshots were captured and inspected, but they do not prove that
all categories ran on the remaining tabs. This run is not a release clearance.

The `--test audit` selection now runs 35 independent XCTest cases: Home, Care,
Products, History and Settings, each with contrast, Dynamic Type, element
detection, hit regions, sufficient descriptions, clipped text and traits. Each
case launches the actual sample UI with the shipping header layout, attaches
its initial screenshot, reports every issue (`return false`), and terminates
its sample app. No categories are omitted or marked handled. Xcode execution limits
are requested (180 seconds default, 240 seconds maximum per case); these are
not a guaranteed wall-clock deadline. A reported timeout remains a failed case,
rather than a passing or skipped result.

For diagnosis, `--test audit --audit-case home-contrast` selects just one cell.
Its manifest lists the exact selected cases and `fullMatrixSelected: false`.
Only an inspected xcresult covering all 35 cases without failures or skips can
support a full matrix pass. A successful diagnostic cell cannot substitute for
that result. The AX5/dark iPhone 17e matrix passed all 35 cases with zero failures,
zero expected failures and zero skips. The actual xcresult case names matched
the selected 5 × 7 matrix exactly. Its runtime-warnings list was empty, the five
initial contrast screenshots were visually inspected, and its owned simulator
was removed. The History/textClipped case took 1004.783 seconds despite the
requested limits; the timeout options must not be presented as hard wall-clock
enforcement. No issues were filtered. Shipping native app sources were unchanged
(source digest `531b76fff70ef9d24ad3355499055fbb5f76c30e`).

This covers initial viewports at one text size/appearance/device, not offscreen
controls, all forms, other sizes/orientations, live persistence or purchases.
VoiceOver and physical-device review remain separate.

## Shipping-layout keyboard verification at AX5/dark — 2026-10-19

A subsequent two-case run passed the visible overdue-count audit but failed its
keyboard visibility assertion. Its screenshot showed the software keyboard,
while XCTest's first keyboard element described an offscreen preview (y861 in
an app viewport ending at y844). This did not establish a production UI defect.
The editor test also included an extra review banner that is not in the shipping
header and changes available form space.

The editor test now selects the shipping header and waits up to ten seconds for
an onscreen, hittable keyboard from the complete keyboard query. Mere existence
still cannot pass: the visible intersection must be at least100pt high and the
entire model field must remain at least8pt above that exact keyboard frame.
Failure diagnostics are retained. No issue is filtered, skipped or accepted as
an expected failure. The runner marks editor selections as using release layout.

The actual AX5/dark iPhone17e test passed once, zero failures/skips, with no
xcresult runtime warnings. Both screenshots were inspected: the software
keyboard and entered X were visible; leaving without save restored SAMPLE-001.
The owned simulator was removed. The native product-source digest remains
`531b76fff70ef9d24ad3355499055fbb5f76c30e`; only tests/documentation changed.
This does not prove every field, long single-line model visibility, cloud saves,
VoiceOver or physical-device behavior, and it does not replace the35-case audit.

## Retained-family file removal recovery at AX5/dark — 2026-10-20

Actual iPhone 17e/iOS27 simulator case passed: 1 passed, 0 failed, 0 skipped and no runtime warnings. All five attachments were visually inspected. Cancel/dismiss preserves the sample PDF; the explicit sample destructive action moves that exact ID to pending and removes download access; same-ID retry clears pending while the separate photo remains available.

On iOS27 the large-text confirmation presents as a popover with an accessible PopoverDismissRegion instead of a cancel button. The test accepts either actual dismissal control, then enforces unchanged-file and no-pending postconditions. The earlier button-only test failed and was retained as diagnostic evidence; no assertion was skipped.

Only the existing shipping sections in a DEBUG sample Form were exercised. No real Auth/Storage request or erasure occurred; this does not prove parent-form/server integration, physical iPhone or VoiceOver behavior. Native product sources remain unchanged. The owned simulator was removed. Evidence: output/native-retained-removal-popover-ax5-dark-20261019/verification.json.
