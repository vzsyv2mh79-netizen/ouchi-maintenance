# Signed-inventory PostgreSQL/Auth/Storage composition — result pending

The dedicated disposable-family workflow now awaits a final atomic composition
fixture, after its original family preservation, MFA, separate Storage and quota
concurrency assertions. Its outer test limit is 120 seconds to accommodate the
additional fixture; application, proof, database-context and transport limits
remain unchanged. The new fixture creates only random isolated test accounts,
home/task/file rows and private PNG objects. Existing customer data and remote
production configuration are never targeted.

The fixture uses actual GoTrue getUser for family-snapshot consent identities,
synthetic signing keys, the existing signed household port and its full private
review fences. The prepared complete-inventory provider verifies the exact real
bearer using getUser before decoding signed password AMR timestamps. Recent
password authentication comes from that AMR timestamp, not getUser completion.
It locks real GoTrue sessions and existing enrollment/account rows and refuses
verified MFA factors in this disposable no-factor policy. Journal reservation,
status and activation use separate signed-inventory authorization/approval calls.
The review SQL captures the same-transaction signed approval and checks it again
at COMMIT. These new assertions require same-head actual-service CI evidence;
older green runs with injected inventory authorization do not prove them.

Production policy acquisition, factor-insertion/predicate and current-MFA pins,
least-privilege adapters and the native consent UI are still open. This test-only
no-factor policy is not a shipping authorization provider.

Intended checks, not a success claim until same-head CI logs prove execution:

- Initial full frozen inventory has no journal; real database reservation persists
  the complete original inventory and quota. Its successful reply is discarded.
- SDK copies actual private bytes with measured destination proofs; one guarded
  pinned PostgreSQL transaction activates home ownership, all file/write metadata,
  receiver quota and both receipts. Its successful reply is also discarded.
- A fresh database status provider and orchestrator restart read the same durable
  outcome without repeating preparation or activation. Both original owner and
  member paths remain, as source cleanup is explicitly refused in this fixture.
- Actual receiver attachment-read RPC resolves transferred metadata, all source
  and receiver copies contain exact PNG bytes, and the family snapshot is retained.
- The receiver's actual bearer passes the existing prepared attachment HTTP
  handler for both transferred-owner and retained-member files and receives exact
  PNG bytes with no-store/nosniff headers. Former owner and unrelated bearers are
  refused with JSON errors; after real receiver logout, the old bearer is refused
  while the user row, records and destination bytes remain. These added handler
  assertions require same-head CI verification and do not deploy a public route.
- Separate complete-inventory consent revocation blocks readback/restart while
  the old family-snapshot signatures remain unchanged. Original bytes and both Auth
  accounts remain. No activation receipt is equated with retirement completion.

The fixture installs review-only SQL into the workflow's disposable database and
requires the fixed local service origin and explicit test flag. No configurable
production URL, new exposed role/grant, production migration or paid resource is
introduced. Concurrent activation/cancellation, current Auth/MFA policy pinning,
durable source cleanup/completion, shipping/native routes
and physical-device recovery still require further verification.
