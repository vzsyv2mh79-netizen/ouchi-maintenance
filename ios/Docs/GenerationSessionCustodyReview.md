# Generation-specific fourth session checkpoint — review candidate

This adds only `verify-sessions-before` after the existing exact three normal
journal stages. No hosted schema/role/grant, current production route, user-data
removal, actual logout dispatch, charge, App Review submission or release.

## ZERO native delta

The fourth stage appends its own immutable `generation_session_custody` witness
and the root's exact fourth receipt in one owning checked transaction. It does
**not** insert `deletion_receipt_sessions`, set `receipt_sessions_captured`, change
records/identity flags or rewrite preparation/handoff/retention originals. The
existing post-handoff/retention child-empty guards therefore stay unchanged.
This deliberately chooses the separate-custody option in
`GenerationSessionCustodyBoundaries.md`; no early canonical success is fabricated.
The canonical public capture still refuses before `records_erased`.

Later after-erasure materialization of the recorded app-session subset into native
receipt rows, native capture validation, exact per-stage erasure deltas, real
logout dispatch/ack and historical before-native authority remain separate work.
The current fourth-stage fact alone grants none of those capabilities. It also
cannot authorize a photo-bearing canonical generation or release family writes.

## Interface and independent complete coverage

`createGenerationSessionCustody` exports only the fourth handler and a historical
fact reader. Fixed options bind full normalized scope, generation ID, native
lease and complete sorted home/successor targets, with a copied server HMAC key.
Existing actual current-original, retention and lawful-handoff ports are required;
`familyStages.readHistorical` independently checks the SAME family original HMAC
domain, original signatures, original expiry, session/roster binding and count.
Old owner-zero originals, custody and `familyCoverageDigest` are never reused.

The mandatory independent SERVER callback is:

```
verifySessionCoverage(scope, generationID, nativeLease, tx, signal)
```

It returns exactly:

```
{
 domain: 'SharedAccount/generation-session-coverage/v1',
 scopeDigest, generationID, nativeLease, authSessionsDigest,
 apps: [{app, requestID, scopeID, sessionDigest, originalsDigest,
         writerCoverageDigest}]
}
```

`apps` is the ordered COMPLETE root app list. `authSessionsDigest` is SHA256 of
the compact JSON array of ALL sorted current owner Auth session UUIDs. App session
digests use the same encoding for each actual app subset. The independent root
provider must check its preserved complete baseline, the exact union of app
subsets, current owner/successor originals, every writer path, current lease and
contact/key admission, on this physical transaction. No client receipt, app-only
subset or default policy is accepted as global coverage. Current provider results
must be identical across repeated reads and at the owning COMMIT.

Ouchi separately checks the actual complete owner Auth session set against its
unchanged generation preimage, actual Ouchi mappings against original mappings,
all mappings' current epoch/live session, and its subset digest against the
provider. A previously captured other-app-only session is possible in the whole
Auth set, but it needs explicit coverage from the independent root provider.
New/unmapped/foreign-epoch sessions refuse; the app cannot silently inherit them.
No raw session IDs or tokens leave the wrapper's boolean/digest-only public result.
Private evidence stores UUIDs/mappings only, no JWT or refresh-token secret.

## Transaction and immutable proof

The unchanged strict post-handoff frame acquires the root FIRST and all existing
participant/native/stop locks. Additional actual Auth-user and app-parent locks,
with validated immediate FKs, prevent insertion races while current session and
mapping rows are checked. Exact scope/native/lease, retained finite evidence,
original freshness and unknown-child/no-file checks remain in force.

A new HMAC domain `OuchiMaintenance/generation-session-custody/v1` signs exact
private scope/generation/native/epoch/targets, preparation, family-custody/handoff,
ALL original owner session IDs, actual app subset mappings and coverage evidence.
The immutable row records producing PID/XID. The old three-prefix function body
is pinned and retained verbatim under a private fallback. The new prefix branch
accepts precisely fourth-with-witness after all three exact prior checkpoints;
missing/hole/extra/future receipts continue refusing. No old five-second guard,
original expiry, canonical function body or legacy plan key is changed.

Raw app-only witness without root fourth receipt cannot COMMIT; a bare fourth
receipt without a witness is rejected by the prior root guard. Producing deferred
checks and server before-COMMIT checks re-read actual scope/session/native and
independent current proof. Late policy/contact/HMAC/physical-connection failure
rolls back witness AND fourth receipt together, preserving prior three stages.
Duplicate handler use poisons its first check rather than replacing admission.

A lost real COMMIT acknowledgement can read the same signed private historical
fact. Retry preserves signature/producer identity and does not renew the original
TOTP deadline. Historical read calls no current provider/Auth session gate; SAME
family-original HMAC/expiry and exact immutable generation prefix are still
required. After real logout the current original reader must refuse, while this
fact can remain readable. That fact proves neither logout/absence, future worker
identity, after-Auth permission, native erasure nor COMPLETE.

## Validation scope

The isolated fourth-stage native profile uses the full canonical 135-source
schema, actual PostgreSQL17.6 and official GoTrue2.197 with real owner/successor
TOTP originals. The independent ALL-app/writer provider remains synthetic. This
is one-app native composition, not independent paired public-intake or hosted
permission approval. The root's separate actual GoTrue/full-session provider
report is external evidence until combined and reexecuted.

The all-owner suite's first attempt stopped BEFORE this new stage at the existing
generation-family-handoff late-refusal test: its unchanged ten-second owning
transaction elapsed. That attempt is NOT a pass for the new profile or whole
regression. A dedicated profile retains the same 4500ms statement and 10000ms
transaction limits, loads the same old actual definitions and uses actual unchanged first-three checkpoint/handoff RPCs as prerequisites,
with current originals and retention checked at entry and owning COMMIT, then
runs the fourth-stage additions. This fixture prerequisite adapter avoids
repeated high-cost JS readbacks; it does not establish a green result for the
separate unchanged first-three JS fault suite. No old case
is removed from its original suite, no deadline is extended and no guard is cached.

Still pending: paired public fourth-stage integration/current real writer and
original coverage; actual logout reservation/unknown outcome/ack; generation-
specific historical before-native capability and after-erasure native session
materialization; later erasure/Auth-after/COMPLETE/family release; full photo
inventory/both-actor proofs/activation/physical cleanup; hosted owners/ACL/ALL
writers and adopted retention/operator policy. No production completion claim.
