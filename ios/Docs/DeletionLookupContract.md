# Explicit deletion lookup before submission

The prepared native current-progress lookup never treats HTTP 404, an empty body, a missing route, a timeout or a null store result as evidence that a new request may be submitted.

An authoritative current lookup may return HTTP 200 with exactly:

    {"state":"not_requested","userID":"verified account UUID","epochID":"current enrolled epoch UUID"}

The native caller must supply its expected account and epoch; both must match, and extra fields are refused for this absence response. A positive receipt remains pending/running/failed/complete and does not become completion from partial deletion flags. AccountDeletionFlow checks cancellation and binding generation before issuing a POST.

The prepared server handler permits this response only from its authenticated read adapter, validates ownership/epoch shape, and emits a fixed response. A null current query now returns 503; request-specific missing queries remain 404. Existing deletionProgressReader only supplies the older RPC result and does NOT yet prove scoped absence. Thus new requests remain stopped on an absent result until an authoritative read-only database snapshot adapter is implemented. Do not fabricate the response from client IDs or use enrollment-creating RPCs to determine absence.

Before live connection, the database adapter must atomically establish the current verified session, enabled app account/epoch, absence of a request for that same epoch and no conflicting retirement, without creating or refreshing an enrollment. The subsequent request now includes expectedEpochID from the confirmed native binding. The handler snapshots the verified identity before reauthentication and rejects a different epoch before reauthentication/enqueue. The existing request_maintenance_account_deletion RPC locks the principal and independently compares target_epoch with the live enrollment. A foreign-epoch acknowledgement is refused by the native parser. No legacy request without expectedEpochID is accepted. Existing family/coverage/custody/lease gates remain required. This change enables no route, erasure, production schema, sale or payment.

Validation: full native core tests cover empty/HTML 404, foreign account/epoch absence, unbound absence, cancellation and ordinary status recovery. The synthetic recovery smoke accepts a scoped not_requested response, loses the first POST reply and verifies only one POST occurred. Server boundary tests validate null refusal and scoped ownership. These do not prove real Auth or a live absence snapshot.

## Local database candidate verification

`tests/fixtures/deletion-current-lookup.sql` prepares a stable SECURITY INVOKER lookup with an empty search path and service-only execution. In one statement snapshot it delegates positive receipts to the existing scoped reader; it declares absence only for an explicitly enrolled live session with enabled account/epoch and no same-epoch request or unresolved older request. Specific-request misses remain null. It never calls the legacy enrollment initializer.

Actual isolated PostgreSQL verification passed: no lazy enrollment, exact account/epoch absence, foreign/missing/expired session refusal, disabled account refusal, unresolved older request refusal, current pending request recovery and anon/authenticated execution denial. A READ ONLY transaction successfully exercised missing-enrollment lookup; enrolled-absence cases were exercised in a rolled-back writable fixture transaction, so this is not yet proof of the complete live read-only adapter. Synthetic rows were rolled back and the candidate function removed afterward.

This SQL is a test fixture, not an adopted migration. The existing prepared adapter still calls the older RPC. Real Auth, authoritative all-project retirement/coverage checks, production migration and live UI connection remain pending. Native enrollment flags alone do not establish shared-project retirement safety. No claim of production readiness follows from these local results.
