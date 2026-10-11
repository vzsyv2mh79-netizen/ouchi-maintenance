# Purchase retention and account deletion proposal

Status: reviewable proposal, not enabled. No production deletion, ownership transfer or Apple API mutation is authorized by this document.

## Proposed data boundary

On completed Ouchi account deletion, erase household records, files, memberships, invitations, device registrations, reminder preferences, recovery jobs, app sessions and enrollment identifiers. Erase the Ouchi user/epoch association in purchase ownership, transaction and renewal rows rather than retaining the old UUID indefinitely. A hash of an identifier is still linkable information and does not count as anonymous deletion.

Before implementing this proposal, inventory every foreign key, inbox, audit record, log and backup that can preserve that association. A migration must establish a single locking protocol for deletion, enrollment, purchase processing and recovery. A worker may report completion only after each required category has a durable acknowledgement. Failed or unconfirmed erasure stays pending and must not grant access to a new enrollment.

Developer payout/accounting records are a separate category. Do not automatically retain customer identifiers under a bookkeeping rationale. The operator must identify required fields, legal basis, duration and access controls before any exception is implemented or described in the privacy policy. Backup expiry and actual completion times also remain to be established.

Shared Supabase login is not deleted globally: other apps may rely on it. The release must explicitly define what constitutes the Ouchi account and prove that all associated Ouchi personal data is erased. Disabling enrollment alone is insufficient.

## Restoring after deletion

An explicit Restore action must authenticate the new Ouchi enrollment and obtain current StoreKit information. Pairing Apple's verified AppTransaction and purchase transaction by bundle, environment and appTransactionId establishes consistency, not authorization to transfer ownership. The new helper performs only that pairing and preserves the original account token.

Before a transfer route exists, implement and validate a fresh, server-bound device/user authorization protocol, single-use challenges, expiration, atomic consumption, concurrency control, and a policy for conflicting active ownership. A replayed pair of valid JWS strings must never transfer rights. Client-supplied device identifiers or a locally computed device hash alone do not authenticate the sender to the server. Missing appTransactionId, failed verification or conflicting ownership must leave rights unchanged and provide a recoverable user-facing result.

Apple supports resetting appAccountToken with the Set App Account Token endpoint. Do not call it until authorization and transfer policy are implemented. After an authorized update, fetch and verify fresh Apple data and confirm the new token before recording a new association. Failure between update and readback requires idempotent reconciliation; it cannot be treated as a successful purchase. Handle expiry, refunds and revocation from current verified status, not from the age or presence of a signed pair.

Late notifications for erased/unmapped enrollments must not recreate the old identity or automatically assign a new one. The handler must bound and verify inputs, avoid logging personal payloads, and use the documented unassociated-event policy. That policy and replay/deduplication lifecycle remain release gates.

## Required proof before enabling

- Isolated database migration: all identifier-bearing categories erased, another user's data preserved, old workers and old sessions cannot recreate enrollment.
- Authorized restoration: replay, two competing enrollments, duplicate requests, token update timeout, readback mismatch, expiry, refund, revocation and missing fields leave correct ownership.
- Actual Apple Sandbox: signed AppTransaction, transaction, token update/readback and restore across Web/native accounts.
- Native deletion UI: export, reauthentication, immediate deletion option, subscription management link, truthful pending/completed status and restart-safe local cleanup.
- Final operator policy: retained fields if any, legal basis, finite duration, backup handling, support and shared-account boundary.

## Official references checked 2026-10-11

- [Apple account deletion requirements](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion): deleting an app account does not cancel Apple subscriptions; an immediate deletion option must remain available.
- [Set App Account Token](https://developer.apple.com/documentation/appstoreserverapi/set-app-account-token): set/reset the token for the original transaction.
- [App transaction identifier](https://developer.apple.com/documentation/appstoreserverapi/apptransactionid): identifier used to associate App Store app/purchase information.

These sources describe Apple behavior. They do not authorize our app's ownership transfer or establish an operator-specific retention period.


## Restore assertion client data (prepared, no authorization route)

The billing-restore-client-data helper creates a cryptographically random32-byte server nonce with a bounded five-minute validity window and produces deterministic UTF-8 clientData bytes. It binds the live user, Auth session, enrollment epoch, request, server-associated attested key identifier, App ID, App Attest environment, purchase environment and a domain-separated digest of the exact signed AppTransaction/purchase pair. The verified pairing helper now returns that digest while preserving the original transaction account token. App Attest environment and purchase environment remain separate; one does not imply the other.

This helper validates structure, canonical encodings and time only. A client-supplied key identifier is NOT proof of a verified device. Generating a nonce is NOT single-use consumption. There is no challenge store, attestation registration/verifier, assertion endpoint, counter update, ownership transfer, Apple mutation or rights grant in this change. Before returning a challenge, a future route must verify live Auth/current enrollment, both Apple signatures/pairing, and the server-stored key association, then persist the exact challenge. At validation, reconstruct exact clientData from that stored scope, verify Apple's App Attest assertion and atomically consume nonce/counter. No client JSON fields alone can approve a transfer.

Local tests cover random nonce generation, deterministic ordering, binding changes to every identity/environment/pair field, malformed encodings, expiry extension and bounded proof bytes. They do not prove Apple attestation or authorize transfer. The actual device/server protocol, replay/concurrency store, approved conflict policy, verified Set App Account Token/readback reconciliation and signed Apple Sandbox remain required.

Official Apple DeviceCheck validation documentation was fetched on2026-10-11. It requires randomized one-time challenges, verified certificate/key association, assertion signature verification and increasing counters. Current documentation also requires checking validation category and bundle version in authenticator extensions. Do not silently omit these or trust client-supplied values in a future verifier. The Set App Account Token documentation confirms that updates apply to the current/subsequent renewal transactions rather than past renewals; verified fresh readback is mandatory before granting new enrollment rights.

References: [App Attest server validation](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server), [Attestation validation guide](https://developer.apple.com/documentation/devicecheck/attestation-object-validation-guide), [Set App Account Token](https://developer.apple.com/documentation/appstoreserverapi/set-app-account-token).
