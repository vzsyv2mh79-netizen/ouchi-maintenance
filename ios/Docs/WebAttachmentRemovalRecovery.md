# Web attachment removal after acknowledgement loss

Prepared 2026-10-15; existing photo deployment gates stay disabled.

The original browser implementation sent DELETE without first saving the selected attachment reference. A fenced file no longer appears in ordinary listings, so after a lost response and reload there could be no item from which to retry. The prepared native implementation already has its separate removal reference; this change closes the browser gap.

Before sending, the browser commits an immutable account/epoch/product/attachment receipt. The existing IndexedDB driver uses a separate removal key within the same account cleanup range. It does not store a bearer, ownership/entitlement flag, filename, file bytes or server completion. Conflicting tabs cannot replace the pending target. Upload receipts and their bytes remain separate.

Settings under cloud storage provide explicit lookup and confirmed retry, independent of the original product controls. Recovery reads the committed receipt, checks the current server account/epoch, sends only that attachment ID, then rechecks current scope before exact-ID acknowledgement cleanup. Unknown responses, wrong IDs, changed scope, cancellation or failed local cleanup preserve unconfirmed status rather than claiming completion. No new request ID, automatic replay or file creation occurs.

The existing logout/auth-loss lifecycle clears local records for that account and fences a late commit. It now also clears these removal references because they use the same account prefix. This is a local privacy boundary, not cancellation or proof of completion on the server. The UI states that remote deletion is not cancelled by logout.

Verification: 29 related unit tests, typecheck, lint and production build passed. Real Chromium UI/IndexedDB/fetch against a synthetic Next server verifies lost acknowledgement, navigation without product controls, wrong-ID refusal, same-ID retry and auth-loss cleanup. A second persistent-browser test verifies restart, cross-tab visibility, immutable target and account cleanup with zero API requests. The actual image preparation module now runs with a valid synthetic PNG; missing fixture dependencies and an ambiguous heading locator were corrected. These are not hosted Supabase/Storage or physical-iPhone results.

Evidence: `ReleasePreparation/web-attachment-removal-recovery-20261015.json`. Operator Storage reconciliation, physical erasure deadline and account-deletion outboxes retain their independent requirements.
