# Generation retention admission — local review candidate

This candidate adds a formal native `deletion_retention_checks` row to a NEW
family preparation generation. It does not adopt a production retention policy,
provision a hosted checker, enable deletion, or implement global stage receipts.
All test identities, keys, policy versions and durations are synthetic.

## Independent authority and immutable originals

`createGenerationRetentionAdmission` requires a copied server key, an independent
`readApprovedPolicy` provider and an independent `verifyOtherEvidence` provider.
There is no default policy, TTL, or client approval flag. The finite policy is
bound to the reserved scope, generation, native request, immutable preimage,
roster, targets and reviewed catalog digest. It records the domain
`OuchiMaintenance/generation-retention-check/v1`, exact policy/evidence digest,
DB inspection time, confirmation deadline and receipt lifetime. A physical
PID/XID pin and fresh policy/certificate checks protect issuance and COMMIT.

Only the isolated dedicated checker LOGIN can record or revoke a certificate
through fixed RPCs. Runtime cannot mint it. Raw private tables/helpers have no
PUBLIC/anon/authenticated/service/runtime access. Dedicated checker roles and
SECURITY DEFINER owners here are LOCAL TEST prerequisites, not approved hosted
roles or least-privilege deployment. SQL does not possess the HMAC secret; the
server verifies the exact signature independently before acting. A compromised
checker or owner is outside this local proof and requires deployment review.

## Scoped formal native check

Reserve first, issue on the checker connection, then prepare on the owning
runtime transaction. The existing native preparation freezes real family writes
and enrollment while keeping canonical `inventory_captured=false`. The added
admission records that exact immutable native original and the exact formal
retention row. Only a PID/XID-local context permits that one row's insertion.
Late evidence/policy failure rolls the native preparation and admission back
as one transaction. The original `family_native_preparations.after_state` is
never rewritten to retrofit the new child row.

The old `requested_native_children_are_empty` helper remains byte-identical and
continues rejecting nonempty retention. Only the reviewed family-generation
frames use a separate exact-owned-row matcher. Every other native child must
remain empty, and unknown child storage still refuses. Canonical capture and
legacy owner-zero gates are unchanged. Actual all-successor TOTP originals,
claim, lawful two-home handoff and then canonical capture are exercised with
this admitted retention row; no receipt phase is skipped or reinterpreted.

## Cancellation and replay

An unused prepared generation can be cancelled with its original scope and
native lease even after checker revocation: this is reversal of preparation,
not new deletion authority. Only the exact admitted native check is removed in
a narrow cancellation context, before delegating the preserved previous native
cancellation function. Native/flags/fence/binding restoration remains subject to
all previous drift/no-dispatch checks. Certificate, admission and explicit
removed-row cancellation audit remain immutable. Journal's already-cancelled
response remains false; the exact native cancellation reader is idempotent.
Same-home reapplication uses a new generation and a new certificate; originals
and their authentication freshness are never renewed by retention handling.

## Remaining boundaries

This is NOT a complete retirement path. Formal global `prepare → handoff-family
→ verify-family-before` prefixes still need stage-specific inventory/proof
anchors and current→historical custody. Files, whole-app erasure, post-Auth
verification, COMPLETE and release of ordinary family writes remain separate.
The fixture's temporary retention durations are not approved service policy.
No hosted permission/owner/writer adoption, real user deletion, new charge,
production activation, App Store submission or release occurs.
