# Native Sandbox restore challenge transport

Prepared only; no purchase, assertion commit, transfer dispatch, entitlement grant or Production activation.

`RestoreChallengeAPI` POSTs the own-device SDK pair to the fixed first-party challenge endpoint with the captured bearer and explicit enrollment epoch. Redirects, cookies and cached responses are refused. Request and streamed response sizes are bounded. Current user/session/epoch/key binding and bearer expiry are checked before and after transport and parsing. Only the exact canonical server challenge matching the requested pair, request ID and registration scope is accepted within its five-minute deadline.

`PurchaseManager` composes this transport with its existing own-device Sandbox StoreKit evidence and DeviceCheck assertion preparation. It returns evidence and an assertion to a future durable commit flow. This is not wired to a live restore action. No automatic retry is introduced.

Tests use synthetic JWT claims, canonical fixtures and injected HTTP/DeviceCheck operations. They check fixed endpoint and body, response bounds, wrong URL/cache/MIME/status, altered pair, expiry and session changes. They do not verify JWT/Apple signatures, run live network requests or grant rights. Release and Debug app typechecking is required.

Remaining: authenticated assertion commit and atomic reservation, durable pending request/status recovery, dispatch/reconciliation and finite retention, actual signed-device App Attest and Apple Sandbox verification.
