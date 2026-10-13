# Two-party TOTP consent and attachment handoff — verification pending

The existing disposable atomic-services fixture now promotes both transfer
participants through real GoTrue TOTP enrollment/challenge/verification before
either family-snapshot or complete-inventory consent. It asserts both signed
bearers and stored sessions use AAL2, then asserts the two stored inventory
consents retain each person's exact signed TOTP authentication timestamp.

The same fixture continues through private Storage copying, atomic ownership/
file/write/quota/receipt activation, lost reservation and activation responses,
fresh durable readback, recipient downloads, factor-inventory change rejection,
consent revocation and logout. Original bytes and Auth accounts remain intact.
The separate unverified-factor scratch account still tests AAL1 pins and rollback.
No extra schema installation, public endpoint, production mutation or payment
is introduced. Fixed local origins and explicit disposable-test opt-in remain.

Local syntax and targeted lint passed. The relevant authenticator, identity and
inventory-consent suite passed 29 tests, 0 failed, 0 skipped. These local tests
do not run the new actual-service composition; this Mac has no Docker runtime.
The existing Family preservation Auth and Storage workflow must execute the
updated fixture successfully before this scope is called verified.

Policy is still explicitly injected. Production policy acquisition, deferred
Auth freshness at COMMIT, consistent multi-actor locking, source cleanup and
whole-account completion, shipping/native routes and physical-device review
remain open. The successful prior head 86ec247 covers the preceding composition,
not this new two-party TOTP extension. App Store and real billing remain disabled.
