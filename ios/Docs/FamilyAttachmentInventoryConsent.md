# Signed complete-inventory consent — disabled backend candidate

The new provider binds a separate signature domain to the original controller
and native request/lease, recipient epoch, normalized source/destination plan and
the complete immutable member/product/file/settled-write inventory. This does not
reinterpret the existing family-snapshot consent as file or capacity consent.
Signatures and signing keys stay server-side; issuer responses contain only a
status and the original expiry. Caller-supplied token arrays are not accepted.

The trusted target/store must lock/read exact original data on the same pinned
transaction. It must supply current private revocation records; the review store
has RLS and no public/anon/authenticated/service-role grant. Proof identity and
token cannot change; revocation is one-way. No record delete/expiry cleanup is
enabled, so finite retention still requires an explicit lifecycle design.

Issuance requires exact user/session/epoch/AAL and both a recent authentication
time and a current verification time. A fresh getUser timestamp alone cannot
substitute for recent authentication/MFA. Mandatory verifyActor/currentAuthority
providers must pin and recheck signed sessions/factors/current policy, formal
native/controller lease, recipient enrollment and retained freeze. This module
does not supply those production providers or their credentials.

Consent uses the database clock, is limited to fifteen minutes from original
acceptance, and does not silently renew on replay. Expired/revoked proofs cannot
authorize. Both people must sign the same exact binding. Metadata changes,
receiver epoch changes, foreign destinations, missing/extra records, forged
signatures and wrong keys refuse. Record/revocation and expiry are re-read after
the final authority callback, and post-write authority loss/cancellation rolls
issuer writes back through its pinned transaction.

Ten full-schema PGlite cases cover signed reserve/readback, one-person refusal,
changed plan/epoch/metadata, forged/wrong-key records, original expiry/revocation,
stale authentication, lost current session, late revocation, post-write rollback,
cancellation and private-role denial. Auth/session tables are synthetic and MFA,
scope authority and clock-advance policy are injected. The positive cases connect
signed authorization to journal reserve/status and measured atomic activation.
The review extension requires a separate private approval stamped by the
signature provider on the SAME backend/transaction. A boolean callback or an
approval left by an earlier transaction cannot create an activation context.
The context captures the exact approval, original signed records, scope and
plan/inventory digests. Its deadline is capped by original signature expiry and
five seconds of database time; replay never extends that deadline. A deferred
COMMIT trigger re-reads exact immutable approval and private revocation rows.
Revocation after the final application callback rolls home/file/write custody,
quota and both receipts back, including member-only transfers without quota.
The approval table has RLS, no exposed grants, and immutable rows. Synthetic
Auth/policy and byte fixtures remain explicit limits of these cases.

## Release gates still open

- Real signed issuer HTTP/native consent presentation and explicit user approval
  of the complete photo list/receiver; key provisioning and least-privilege store.
- Current Auth/MFA policy acquisition, recent-authentication evidence, session and
  factor pinning, plus worker current-authority providers and formal lease reclaims.
- Install and validate the complete signed-inventory review extension with
  actual PostgreSQL/Auth/Storage and trusted provider composition before creating
  a production migration. Existing legacy activation tests without that extension
  still use injected inventory authorization and do not prove this boundary.
- Actual PostgreSQL/Auth/Storage composition using this provider, cancellation,
  uncertain replies, durable source cleanup/completion and finite proof retention.

No production schema migration, exposed role/grant, endpoint, real payment,
paid infrastructure, existing-user deletion or App Store publication is enabled.


## Prepared recent-authentication issuer identity adapter

`createHomeHandoffInventoryIdentityVerifier` adds a backend-only issuer identity
adapter on top of exact-bearer verification and the existing current-policy
reader. It requires validated immediate single-column Auth foreign keys from
sessions/factors to `auth.users.id`, locks the user, live session, all existing
factor rows and exact enabled enrollment/account rows in the same transaction,
and reverifies the original bearer/current policy after those locks. Unsupported
Auth schema capability or changed session/enrollment refuses.

Authentication time comes only from verified signed password AMR, or recent TOTP
AMR when a verified factor is present and the current policy enables TOTP. Fresh
getUser completion, JWT metadata, stale/future/missing/ambiguous AMR and unsupported
methods cannot substitute. The new adapter has unit/query checks, but it is not
yet substituted into the actual-service composition and does not supply the
separate signed-claim worker `verifyActor` provider. Real Auth concurrency/factor
insertion and cancellation need actual-service evidence. Policy acquisition,
credentials, least-privilege grant and a production route are not enabled.


## Prepared current-actor worker callback

`createHomeHandoffInventoryActorVerifier` is a backend callback for claims already
HMAC/signature/binding-verified by the private inventory-consent provider. It does
not accept client flags as authorization and does not verify signatures itself.
It pins the current Auth user, exact session, all factors and enabled enrollment,
then applies the same current session-policy query and verifies assurance/epoch,
original timestamps and current recent-authentication age. Schema/policy failure,
unsupported signal, lost session/enrollment or cancellation returns refusal.

The prepared actual-service fixture now uses this callback for issuer readback,
journal/status and atomic activation, replacing the old no-factor worker stub.
The TOTP fixture also checks a verified identity's worker predicate, disabled TOTP
policy and logout refusal. These new cases need same-head CI evidence. Exact
factor-set/state snapshot binding to the signed consent remains an explicit
release gate: pins/current AAL alone do not prove that the factor set is unchanged
since issuance. Production current-policy acquisition, native explicit consent
UI and least-privilege routes remain disabled.
