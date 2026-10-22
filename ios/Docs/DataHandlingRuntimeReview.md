# Runtime data handling review — 2026-10-23

This supplements the historical provider/source inventories. It does not activate a retention policy or constitute final App Store declarations.

## Fresh evidence

- The shared Supabase organization `elskxivtkplwvpmjicwz` is currently Free; project `hphifiqyypwyxkzfanod` is the Ouchi target. Its app attachment budget is disabled, zero bytes, with writer coverage false. Zero Storage metadata rows in this project do not establish physical erasure, organization-wide usage or future promised capacity.
- Vercel's authenticated project-scoped drains lookup returned an empty list for `prj_m8OG4LeUWHzRGHbpqDwEakLCp94a`. This excludes configured external drains returned by that API, not Vercel's platform/access/security records. The team/project responses did not establish a log retention plan, so the earlier plan-dependent examples cannot be adopted as the actual retention period.
- The manual-suggestions handler previously logged an arbitrary upstream/parser error message. It now emits only a fixed event label. Actual handler tests inject ordinary, timeout, abort and non-Error failures carrying synthetic private text and a token-bearing URL; none reaches the console arguments or client response. Existing 422/504 responses remain. This change does not erase historical/provider logs or prove that no request metadata is collected.
- Apple paid agreement, banking and tax status are active; all five intended Japanese prices are saved. These setup facts do not establish actual purchase or a delivered premium benefit. A Japan Sandbox test account already exists.

## Retirement requirements to implement and verify

Apple requires in-app initiation and actual removal of associated personal data; temporary disabling alone is insufficient. A manual process may take a reasonable disclosed time and must confirm completion. The approved operator review can handle legacy authorship without requiring the customer to call, email, contact support or obtain family approval. Shared user-generated content must be assessed as the departing person's content rather than automatically preserved as family property.

Ouchi-only account closure and shared Auth deletion are different scopes. The former must still remove Ouchi personal fields, uploaded content, account-linked metadata and access, with verified family/other-app preservation and finite operational evidence retention. Preserving the shared login is not evidence that Ouchi personal information has been erased. Deleting shared Auth must not silently affect another app, and cannot substitute for removing app content. Existing disabled/locally tested candidates do not establish either deployed outcome.

Subscription cancellation is separate from account deletion. The app must explain Apple's continuing billing and expose subscription management without making the user wait for expiry to request immediate deletion. Verified transaction expiry/refund and independently justified retained evidence need actual policy and execution proof.

## Still required before publication

1. Adopt and implement an achievable operator review/erasure deadline, including monitoring and failure escalation. The old proposed thirty-day target remains unverified and must not be presented as an established SLA.
2. Inventory actual backups/exports/logs/provider copies and their expiry. A database backup's Storage metadata is not a file backup; neither metadata absence nor an HTTP missing-object response establishes physical provider purge.
3. Verify the scheduled purge and restore replay behavior for Ouchi-scoped personal evidence without deleting family/other-app data. Service exit requires a notice/export period and a tested cleanup process, not only text in a policy.
4. Reconcile the final enabled native build, privacy manifest, public policy and App Store categories. Photo/PDF content, purchase history, account/device identifiers, searches/operational metadata and support handling cannot be declared absent just because current preparation flags are off.

Official references checked: [Apple account deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion), [Supabase API key privilege model](https://supabase.com/docs/guides/getting-started/api-keys), and [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection). Supabase server secret keys bypass RLS; a separately named key is not a per-app permission boundary. No such key is provisioned or copied by this review.
