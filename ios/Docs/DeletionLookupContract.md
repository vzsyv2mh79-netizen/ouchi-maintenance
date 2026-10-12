# Explicit deletion lookup before submission

The prepared native current-progress lookup never treats HTTP 404, an empty body, a missing route, a timeout or a null store result as evidence that a new request may be submitted.

An authoritative current lookup may return HTTP 200 with exactly:

    {"state":"not_requested","userID":"verified account UUID","epochID":"current enrolled epoch UUID"}

The native caller must supply its expected account and epoch; both must match, and extra fields are refused for this absence response. A positive receipt remains pending/running/failed/complete and does not become completion from partial deletion flags. AccountDeletionFlow checks cancellation and binding generation before issuing a POST.

The prepared server handler permits this response only from its authenticated read adapter, validates ownership/epoch shape, and emits a fixed response. A null current query now returns 503; request-specific missing queries remain 404. The prepared deletionProgressReader now calls read_maintenance_session_deletion_lookup for current status and retains the scoped receipt RPC for a specific request. Missing RPCs and read failures stop submission; they do not fall back to inferred absence. Do not fabricate the response from client IDs or use enrollment-creating RPCs to determine absence.

Before live connection, the database adapter must atomically establish the current verified session, enabled app account/epoch, absence of a request for that same epoch and no conflicting retirement, without creating or refreshing an enrollment. The subsequent request now includes expectedEpochID from the confirmed native binding. The handler snapshots the verified identity before reauthentication and rejects a different epoch before reauthentication/enqueue. The existing request_maintenance_account_deletion RPC locks the principal and independently compares target_epoch with the live enrollment. A foreign-epoch acknowledgement is refused by the native parser. No legacy request without expectedEpochID is accepted. Existing family/coverage/custody/lease gates remain required. This change enables no route, erasure, production schema, sale or payment.

Validation: full native core tests cover empty/HTML 404, foreign account/epoch absence, unbound absence, cancellation and ordinary status recovery. The synthetic recovery smoke accepts a scoped not_requested response, loses the first POST reply and verifies only one POST occurred. Server boundary tests validate null refusal and scoped ownership. These do not prove real Auth or a live absence snapshot.

## Database lookup and verification

The prepared migration 20261012174446_ouchi_current_deletion_lookup.sql creates a stable SECURITY INVOKER lookup with an empty search path and service-only execution. In one statement snapshot it delegates positive receipts to the existing scoped reader; it declares absence only for an explicitly enrolled live session with enabled account/epoch and no same-epoch request or unresolved older request. Specific-request misses remain null. It never calls the legacy enrollment initializer.

Actual isolated PostgreSQL verification passed: no lazy enrollment, exact account/epoch absence, foreign/missing/expired session refusal, disabled account refusal, unresolved older request refusal, current pending request recovery and anon/authenticated execution denial. Registered absence also passed in a READ ONLY transaction through the prepared HTTP handler and store adapter. Auth was synthetic; the adapter's RPC bridge executed actual PostgreSQL queries. Synthetic fixtures and the test function were removed afterward. The dedicated database was stopped.

Committed tests exercise the actual migration chain with PGlite, registered absence and pending status in READ ONLY transactions, scope refusals, role denial, exact adapter RPC selection and missing-RPC failure. This verifies local behavior, not real Auth, PostgREST deployment or production TLS.

The migration is prepared but not applied to remote Supabase. Real Auth, authoritative all-project retirement/coverage checks and live UI connection remain pending. Native enrollment flags alone do not establish shared-project retirement safety. Existing family, coverage, custody and lease gates remain mandatory. No route, erasure worker, sale or payment was activated.
