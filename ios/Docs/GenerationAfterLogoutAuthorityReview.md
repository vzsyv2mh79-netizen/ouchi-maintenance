# Generation after-global-logout / before-native boundary — local candidate

This is a separate transaction-bound read gate after the fourth private session
checkpoint. It has NO logout HTTP, native erasure, Auth DELETE, JWT creation,
credential persistence, receipt renewal, COMPLETE or family-write release port.
No production function/role/grant, user data, billing or release is changed.

## Do not turn a test JWT into a durable operating mechanism

GoTrue2.197 global logout uses a current owner's JWT at `POST /logout`; an Admin
user-ID-only logout route is not available in this pinned runtime. A fixture's
in-memory owner token is not evidence that a worker can restart after seven days
and log out that account. Missing/expired JWT means HOLD BEFORE dispatch, not
service-role impersonation, JWT minting, raw session SQL deletion or early Auth
account deletion. The root controller owns transient fresh-JWT delivery, actual
current session validation, dispatch reservation and restart recovery.

The JWT must be for the SAME original owner session saved by this generation.
Refresh of a current session does not renew the original family TOTP deadline.
Expired/revoked originals need a separately authorized new generation/approval;
the old rows and signatures must never be re-signed or retrofitted.

Once a real request was issued, lost delivery/ACK remains unknown. This app never
re-sends HTTP or infers dispatch from absence. The independent root can publish
an explicit factual `reconciled-absent` outcome for that SAME recorded dispatch
following its actual scoped absence observation. That outcome and a known ACK
are both checked against real current SQL absence here. A no-dispatch/issued/
unknown/failed receipt is never authority even when sessions happen to be absent.
After successful dispatch/reconciliation, reading an already valid fact does
not require retaining or re-presenting a JWT. It does require unchanged finite
original custody, scope and all current operating gates.

## Fixed private SQL

The new frame acquires the exact root FIRST and sorted participant advisory
locks, then locks all existing owner/successor Auth parents in UUID order and their
existing factor rows in stable user/UUID order. It
requires validated immediate session/factor→user FKs and actual absence of ALL
owner Auth sessions. The actual Auth owner and all saved participants must still
exist, with no deleted_at. Auth parent locks and FK checks span the owning COMMIT
and prevent actual session/factor recreation. Existing factor UPDATE/DELETE
is also held, closing the gap between the final digest check and actual COMMIT. No external Auth API is called
while those parent locks are held. Privileged DDL/all-writer operating coverage
remains an independent mandatory root responsibility.

A body-pinned COPY of the prior strict post-handoff frame admits only the exact
owner `sessions: []` disappearance in its observation comparisons. Native row,
app epoch mappings, route/stop, family roster/home snapshots/incarnations,
all originals, original before/after provenance, exact four-receipt prefix,
retention certificate/children, no-file scope and native/root leases remain
unchanged. The ORIGINAL frame/canonical producers are not broadened or replaced.
No native flag or session child row is populated. Unknown metadata/extra/future
receipts and any other changed preimage refuse.

The independent signed fourth-custody wrapper still verifies SAME original
family HMACs/expiry and the new session-custody HMAC. Historical signed metadata
by itself remains a fact; this new gate additionally requires actual absence,
strict current native/root state and the root's verified actual dispatch.
Old owner-zero proof tables/tokens/domains are never accepted as this generation.

The private SQL returns only the retained custody, PID/XID and a nonreversible
SHA256 Auth-core digest (the actual owner Auth user plus complete factor rows,
excluding disappearing session state). It never returns password/hash/MFA-secret
fields. The ROOT must independently match that digest to its immutable SAME-
generation prelogout Auth-core origin. A freshly computed after-state is not an
origin. Missing prelogout origin means HOLD; do not retrofit an old generation.
Changes to Auth credentials/profile/MFA after that origin revoke admission here.
The local native fixture snapshots this origin before real logout; it is not
an implementation/adoption of the root's durable evidence store or retention.

## Server interface and same-transaction lifetime

`createGenerationAfterLogoutAuthority` requires fixed scope/generation/native
lease/home targets, `sessionCustody.readHistorical`, `retention.verifyCurrent`
and the independent SERVER callback:

```
readLogoutAdmission(scope, generationID, nativeLease, tx, signal)
```

It returns exactly:

```
{
 domain: 'SharedAccount/generation-after-logout-admission/v1',
 scopeDigest, generationID, nativeLease, sessionCustodyDigest,
 dispatchID, ownerSessionDigest, presentedSessionID,
 credentialValidatedAt, credentialExpiresAt, dispatchedAt,
 outcome, outcomeDigest, writerCoverageDigest, authIntegrityDigest,
 apps: [{app, requestID, scopeID, proofDigest}]
}
```

`apps` must equal the ordered COMPLETE root list. All digests are fixed SHA256
hex. `sessionCustodyDigest` and owner-session digest bind the actual full fourth
proof and compact sorted original owner UUID array. `presentedSessionID` must be
one of its original owner sessions, not a new session or another account. Root
must validate the actual transient JWT signature/claims/current session before
reserving dispatch. Integer-ms credential validation and dispatch times must be
ordered, dispatch must precede actual JWT expiry and every original family-proof
expiry, and no timestamp may fabricate a future dispatch. An ACK can be read
after JWT expiry, provided its actual earlier dispatch was valid and current
original/retention/lease evidence has not expired or changed.

`authIntegrityDigest` must match the private current Auth-core digest AND the
root's independently retained prelogout origin. `outcomeDigest` must bind the
root's durable actual dispatch/ack or explicit factual reconciliation record,
not a caller-provided status. Whole-app/writer/session/participant/native/contact/
result-key/retention and operating policy gates must be independently checked by
that provider on this SAME transaction. A client flag or constant provider is
not a production implementation. No bearer/token field is accepted in the shape.

`read(scope,tx)` registers the final check before any usable result is returned.
`verify(scope,tx)` works only with the exact same factory/scope/physical checked
transaction. Repeated current frame, signed custody, retained evidence and root
admission must remain byte-identical across PID/XID pins and actual COMMIT. Late
loss or duplicate read poisons the owning callback. Public output is only typed
scope/generation/native/custody/outcome digests, with no session IDs or secret.
A cap from another transaction is unusable; it is not a durable result credential.

## Evidence and remaining boundary

The additive native profile uses actual GoTrue2.197/PostgreSQL17.6, real TOTP
originals, normal first-fourth checkpoint producers and real global logout.
Dispatch/outcome storage, complete writer and prelogout Auth-origin admission
are explicitly synthetic server ports in this one-app fixture. Root's separate
logout-controller/provider/paired native reports are external until reexecuted
with these exact sources and its durable actual dispatch implementation.

No account record is erased by this gate. Actual generation-specific erasure
must still append an exact allowed-delta producer/witness and historical readback;
this before-native frame intentionally refuses changed native/record states.
After-erasure native session materialization/canonical validation, actual shared
Auth removal/exclusion, Auth-after/COMPLETE/family release, file-capable generation,
full photo inventory/both actors/activation/source cleanup, hosted restricted
owner/ACL/ALL-writer profile and formal retention/operator adoption remain open.
