# Two-party TOTP consent and attachment handoff — isolated composition verified

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
The updated actual-service composition subsequently passed on PR #167 head
`bdf0bfb45ae6cd5c4f27b83f0fd5b3a6cd7fb73c`: Family preservation Auth and Storage
run `38341500233`, job `115113284620`. Its inspected log has the explicit
disposable opt-in and reports 1 enclosing test passed, 0 failed, 0 skipped.
The tested tree's two selected file blobs were verified after publication;
the outer test awaits this fixture, whose assertions execute before returning.
Disposable container/volume cleanup also succeeded. The five same-head checks
subsequently all completed successfully: family Auth/Storage, isolated Auth,
additive migrations, regression and Native iPhone checks. This does not imply
production activation or physical-device/App Store purchase verification.

Evidence: https://github.com/vzsyv2mh79-netizen/ouchi-maintenance/actions/runs/38341500233

Policy is still explicitly injected. Production policy acquisition, deferred
Auth freshness at COMMIT, consistent multi-actor locking, source cleanup and
whole-account completion, shipping/native routes and physical-device review
remain open. Prior head 86ec247 covers the preceding composition; the evidence
above covers this new two-party TOTP extension. App Store and real billing remain disabled.
