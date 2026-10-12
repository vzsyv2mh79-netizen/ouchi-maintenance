# Restore assertion verification context

Prepared service-only Sandbox database read. Shared Supabase is not changed; restoration and sales remain disabled.

The server must verify current Auth, its live session/explicit enrollment and both Apple-signed records before calling the function. It passes the independently verified pair digest, expected App ID/environment and exact request/key. The function uses the existing account/policy/key locks, then reads the unconsumed challenge under a share lock. It refuses foreign scope, expired/future/consumed challenges, a different signed pair, Production or inconsistent canonical hash. It returns only the stored challenge, scoped public key/counter and canonical digest, never the attestation receipt.

This snapshot is not permission to transfer ownership. The assertion verifier must independently verify signature/build/extensions/counter; the existing reservation RPC must atomically recheck live enrollment and compare-and-swap nonce/counter. Concurrent changes after this read must be refused there. Retry after a consumed challenge needs a separately scoped durable job lookup, not this function or a fabricated success.

Local tests run actual SQL in PGlite with synthetic enrollment and EC keys/receipts. They do not prove Apple certificate trust, real Auth/PostgREST, PostgreSQL concurrency or formal Supabase advisors. Those checks remain required before activation.

Current official documentation: https://supabase.com/docs/guides/database/functions . Explicit service-only EXECUTE privileges follow its function guidance. New public table exposure changes do not require exposing the private registry; this migration creates no table. PostgreSQL minor upgrade changes concerning ltree/legacy pgcrypto encryption/custom operators are not used here.

`restoreCommitResponse` composes hardwired Apple pair verification and App Attest signature/build/counter verification with this snapshot, then calls the existing atomic reservation RPC once. It rechecks current Auth/enrollment between stages. A 202 response means pending reservation only; it never grants rights or invokes the Apple token update. Exact five-field request JSON is bounded to 256 KiB combined, with each JWS and decoded assertion separately bounded to 128 KiB. A wrong/lost reservation acknowledgement or changed scope returns failure without automatically retrying.

This server composition is not exposed by an enabled route. Missing pieces include deployment policy/build configuration, authenticated durable job lookup and retry after a consumed challenge, native encrypted pending commit/status storage, dispatch and external-mutation reconciliation. Tests perform real P-256 verification with synthetic keys while Apple SDK methods/Auth/RPC responses are stubbed; this is not actual Apple trust or an end-to-end SQL reservation proof.
