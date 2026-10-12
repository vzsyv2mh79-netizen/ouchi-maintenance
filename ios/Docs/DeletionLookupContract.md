# Explicit deletion lookup before submission

The prepared native current-progress lookup never treats HTTP 404, an empty body, a missing route, a timeout or a null store result as evidence that a new request may be submitted.

An authoritative current lookup may return HTTP 200 with exactly:

    {"state":"not_requested","userID":"verified account UUID","epochID":"current enrolled epoch UUID"}

The native caller must supply its expected account and epoch; both must match, and extra fields are refused for this absence response. A positive receipt remains pending/running/failed/complete and does not become completion from partial deletion flags. AccountDeletionFlow checks cancellation and binding generation before issuing a POST.

The prepared server handler permits this response only from its authenticated read adapter, validates ownership/epoch shape, and emits a fixed response. A null current query now returns 503; request-specific missing queries remain 404. Existing deletionProgressReader only supplies the older RPC result and does NOT yet prove scoped absence. Thus new requests remain stopped on an absent result until an authoritative read-only database snapshot adapter is implemented. Do not fabricate the response from client IDs or use enrollment-creating RPCs to determine absence.

Before live connection, the database adapter must atomically establish the current verified session, enabled app account/epoch, absence of a request for that same epoch and no conflicting retirement, without creating or refreshing an enrollment. The subsequent request must bind the user's confirmed epoch and independently recheck it on enqueue; that explicit epoch binding in the POST contract is still pending. Existing family/coverage/custody/lease gates remain required. This change enables no route, erasure, production schema, sale or payment.

Validation: full native core tests cover empty/HTML 404, foreign account/epoch absence, unbound absence, cancellation and ordinary status recovery. The synthetic recovery smoke accepts a scoped not_requested response, loses the first POST reply and verifies only one POST occurred. Server boundary tests validate null refusal and scoped ownership. These do not prove real Auth or a live absence snapshot.
