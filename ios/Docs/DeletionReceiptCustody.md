# Deletion receipt custody preparation

Based on Native PR head bca74d8674afaced583d77f0eedaf3c163b7197f. DeletionReadCredentialVault is included in the iPhone application target; unsigned simulator Debug and Release builds passed. This is compilation integration, not a connected deletion UI or HTTP endpoint.

The device generates and saves 32 random bytes before registration, using WhenUnlockedThisDeviceOnly and a nonsynchronizing Keychain item. Existing request/account/inventory/deadline must match; retry cannot rotate or extend. A pending deletion credential must not be implicitly cleared by logout. The caller must wire explicit expiry/completion cleanup. No token goes to logs, URLs or backups.

Fresh isolated macOS namespaces passed save/readback, scope/deadline refusal, deletion and fresh-process hash comparison. A separate review app on iPhone17e/iOS27 passed save/readback/refusal/deletion. Existing user sessions/records were not accessed. The two standalone synthetic smoke programs live in Tests, outside the application target.

DeletionReceiptAPI now prepares POST registration and GET status requests with the credential only in a header. It rejects changed acknowledgement deadlines and redirected responses. DeletionReceiptRegistrationFlow requires a durable custody read-back before HTTP, clears readiness on failure, retries the same credential/deadline after a lost reply, and discards acknowledgements after account/revision changes. The vault provides the application adapter. Four injected-transport flow tests and five API tests passed; these are not real-server or physical-device tests.

Still pending: real initial Auth verification, actual server route and deletion-claim connection, live screen wiring, revocation/expiry operations, background/lock/restart and physical-device verification. Custody alone does not prove account deletion or submission readiness. No paid infrastructure, production setting or real billing is enabled.

## Export verification

The macOS suite passed 29 tests after account-scope/restart tests used the existing unprotected synthetic fixture helper. This does not test protected writes on macOS and does not change production ManagedExportStorage.write. A separate iOS27/iPhone17e simulator review app called the actual production write, reopened the files, removed only the current account exports, preserved another account and user-saved copies, and refused a replaced symlink root. The simulator returned no file protection attribute: device encryption and locked-device access remain UNCONFIRMED and require physical-device verification. The standalone device smoke test is stored in Tests/ManagedExportDeviceSmoke.swift outside the app target.

## Read-only native recovery after login loss

DeletionReceiptRecoveryFlow now reads the original persisted receipt through a read-only vault adapter and calls the receipt status GET without a bearer. Missing/foreign credentials, invalid or expired bindings, cancellation, account/revision changes and expiry while awaiting transport refuse the response. It never prepares a new credential, registers, renews a deadline, submits deletion, removes a receipt or erases local records. Each new attempt clears the prior displayed state; a complete status is not a local-erasure permit.

Validation: 40 native package tests passed in Debug and Release; unsigned simulator app builds passed in both configurations with the new vault adapter. The recovery flow also passed actual default URLSession over loopback TCP against the prepared receipt handler: dropped registration reply/exact retry, status without JWT, wrong token rejection and unconfirmed journal remaining unconfirmed. The HTTP authority and vault read-back in this integration are synthetic memory. It does not prove real Auth, database atomicity, Keychain restart under physical-device lock, production TLS or complete account deletion.

The shipping Settings screen, durable pending-receipt discovery and scoped server prepare/register/claim lifecycle are still disconnected. Those must be connected together with all existing account/family/coverage/custody/lease and retention guards before release; adding this flow enables no production route or deletion.

## Discovering existing receipts after restart

The vault now provides a read-only `references(userID:)` lookup in its exact dedicated Keychain service. It first queries attributes, then reads and validates each exact request item. Returned references contain request/account/inventory/expiry metadata and no token. It does not create, renew, revoke or remove credentials; expired references remain available for explicit lifecycle handling. A caller may filter to its verified account, and account/revision changes must still cancel or discard any in-flight UI recovery.

Discovery refuses malformed/duplicate entries, inaccessible Keychain state and more than 32 items rather than silently presenting a partial list. Individual known-request reads remain separate. This bound is a local defensive limit, not an adopted server quota or retention policy; explicit expiry/completion cleanup must be connected before rollout.

