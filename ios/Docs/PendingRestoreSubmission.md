# First native restore submission

Prepared core transport/coordinator. No live restore UI, device key setup, server worker dispatch, actual charge or Production activation.

RestoreCommitAPI posts only the exact bounded retained pair/assertion to the fixed first-party Sandbox restore commit endpoint. It validates captured login/enrollment/registered scope and the canonical challenge deadline before sending, rejects redirects/cache/foreign/oversized replies and accepts only exact HTTP 202 pending for the requested UUID. The typed acknowledgement carries original proof digests and scope, never current premium access. The stored proof remains until authenticated complete status.

PendingRestoreSubmission atomically stages a new attempt under the account/epoch filesystem lease before HTTP. Any existing attempt, including an exact retry from another actor/process, refuses a second submission. Errors, cancellation, lost acknowledgement and app restart preserve evidence and must use read-only status recovery instead of regenerating assertions or resending. No automatic Apple update is dispatched.

Release gap: if the app stops after staging but before sending, or the server definitely rejects before reserving, current status may be unavailable. A scoped server confirmation of no reservation and reviewed reauthorization/retry/retention policy is still needed; do not erase unknown proof or enable this flow as a finished user experience. The earlier SDK staging helper and this exclusive first-submit path are separate preparation APIs; the live UI must use one coordinated path, not stage twice. Signed-device integration/real Auth/Apple Sandbox and complete local/server retention remain unverified.

Tests use actual AES-GCM temporary-file storage and injected HTTP, verifying staging before transport, exact body/header, strict pending acknowledgement, duplicate/restart refusal, lost-response/cancellation retention and expiry/scope/malformed rejection. No real Keychain, Apple signatures/network/rights or full device restart is proved.
