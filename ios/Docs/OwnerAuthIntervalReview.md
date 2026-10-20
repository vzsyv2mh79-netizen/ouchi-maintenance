# Owner original during Auth removal — undeployed candidate

2026-10-21. `createOuchiOwnerAuthIntervalConsent` and `read_ouchi_owner_auth_interval_original` are separate from the existing pre-native, Auth-parent-required post-native and erase-auth-required after-auth readers. Those readers remain unchanged and strict.

The interval requires the original owner HMAC/session/epoch/expiry, exact immutable empty-family checkpoint and receipt-session manifest, canonical native completion/independent completion lease, live processing root/binding, all app erase/verify and family/session-before-Auth receipts. It accepts the exact prefix before erase-auth or with erase-auth visible at owning COMMIT. Verify-auth, COMPLETE and completed-root tokens are outside this reader.

It returns only `owner-only-auth-removal-interval-history`. Auth presence is not treated as identity or authority: the user can be present before the authorized DELETE or absent immediately afterward inside its handler. Actual session absence is re-read. No original is signed, renewed or converted into fresh AAL2 or a deletion capability.

## Required independent callbacks

All callbacks use the same checked transaction/signal; none has a default success value:

- `verifyReadAuthority`: current retained member-only obligations, writer/namespace/Storage/inventory coverage.
- `verifyAuthRecreationFence`: a real current held exclusion binding, combined with the independently proven remaining Auth-table/reenrollment/DDL coverage described in [the exclusion review](AuthRecreationExclusionReview.md).
- `verifyPhaseAuthority`: exact original/dispatch reservation/current HTTP or acknowledgement phase, including unknown-outcome/duplicate-send policy and a fresh audit that the owning transaction has no Auth/DELETE-child row/write lock. Native dispatch/remaining-path fixtures do not implement the production adapter.

`read(tx)` installs an owning COMMIT recheck and poisons a caught refusal. `readSnapshot(tx)` is hook-free for an existing owning verifier; require a non-null result and do not recursively call the reader from its callbacks. Each SQL read before and after the callbacks must return the same original and physical PID/XID.

## Avoiding the Auth API lock cycle

The RPC never locks Auth users/sessions or the generic app-principal advisory key that an Auth-side cleanup trigger could need. It refuses if any relation it row-locks is a declarative Auth FK/partition descendant, including restrictive FKs. It locks only the scoped private root/custody/native/fence rows after that catalogue preflight. The separate identity hold is on a different dedicated backend and is consulted only by INSERT/UUID-change guards. Do not reintroduce an Auth FK on those custody tables without reviewing the interval.

The caller still needs a live lock audit before dispatch: catalogue checks do not prove arbitrary trigger bodies or privileged DDL stability. The native test freezes the existing root's recursive Auth/cascade/partition lock query, not a second dispatcher implementation. Auth-parent-locking old readers must be committed before the external API interval and must not be invoked from its callbacks.

## Actual local proof

With a real held direct-session exclusion, the native test:

1. Deliberately uses the old Auth-parent-locking reader; the new phase check refuses and no DELETE is sent. A synthetic Auth-FK coupling on original custody also refuses before dispatch and is removed without altering the signed original.
2. Reads the original with a non-locking interval inside the actual root erase-auth transaction, audits its Auth/cascade locks as clear, calls real GoTrue Admin DELETE on the original synthetic account, and reads the same original after removal before the receipt is stamped.
3. Rechecks through owning COMMIT after exact erase-auth acknowledgement. Replaying that durable stage sends no second DELETE. A fresh transaction bound to the same held session then uses the independent after-auth reader, which still refuses before the durable acknowledgement.

Related tests reject missing/lost phase, Auth-fence and current-writer authority, changed HMAC/epoch/frame, cancellation and physical transaction drift. Native tests preserve the original/manifest/native expiry and another owner's home/product/login.

These are PostgreSQL 17.6/GoTrue v2.197.0 local results. Earlier-app cleanup/inventory, full Auth dispatch journal, remaining Auth-table/reenrollment/DDL coverage and production ownership remain explicit fixture boundaries. The privileged orphan-session counterexample in the exclusion review is unresolved by this reader. No global COMPLETE/final release, completed-root receipt/retention permission, production schema/role/grant, actual customer deletion or public release has been enabled.
