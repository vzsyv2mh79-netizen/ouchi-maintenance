# Prepared Sandbox restore assertion path

`PurchaseManager.sandboxRestoreAssertion` collects its own verified StoreKit
app/subscription pair through `sandboxRestoreEvidence`. The caller supplies the
captured authenticated registration scope and an already registered key, not
purchase JWS or a device identifier. The epoch must match the currently bound
purchase account and the app identifier must end in the running bundle ID.

The exact pair is hashed with the server's domain separator, UTF8 byte lengths
and SHA-256. The challenge callback must be implemented by authenticated server
transport; it returns the exact canonical bytes of the stored single-use nonce.
The native parser matches user/session/epoch/request/key/app/attestation
environment and pair hash, fixes purchase environment to Sandbox, checks the
five-minute lifetime and refuses noncanonical bytes and duplicate/extra fields.

`RestoreAssertionDeviceService` calls Apple's generateAssertion with the already
registered key ID and the SHA-256 of those exact bytes. The supplied trusted
current-scope validator is called before and after the noncancellable Apple
callback. Cancellation, expiry, unsupported devices, missing or oversized proof,
and callback errors refuse the result. A discarded unsent assertion may advance
the device counter; the existing server verifier allows increasing counters and
refuses replay. There is no automatic assertion retry or network submission.
The manager also checks its authentication generation before returning.

## Evidence and remaining integration

The actual server restore-client-data implementation generated the synthetic
canonical bytes, pair digest and hash used by the Swift smoke test. The fixture
includes non-ASCII strings to check UTF8 lengths. The device smoke test injects
callbacks and validates the exact key/hash, pre/post authentication, pre/post
expiry, cancellation, errors and limits. These are not Apple signed proofs.

The method has no UI entry point yet. Authenticated challenge/commit/status
transport, confirmed-key lookup, durable submission recovery and finite
retention, server signature verification/atomic reservation, job dispatch and
signed-device Sandbox tests remain required. The validator and challenge
callback must come from the trusted enrollment/session provider, never client
input. The server must load the registered key and approved build policy from
its registry, verify both JWS and the assertion and consume once with the
reservation; a successful DeviceCheck callback does not confer ownership or
paid rights. Selling, real billing, Production transfer and shared DB changes
remain disabled.

Apple source:
https://developer.apple.com/documentation/devicecheck/dcappattestservice/generateassertion(_:clientdatahash:completionhandler:)
