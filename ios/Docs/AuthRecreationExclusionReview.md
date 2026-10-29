# Auth identity recreation exclusion — local review candidate

2026-10-21. **Not deployed or enabled. No shared Auth permission has been requested or applied by this change.** This is a fixed local candidate and proof packet, not approval to retire real accounts.

## Scope and concrete safety differences

`lib/ouchi-auth-recreation-exclusion.mjs` opens a fresh direct `pg.Client` as `ouchi_auth_exclusion_backend`. It first acquires one domain-separated signed 64-bit actor advisory key exclusively, acquires the shared form before releasing the exclusive form (no gap), and holds that shared session key across several owning transactions. Every bound owning transaction also explicitly acquires the same shared key at transaction level. Both conflict with the guard’s exclusive transaction try-lock. It finally releases only its shared session key and closes its own connection. Cancellation, timeout or broken metadata closes the dedicated connection; an old binding cannot authorize new work. There is no pool, ambient credential discovery, global unlock, retry, scheduler or deletion API.

Session locks persist across transaction completion; transaction advisory locks end with the transaction. That distinction is the basis of the held/excluded-writer design. [PostgreSQL advisory lock documentation](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS), [lock functions](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

The SQL review fixture creates a SECURITY INVOKER trigger function owned by a separate restricted NOLOGIN role. It reads only `NEW.id`/`OLD.id` and built-in lock/hash functions, never Auth/private rows. Two ALWAYS BEFORE ROW triggers protect `auth.users` INSERT and UPDATE OF id. Ordinary unchanged-id updates return immediately. Both the old and new keys are checked for a UUID change: **an INSERT-only guard would allow recreation by renaming an existing UUID.** Other IDs, signup, password login and DELETE continue in the native proof. ALWAYS is required for replica-mode writers. [PostgreSQL trigger enable modes](https://www.postgresql.org/docs/17/sql-altertable.html).

The deployed function body must exactly match SHA256 `89c929a2630f298f4d9cc30c2060ec5e622242ace7d658333e85c929faabecf5`. Every verification reads fresh metadata from the independent READ COMMITTED holder connection: exact body/config/owner, INVOKER, correct table and trigger events/columns, ALWAYS, no WHEN/args, and no extra BEFORE INSERT/UPDATE hooks or rewrite rules. Unknown hooks are a refusal requiring review; they are never removed automatically. This avoids silently assuming a later hook cannot change the UUID after our check.

Holder, guard owner and caller must have the required nonprivileged attributes, no role memberships, no schema CREATE/database ownership, and no Auth users table/column privileges. The holder is an actual LOGIN; the guard owner cannot log in. Worker code exposes no holder query/client. A random application nonce, database OID, actual PID and `pg_locks` are cross-observed by the caller, not inferred from matching PID numbers on potentially different instances.

## Binding API

`createOuchiAuthRecreationExclusion({target, verifyRemainingPaths, maxHoldMs?})` returns `withScope(scope, signal, work)`. Work receives only `{signal, bind}`. `await held.bind(checkedTx, scope, checkedTx.signal)` returns an opaque `{verify}` or null. Pass `binding.verify` to the historical reader's mandatory Auth-fence callback. Each binding first locks the root, then explicitly acquires the dedicated shared transaction key and pins the exact checked transaction object, physical PID/XID and current processing root/lease. Each verification cross-observes both the holder’s shared session key and the caller’s shared key. A later transaction needs a fresh binding while the same held session remains alive. Do not return an unawaited binding/check.

The default hold is 30 seconds, bounded to 120 seconds. Cancellation/connection loss is a failed or uncertain operation, never completion evidence. If the holder dies after the final check but before COMMIT, the owning transaction’s independent shared key still blocks principal recreation until that COMMIT or ROLLBACK. A real native fault test terminates the holder immediately after the last successful binding verification: actual same-ID Admin create remains refused and the owning marker COMMIT succeeds; withScope subsequently reports uncertainty, never success. After COMMIT the key may be gone, so a restart requires a new session lock, new binding and fresh real absence/root/phase readback. It must not blindly delete a newly reappearing account; dispatch/unknown-outcome policy belongs to the separately reviewed root adapter.

Production targets accept only the direct `db.<projectRef>.supabase.co:5432` endpoint, explicit credentials and certificate-verified TLS. Pool/transaction-pool options and credential fallbacks are refused. The isolated fixture mode requires an explicitly supplied owned Unix socket matching `OUCHI_SCOPED_TEST_PG_SOCKET`; the caller also observes the random holder nonce on the same database. A root-owned temporary socket alias may be used only for that isolated test with the same-instance proof and cleanup. [Supabase direct connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

The final-check/COMMIT fault was identified by a separate root integration test against the earlier session-only candidate; that candidate must not be treated as closing the gap. The revised source includes the owning transaction shared key and an actual local reproduction proving its protection.

**`bind` remains processing-root only.** The separately named `bindTerminal` now verifies the owner-zero immutable closure and exact complete-root facts through its fixed RPC when the real root is complete with cleared lease. It never reclassifies a cleared lease as live. Both bindings retain owning shared xact exclusion; terminal original/coverage authority is supplied by the separate OwnerOnlyTerminalReview candidate, never by the physical hold alone. The physical hold is not itself a consent or dispatch capability.

## What is proven locally

Actual PostgreSQL 17.6 and GoTrue v2.197.0, synthetic accounts only:

- Same-ID Admin create is rejected while held; another UUID can sign up, be created and password-log in. DELETE completes without an Auth-parent row lock.
- Node/SQL signed key values agree. A real old REPEATABLE READ snapshot and replica INSERT/UUID UPDATE cannot bypass the held principal lock; UUID movement away from a held original is also rejected. A narrow nonprivileged SQL writer invokes the guard without private-schema/function grants.
- A conflicting in-flight INSERT prevents lock acquisition before work starts. One shared session remains held through multiple actual COMMITs; a competing holder first attempts exclusive acquisition and is refused.
- Disabled trigger, DEFINER/body drift, holder Auth privilege broadening, remaining-path loss, foreign transaction, real different PID, and terminated holder cause refusal/SQL rollback. New acquisition still checks real absence.
- Normal and abnormal cleanup leave no owned holder connection. Released bindings remain unusable. Originals, manifests, native expiry and another owner's data/login remain unchanged.

The native fixture is `tests/ouchi-owner-only-claim.native.mjs` with `tests/fixtures/auth-recreation-held-cases.mjs`. Its local log is recorded in the fixed verification packet. Existing GitHub workflows do not execute this dedicated local-socket native runner; they are not a substitute for that proof.

## Remaining required coverage — concrete counterexample

**This users guard is not an all-Auth-table write barrier.** The native fixture deliberately performs an orphan `auth.sessions` INSERT in a privileged replica transaction while the user ID is held; skipping the FK allows that INSERT. It is rolled back before reader verification. Normal FK-respecting writes cannot refer to a removed user, but privileged restore/replica paths require their own exclusion. The guard also cannot prevent a privileged administrator disabling/replacing it between checks.

`verifyRemainingPaths` is therefore a mandatory independent trusted read-only provider, not `() => true`: it must establish all other Auth-table writes/restore/replica routes, app reenrollment and old-JWT writers, and privileged trigger/DDL changes are excluded or covered through owning COMMIT. Local application stop/retained-row checks and a modeled operational flag are **not** deployment-wide proof of those paths. No new session/identity-table trigger, whole-table lock or global privilege revocation has been quietly added to hide this gap. Hosted adoption remains blocked until that coverage is concrete.

## Before any shared deployment

Inspect the current hosted catalogue, existing BEFORE hooks/rules, Auth runtime built-in execution privileges, exact owner/role creation capability and effective ACLs. Review all affected apps and Auth providers, including import/restore and concurrent flows. No new persistent PII/tombstone table is introduced, but normal same-ID concurrent INSERTs can now fail early and a 64-bit collision can cause a false availability refusal.

Verify direct connectivity, TLS and connection capacity without assuming a paid add-on is necessary or authorized. Keep the manually operated retirement policy; this candidate adds no background processor. Freeze the remaining writer/DDL coverage and verify an approved production ownership/grant profile before enabling any caller.

**Creating the shared Auth triggers/roles or enabling a real deletion flow needs a separate concrete review and explicit authorization.** This work has changed no production schema, role, privilege, real account, file, charge or public release.
