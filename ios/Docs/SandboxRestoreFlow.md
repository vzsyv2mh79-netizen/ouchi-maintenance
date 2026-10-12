# Disabled Sandbox restore UI and one coordinated native flow

This adds a real NativeStore action path, not enablement or verified Apple/device
operation. `OUCHI_SANDBOX_RESTORE_ENABLED` is explicitly false in the shipped plist.
NativeStore additionally requires DEBUG, real Sandbox billing configuration,
registration configuration, current enrolled account, and no loopback or review
sample. Release returns false. Server restore flag and DB policy stay disabled.

The Sandbox contract screen includes restore/check-progress/prepare-retry actions
only with this configuration. Labels distinguish accepted/pending, process complete,
missing record and scoped cancellation. An uncertain result preserves proof and
shows a progress/cancellation option. Cancellation is *not* subscription termination.
Ordinary same-account restore, free household features, tips and Release recovery
remain available through their existing paths; these changes do not enable sales.

## Actual action wiring

NativeStore loads fresh server enrollment, obtains initial registration through the
existing shared coordinator, requires a matching retained confirmed key reference
and no closure, and reads the selected device-only encryption key without creating
a replacement. Its API identity provider checks account generation, binding revision,
user/epoch, fresh enrollment, retained key/reference and closing state before/after
transport. Unsupported device, expired/mismatched key/reference, relogged original
scope, missing key or unavailable Auth fails closed and retains any restore proof.

`SandboxRestoreFlow` serializes actions within the instance. If an encrypted record
exists, start resumes its exact status before any producer/SDK operation. Otherwise
it creates a fresh request ID, calls the own-SDK producer once, checks request and
scope, and calls exclusive stageNew/first submit once. It never calls the separate
stageSandboxRestore helper (avoiding double staging). The file's process-shared
lease prevents a second instance/process from staging/resending the same record.

The producer uses PurchaseManager's own AppStore.sync/currentEntitlements to select
one unique verified active purchased foreign-registration premium Sandbox contract.
No original transaction ID/JWS/device ID is entered by the user. Full own AppTransaction
and current transaction device digest/signed-pair consistency are rechecked by the
existing evidence collector, then fixed challenge HTTP and DeviceCheck assertion
produce the PendingRestore. This is consistency evidence, never permission to
transfer a still-owned purchase: the trusted server verifies/reserves eligibility.

Refresh uses original stored digests only. Cancellation requires exact authenticated
server receipt and exact persisted record, does not automatically generate a new
proof, and asks the user to explicitly start again with a fresh request ID. Unknown,
pruned, consumed, reserved or revoked-session results keep proof. Process completion
is not current premium: NativeStore separately requests the existing authoritative
verified-ledger entitlement before refreshing displayed rights.

## Evidence and incomplete release work

- Standard local verify-native.py passes 57 freshly compiled smoke tests,
  Release/Debug macOS app typecheck, UI syntax and project/plist/privacy manifest.
- New actual AES-GCM temporary-storage plus synthetic HTTP/Auth flow test covers
  one staging, restart/lost-commit-ack status-only continuation, unknown/reserved
  cancellation refusal, lost cancellation acknowledgement, exact cancellation,
  explicitly new attempt/new ID, completed-process cleanup, absence without HTTP,
  overlap refusal, and disabled/Production/loopback configuration gates.
- NativeStore/PurchaseManager wiring is typechecked and iOS CI builds must be
  observed separately. The flow fixture does not execute live NativeStore UI,
  Keychain/DeviceCheck, AppStore.sync, real signed pair, Apple server APIs, actual
  service dispatch, current premium grants or user accounts.

Before enabling: authenticated worker job lookup/dispatch, external Apple unknown
outcome reconciliation/escalation, finite receipt/job/pending retention and anti-abuse,
pruned/revoked-scope recovery, formal DB advisors, signed Sandbox/real-device/UI/
accessibility/background tests, membership/signing/products/TestFlight and listing
remain required. Do not claim that this path completes cross-account restore while
its worker/service and signed device verification remain unavailable. No Production,
real charges, paid infrastructure, shared DB application or owner data changes.
