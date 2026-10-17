# Native pending restore cleanup

Prepared app integration; no restore UI activation, real Keychain inspection, account deletion or shared DB changes performed.

The native registration coordinator's account closure now invokes the injected restore-proof eraser before deleting key references/encryption keys. Final confirmed local-session cleanup and explicit abandoned-closure recovery also invoke it. Failure keeps the durable closure and key material available for retry; cleanup of an owned restore directory never decrypts or calls its key provider.

NativeStore injects the dedicated OuchiPendingRestore account eraser into configured coordinator, deletion fallback, confirmed final cleanup and abandoned-closure recovery. After an app restart without a coordinator, logout probes only for account-owned pending files; an existing owned empty folder can resume its prior closure. This fallback records durable closure intent before erasing proof/keys and finalizes only after confirmed session erasure. Other accounts are preserved. Ordinary logout without restore artifacts does not enter this fallback.

Tests use separate processes, a file-backed synthetic Keychain substitute and opaque restore-file fixtures. They cover registration lease contention, restore lease contention, injected additional-proof erasure failure retaining keys/intent, uncertain finalization and selected retry preserving another account. Actual encrypted storage/probe is tested separately. NativeStore integration is typechecked; real logout/deletion UI, real iOS data protection, interrupted device cleanup and actual keys remain unverified. Native restore UI/device-key setup/commit flow and server unknown-result reconciliation/finite retention remain release requirements.
