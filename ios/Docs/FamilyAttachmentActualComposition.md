# Actual PostgreSQL and Storage composition — prepared test, result pending

The dedicated disposable-family workflow now awaits a final atomic composition
fixture, after its original family preservation, MFA, separate Storage and quota
concurrency assertions. Its outer test limit is 120 seconds to accommodate the
additional fixture; application, proof, database-context and transport limits
remain unchanged. The new fixture creates only random isolated test accounts,
home/task/file rows and private PNG objects. Existing customer data and remote
production configuration are never targeted.

The fixture uses actual GoTrue getUser for family-snapshot consent identities,
a synthetic signing key, the existing signed household port and its full private
review fences. Complete-inventory authorization and current MFA/management policy
are still injected. It is not shipping consent or least-privilege route evidence.

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
- Consent revocation blocks readback/restart while original bytes and both Auth
  accounts remain. No activation receipt is equated with retirement completion.

The fixture installs review-only SQL into the workflow's disposable database and
requires the fixed local service origin and explicit test flag. No configurable
production URL, new exposed role/grant, production migration or paid resource is
introduced. Concurrent activation/cancellation, actual inventory-bound signing,
current Auth/MFA pinning, durable source cleanup/completion, shipping/native routes
and physical-device recovery still require further verification.