Actual isolated macOS Keychain verification passed: empty service, two accounts, account filtering, unchanged token after discovery, malformed record refusal, 33-item overflow refusal and exact cleanup. A fresh process then discovered the saved reference and read the unchanged credential without calling prepare; the marker contained only metadata/hash and was removed with the test item. This does not establish physical-device locked/background behavior or an operational shipping recovery screen. No owner Keychain items were queried.


## Fresh Auth and pinned registration integration preparation

The prepared server modules are `lib/deletion-receipt-auth.ts`, `lib/deletion-receipt-identity.ts`, `lib/deletion-receipt-transactions.mjs` and `lib/deletion-receipt-credential.mjs`. The credential/scope/transaction code is adopted from the versioned local cancellation candidate; its existing scoped credential hash domain is retained for compatibility. No client-generated inventory or boolean may authorize a live request. Scope must come from the trusted server journal, while prior custody confirmation and the existing all-project coverage/claim gates remain independent requirements.

A fresh exact-bearer Auth request is followed by a matching live `auth.sessions` row held FOR SHARE in the dedicated registration transaction. Liveness and signed-token expiry are checked again with a fresh database clock after acquiring the lock. Original credential/deadline retries do not silently rotate credentials or require a replacement login. A COMMIT acknowledgement lost after durable storage is ambiguous and must be reconciled using that original credential.

The new isolated integration test connects to the disposable GoTrue database, not PGlite. It prepares only synthetic journal/credential tables and uses GoTrue-generated identities/session records. It checks forged bearer refusal, credential hash/deadline persistence, exact retry and changed-deadline refusal, and concurrent session deletion waiting until the registration transaction ends. This integration passed in the isolated real Auth workflow on 24af8e6146f42500daf76529de1ecb48b568281a, including actual database row locking and original-credential retry. Local syntax/lint/type checks and boundary tests also pass. No actual owner identity, external SMTP, production data, live route or remote grants are used.

Production still needs a separately approved dedicated connection configuration, bounded acquisition/shutdown, restricted database permissions, trusted inventory producer, register/claim coupling, rate limits/redaction, all-project retirement coverage, retention adoption and device lifecycle validation. The development-only pinned `pg` dependency and loopback Docker port are for disposable tests. They do not configure a production database provider.


### HTTP composition and clock-precision correction

The first actual GoTrue DB integration on b4b0a5a1 failed during registration freshness checks; it is not recorded as passed. The numeric database timestamp can include submillisecond fractions while the pg timestamptz parser returns millisecond Date precision. The identity adapter now floors the verification clock to the same millisecond representation; all expiration/live-session checks remain in place. A precision regression boundary test passes. The corrected actual registration integration and all four workflows passed on 24af8e6146f42500daf76529de1ecb48b568281a; this confirms registration clock precision against the disposable real Auth database, not a production rollout.

The prepared HTTP handler and terminal reader now live in lib alongside the credential and transaction adapters. HTTP registration uses the original token/deadline, and GET explicitly requests READ ONLY. Noncanonical receipt headers are refused before transaction acquisition. The real Auth DB integration now exercises the handler, synthetic lost acknowledgement after COMMIT, retry without a bearer and bearer-free unconfirmed status after session removal. Its processing transition is a fixture, not an adopted worker claim or completion proof. No live Next route or shipping UI is enabled.


### Transaction shutdown failure handling

The dedicated transport adapter now attempts shutdown for an invalid acquired provider before issuing any SQL. Abort listeners do not throw outside the request rejection path. If abort itself throws, close begins immediately and is awaited once by final cleanup; this allows a provider that settles in-flight queries on close to release a pending query. Failed rollback shutdown does not become a successful request or repeat COMMIT. Six error-path tests plus the prior 17 receipt/Auth/HTTP boundary tests pass (23 total), and edited-file lint passes. These synthetic fault-injection tests do not certify a production connection provider. Acquisition, query interruption and close must still be independently bounded by that provider. Lost COMMIT acknowledgements remain ambiguous and require the original receipt retry.
