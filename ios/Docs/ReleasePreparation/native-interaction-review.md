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
