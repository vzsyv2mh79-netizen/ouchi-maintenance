# Prepared GoTrue version discovery

On 2026-10-13 a bounded read-only GET to the known shared project's official
`/auth/v1/health` endpoint returned GoTrue v2.197.0. It used an existing modern
publishable key, without login, config changes or customer records. No key is
included in this document. This is a point-in-time discovery, not runtime
authorization or evidence of effective MFA/low-AAL configuration.

Official reference:
https://supabase.com/docs/guides/troubleshooting/how-do-i-check-gotrueapi-version-of-a-supabase-project-lQAnOR

`createHomeHandoffAuthVersionReader` is a prepared server-only reader requiring
an explicit project and modern publishable key. It permits only a fixed HTTPS
GET, refuses redirects, wrong service/final URL/status/MIME, malformed encoding,
invalid version and declared/streamed responses over 8192 bytes. Caller cancel
and bounded deadlines cover fetch and body waits; late responses are disposed.
Only immutable project/version/time evidence leaves the reader. Freshness is
less than 60 seconds and requires the original issued record and uncancelled
caller. The key and unknown response fields do not leave the reader.

Discovery of semver is not approval of that version. Existing policy verification
still rejects unreviewed versions and absent effective low-AAL evidence. No
subscription tier, dashboard label, client flag or health response supplies the
missing effective setting. Independent current effective config, trusted source
provisioning, shipping composition and transaction-bound rechecking remain open.
No endpoint, credential grant, production settings or billing gate was enabled.

Focused version/policy tests: 14 passed, 0 failed, 0 skipped. Targeted lint and
complete TypeScript checking passed. Whole suite: 672 passed, 0 failed, 0 skipped.
