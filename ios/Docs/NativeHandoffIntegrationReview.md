# Native household handoff integration review — 2026-10-15

This prepared client is not linked from shipping navigation. The current server endpoint, current Auth/MFA authorization, attachment custody and release gates must be verified before exposing it. No production household, membership, Auth identity or file is changed by this preparation.

## Client behavior

- Bind the original account, registration epoch, home and request to one immutable intent. Persist and read back the device-only Keychain record before sending a mutation. Do not store a bearer, password, remote ownership flag or renewable server deadline in that record.
- Reject zero or self recipients before changing the in-memory recipient or calling persistence. Once a valid recipient could have been sent, preserve that recipient across an uncertain response and authentication revision changes; never reuse the request for another person.
- Before a decision, read the original request. Completed or cancelled decisions are recovered without sending another decision. An expired acceptance is refused. Unknown communication results remain unconfirmed.
- A successful result must use application/json and exact no-store caching, with bounded body and consistent declared size. A cacheable or HTML response cannot report completed ownership, even if its JSON fields match the request.
- The separate saved-intent screen performs GET only. An account/epoch change refuses lookup rather than changing the intent. Explicit removal deletes only this device's reference and never cancels the server operation.
- The prepared TOTP client uses existing verified factors only. It does not enroll or remove a factor. The session controller discards factor/challenge/verification results after logout, restore, account or token replacement. Verified credentials require durable storage readback. This is not an authorization permit for household handoff or erasure.
- Account deletion recognizes only the exact same-origin POST 409 `family_handoff_required` refusal as a confirmed non-acceptance. Foreign URLs, unknown bodies and GET failures remain failures, not receipts or completed deletion.

## Reproduced defect and correction

The new invalid-recipient test initially failed: a zero UUID reached the persistence adapter, and the failed attempt left the in-memory recipient fixed to that invalid value. A following valid recipient then failed without sending a request. The create guard now rejects the zero UUID before capturing intent. The test requires zero persistence/network calls for invalid input, then a successful valid request on the same flow. The existing lost-acknowledgement recipient immutability test remains in place.

The full local Swift package suite after the recipient and private-response corrections passed 67 tests, zero failures: HomeHandoff 8, TOTP 8, HouseholdAPI 27, closure review 8, receipt API 6, receipt recovery 6 and receipt registration 4. These use synthetic identities and injected transports. The new private-response test first reproduced seven invalid-response acceptances, then passed after the API fix. They do not establish actual GoTrue MFA, shipping HTTP routing, physical iPhone Keychain, cloud ownership transfer or whole-account erasure.

## Actual HTTP and protected restart

`ios/Tests/home-handoff-http.mjs` compiles and runs the actual DEBUG HomeHandoffAPI/Flow using default URLSession. It calls the existing HTTP handler and the authoritative CI migration sequence in PGlite. After SQL commits acceptance, the test server destroys its response socket. The native flow keeps its protected original reference and does not report completed. A separate executable process then reads the same account/epoch/home/request from the dedicated macOS Keychain service and recovers the completed request and original deadline by GET. Repeating an already completed decision does not send another PUT. URLSession transport retries, if any occur during the initial connection failure, may only replay that original idempotent decision; recovery cannot create another request.

The test snapshots exact products, tasks, history, the other family member and Auth IDs before/after; only the home owner and the successor's redundant membership change. Foreign bearer/epoch, redirects, HTML, public caching, declared oversized and streamed oversized responses must be refused. Redirect destinations receive no bearer. Cleanup removes only its unique synthetic Keychain reference, marker and temporary build directory. This does not prove live GoTrue MFA, the other-app shared-controller guards, attachment custody, family RLS access, shipping deployment or physical iPhone protection.

## Release requirements still open

1. Connect the fixed server route to independently verified current identity, registration, policy, MFA, membership and transaction authority. Client flags or local token parsing cannot authorize transfer.
2. Provide recipient discovery and an explicit acceptance path; reload home/member state after verified completion. Preserve exact products, tasks, history and family access.
3. Complete attachment ownership, uploader attribution, retained access, capacity and durable cleanup verification with the actual service composition. No deleting an attachment to pass a guard.
4. Verify the shipping route/current Auth integration, restart UI interaction, Dynamic Type, VoiceOver and a physical device. The actual HTTP embedded-SQL test above is a separate narrower check. Apply finite request/reference retention after reviewing custody requirements.
5. Reconcile canonical migrations and least-privilege runtime configuration before any production activation. Current disabled gates and Apple payment hold remain unchanged.

Supabase's current TOTP guide was reviewed on 2026-10-15: https://supabase.com/docs/guides/auth/auth-mfa/totp . Challenge/verify can promote a session, but operation authorization remains server-owned. The same-day cached changelog notes TLS cipher deprecation on November 10; this client adds no custom TLS or legacy cipher configuration.
