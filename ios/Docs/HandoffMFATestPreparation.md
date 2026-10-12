# Handoff session and MFA verification — 2026-10-13

Prepared identity checking binds exact-bearer Auth getUser verification to the current database session and explicit app epoch. Editable metadata cannot provide session IDs or AAL. A verified factor requires both bearer AAL2 and database-session AAL2 immediately for this sensitive operation. An old AAL1 bearer cannot inherit session promotion. Cancellation and the original policy timestamp are rechecked after awaits. Canonical nonnil epoch UUIDs are required.

Local verification: 24 injected/vector tests passed (identity 7, handler 7, policy 9, synthetic TOTP 1), targeted lint and complete TypeScript check passed. The earlier missing MJS declaration was fixed with a declaration matching all handler exports.

The dedicated family CI candidate now enrolls and verifies an actual TOTP factor against disposable GoTrue v2.196.0, reads actual session/factor state through PostgreSQL, and checks promoted AAL2, the original AAL1 bearer, a fresh password-only session, and logout. The synthetic authenticator matches RFC 6238 SHA1 vectors modulo six digits. Secrets/codes are confined to synthetic accounts and never printed. Policy configuration remains an injected fixture, not a live Management acquisition. The DB connection is fixed to disposable loopback services and always rolled back/closed. The actual integration result is pending until the corresponding CI job completes; locally this opt-in service test was skipped because Docker is unavailable.

This is not shipping authorization: the verifier currently reads session/factor state without locking it, does not support single-session policy, and refuses inactivity checks when refreshed_at is absent rather than implementing GoTrue's refresh-token fallback. A trusted effective-policy source, least-privilege DB provider, state pinning and precommit revalidation, verified consent/controller bridge, attachment custody transfer, and native route integration remain required. No shipping route, real credential, production policy change, real payment or user deletion was enabled.

Official references checked:
- https://supabase.com/docs/reference/javascript/auth-mfa-enroll
- https://supabase.com/docs/reference/javascript/auth-mfa-verify
- https://raw.githubusercontent.com/supabase/auth/v2.196.0/internal/conf/configuration.go
- https://datatracker.ietf.org/doc/html/rfc6238
