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
