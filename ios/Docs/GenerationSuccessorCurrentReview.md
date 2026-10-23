# Current successor originals after owner logout — local review candidate

A historical owner proof cannot stand in for CURRENT family consent. After actual
owner logout, the old whole-owner processing reader must remain false. This
candidate supplies a separate successor-only current check scoped to the SAME
new generation, fourth private session custody and after-logout/before-native
frame. It issues/renews nothing and has no logout, erase, enable, COMPLETE or
family-write release method. No hosted migration/role/grant or production changes.

## Strict core, new frame, exact originals

The existing `generation_family_auth` body is SHA256-pinned, copied under a new
private name and changed ONLY at its fixed generation-frame call. A separate
wrapper permits only the immutable selected home's actual successor; owner and
raw clone EXECUTE calls are denied to the runtime. The original Auth function,
old processing frame, original records/HMAC domains/expiry, canonical capture,
root receipt prefixes and prior before/after snapshots are unchanged.

The new frame is the already reviewed generation after-logout frame: root first,
exact whole scope/generation/native lease/targets, actual complete owner session
absence with Auth-parent/factor locks, existing Auth users, unchanged native and
family state, exact fourth custody, retention/unknown-child/no-file guards and
current root/native deadlines. It cannot be reached by a legacy owner-zero token.

The strict successor core preserves current nonanonymous/nondeleted/nonbanned
user, actual same session, AAL2, verified TOTP factor and matching actual AMR time,
ten-minute original freshness, live session/timebox/inactivity bounds, validated
immediate FKs, same enrolled app epoch and original Auth-state digest. It holds
actual successor session/factor/AMR rows through COMMIT, with Auth parents already
held. Existing session/AMR changes cannot race a final check. No JWT, session or
MFA state is fabricated or renewed. The wrapper additionally requires current
enabled account access/app epoch and an open successor (no stop binding or stopped
principal fence), under row locks. Saved timebox/inactivity parameters must match
the original, so changing policy does not silently relax a prior issuance.

The server independently verifies the SAME twelve-field
`OuchiMaintenance/family-generation-original/v1` HMAC, exact root/generation/home/
actor/epoch/session, proof domain and original `authenticatedAt + 600000` expiry.
It also matches that exact payload/signature to the original frozen in fourth
custody, not just to a newly valid signature. Every selected home must supply its
own successor original; duplicates/missing homes are refused. Even if the same
person succeeds multiple homes, each distinct home-bound original is checked.

## Hook-free current verifier, not a standalone lifecycle capability

```
createGenerationSuccessorCurrent({
 scope, generationID, nativeLease, homes, key, projectID,
 policyReader, sessionCustody
})
```

`policyReader(signal)` must implement `isCurrent(policy)` and provide the same
strict pinned GoTrue2.197/highest-current-AAL/TOTP/single-session=false policy
contract as original issuance. There is no default/cached policy approval.
`sessionCustody.readHistorical` must independently validate the actual signed
fourth proof and ALL owner/successor original HMACs and unchanged expiry. Owner
consent here is historical only; owner is never sent through successor SQL.

`readCurrent(scope,tx)` returns null or a digest-only fact:

```
{
 kind: 'current-generation-successor-originals', generationID, nativeLease,
 sessionCustodyDigest, originalsDigest, originalCount, successorCount
}
```

`verifyCurrent(scope,tx)` returns a boolean. Both require the owning checked
physical transaction, compare PID/XID and current policy around reads, and emit
no original payload, signature, Auth session ID or bearer. They register NO
automatic hooks: the caller MUST invoke this check again in its real owning
COMMIT path. A successful earlier fact cannot be reused as an erasure capability.

In particular, the root's `readLogoutAdmission` must combine historical OWNER
HMAC/session custody with CURRENT successors from this port, actual own-app
native/family/retention state, and Kakei's equivalent current successor checks.
It must also verify immutable prelogout owner Auth-core origin, durable actual
logout dispatch/ACK or explicit reconciliation, full all-app writer/contact/key
and operating policy evidence. `createGenerationAfterLogoutAuthority` repeatedly
invokes that independent provider at its own final COMMIT. Never call the old
whole-owner current reader and turn false into historical approval.

## Validation and limits

New unit tests cover all-home completeness, same signatures versus frozen fourth
custody, wrong key/domain/actor/session/epoch, original expiry, current policy
loss/change and saved duration mismatch, physical-transaction drift and foreign
scope. No automatic callback/mutation port is added.

The additive native profile uses actual PostgreSQL17.6/GoTrue2.197/TOTP and real
first-fourth generation producers followed by actual owner global logout. It
checks current successor success while old owner-current consent stays false;
actual successor AAL downgrade and disabled access/enrollment refuse; raw owner/
clone calls, wrong HMAC and changed saved policy refuse. Concurrent actual session
and AMR UPDATE block through COMMIT. Actual successor global logout refuses root
admission while original historical HMAC custody and all original rows stay
unchanged. In that one-app fixture, root dispatch/origin/ALL-writer evidence is
still synthetic, but its apps admission genuinely invokes this current port.

The same fixture retains the unchanged ten-second test transaction, 4.5-second
statement, finite native lease and original expiry. It is not a green claim for
the earlier whole-owner JS regression that timed out before the fourth stage.
The root's paired controller/current-successor integration must be independently
reexecuted against this fixed source. Hosted owners/ACL/all writers and formal
retention remain unadopted. Later native erasure/delta witnesses/session material-
ization/Auth-after/COMPLETE/family release and file-capable generation remain
separate. No real user records/Auth account, billing or release is activated.
