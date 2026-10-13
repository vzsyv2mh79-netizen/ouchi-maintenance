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

Five full-schema PGlite cases cover signed reserve/readback, one-person refusal,
changed plan/epoch/metadata, forged/wrong-key records, original expiry/revocation,
stale authentication, lost current session, late revocation, post-write rollback,
cancellation and private-role denial. Auth/session tables are synthetic and MFA,
scope authority and clock-advance policy are injected. The positive case connects
signed authorization to journal reserve and status only, not atomic activation.

## Release gates still open

- Real signed issuer HTTP/native consent presentation and explicit user approval
  of the complete photo list/receiver; key provisioning and least-privilege store.
- Current Auth/MFA policy acquisition, recent-authentication evidence, session and
  factor pinning, plus worker current-authority providers and formal lease reclaims.
- Bind these inventory proofs to the private atomic activation context and
  deferred COMMIT checks. The existing activation fixture captures family-snapshot
  consents; it does not yet capture these separate inventory consent rows. This
  provider's boolean cannot substitute for that missing database boundary.
- Actual PostgreSQL/Auth/Storage composition using this provider, cancellation,
  uncertain replies, durable source cleanup/completion and finite proof retention.

No production schema migration, exposed role/grant, endpoint, real payment,
paid infrastructure, existing-user deletion or App Store publication is enabled.
