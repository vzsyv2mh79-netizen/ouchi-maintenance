# アカウント削除の公開前必須作業

現状: Web erase_maintenance_dataは所有住まいとメンバーシップ等を消すが、共有auth.usersは残す。アカウント削除としてApple要件を満たしたとは扱わない。iOSで『アカウント削除』と偽ってこのRPCを使わない。

Apple公式: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion
アプリ内から削除開始、アカウントと関連個人情報の削除、請求/サブスク解約の説明が必要。通常アプリでメール問い合わせだけを必須にしてはいけない。

実装前の確認:
1. 共有Supabaseの全アプリのauth.users参照、Storage/Realtime/関数/バッチと同一ユーザー利用の実態を調査する。おうちメンテだけの画面から無説明で共通ログインや他アプリの記録を消さない。
2. 共通ID削除の範囲を明示して本人に確認できる設計、またはアプリ単位の独立アカウントレコードとアクセス失効を導入する。既存Webの認証/RLSも同時に整合させる。後者だけでAppleのアカウント記録削除を満たすかをレビュー基準と照合する。
3. サーバー専用の本人認証/最近の再認証を確認する削除API。secret/service roleをiOSへ入れない。端末からuser_idを指定して削除させない。
4. 削除開始を冪等に記録し、再参加/招待受諾/新規保存を拒否。全端末セッション失効、JWT残存中の書込み拒否、購入利用権と通知購読の無効化を検証する。
5. 所有住まいの共有家族への影響、他所有者の住まいの残存、Storageの所有ファイル、履歴中の個人情報、メール配信情報を対象にする。本人が書き出せる導線を残す。
6. Appleの契約は自動で解約されないため管理画面リンクを表示。契約管理リンクを押さなくても削除を進められる。法律上保持する取引情報と保存期間は確認後に表示する。
7. 合成のテスト用アカウントでのみ、再送/タイムアウト/部分失敗/期限切れ/他ユーザー拒否/共有家族/旧JWT/購入通知遅延を検証する。既存の本人/家族のデータを削除して検証しない。

未実装・未検証。App Store提出前に必ず完了する。運営者/問い合わせ先/規約/公開プライバシーURL/必要な保存期間も本人確認待ちとしてまとめる。今回のPrivacyInformationは開発中の説明であり正式ポリシーの代わりではない。

## 2026-10-10 読み取り専用の実DB調査

対象プロジェクト hphifiqyypwyxkzfanod のpg_constraint/pg_policiesのみを確認。個人レコードは読まず変更もしていない。auth.usersへの参照には、おうちメンテhomes.owner_id/home_members.user_id以外に、家計簿kb_households.owner_idとkb_transactions.created_by（ON DELETE RESTRICT）、kb_household_members.user_idとkb_join_requests.user_id（ON DELETE CASCADE）が存在。家計簿テーブルは専用のメンバー向けRLSを持つ。したがって共通AuthのdeleteUserは家計簿を巻き込む可能性があるか、RESTRICTで失敗する。FK以外のコードや保存領域も未調査なので、これは影響範囲の完全な証明ではない。共通IDを削除するAPIをおうちメンテだけに安易に追加しない。アプリ単位のアカウントライフサイクルと共通ID管理を分ける設計を、既存Web/RLSを含めて実装する必要がある。


## Live function and policy audit (2026-10-10)

Read-only pg_proc/pg_policies inspection confirmed the deployed functions:
- load_household acquires the per-user advisory lock and INSERTs a home whenever
  the caller has no owned home. Erasure followed by load recreates app data.
- erase_maintenance_data removes push subscriptions, memberships and owned homes;
  it neither closes the app identity nor revokes the shared Auth identity.
- create_maintenance_home and restore_maintenance_backup accept any authenticated
  caller. accept_home_invite is SECURITY DEFINER with an auth.uid null check only.
- owns_home/access_home currently contain no app-account lifecycle check.
- Direct homes INSERT/UPDATE/DELETE and own push subscription policies compare
  auth.uid only. Changing access_home alone leaves direct home/push writes open.
- Products and task/history access follows accessible homes/products, so closing
  the lifecycle must cover BOTH owner/member paths and explicit direct policies.
- A query also requested storage bucket metadata, but the connector returned only
  the policy result set. No claim about absence of buckets follows from that call.

No row containing personal records was read and no live mutation was performed.
The actual deployed load_household differs from the oldest migration (multiple
homes with a lock rather than a unique-owner constraint). Build migrations from
current deployed definitions, not the initial SQL file.

### Concrete implementation order

1. Introduce an app-scoped account identity separate from shared Auth credentials;
   bootstrap existing legitimate users once. A closed identity must not be silently
   recreated by load/login. Explicit new enrollment must use a new identity epoch.
   Resolve Apple account-deletion semantics and legal data retention before claiming
   that retaining a shared credential is compliant.
2. In the same migration, gate direct homes/member/push/restore policies and ALL
   RPC entry points, including SECURITY DEFINER invite acceptance. Restrictive
   policies can avoid permissive-policy OR bypass, but require SELECT/INSERT/
   UPDATE/DELETE coverage and checks on destination membership/account state.
3. Serialize closure and mutations on the same identity lock. Restrict privileged
   closure entry points to the server; independently validate current caller and
   recent reauthentication. A client-selected UUID is never authoritative.
4. Make closure idempotent with a durable request, disable app access FIRST, then
   remove app-owned data/notifications/identity. Track retryable cleanup failures.
   Shared Auth must never be deleted while another application's data references it.
   Do not blanket revoke other-app sessions without an explicit common-account scope.
5. Adapt Web/native startup and enrollment so closed state gets an explanation,
   export is available before confirming deletion, and explicit re-enrollment does
   not resurrect the old epoch's records/rights. Existing Apple contract management
   must remain separate from deletion; no cancellation prerequisite.
6. Handle delayed billing events using a privacy-preserving retention design:
   do not restore entitlements for a closed epoch or automatically transfer an old
   appAccountToken to a newly enrolled identity. Retention periods remain undecided.

### Required database integration tests before enabling deletion

Use synthetic users in a local isolated database, never owner/family live data:
- closed caller's old JWT: load/create/restore/join/direct homes/member/push writes
  rejected; reads of former shared homes rejected;
- concurrent create/restore/join vs closure: no post-closure data resurrection;
- open family member and another-app user retain their access and records;
- repeat closure, transport timeout and cleanup failure are safely resumable;
- new enrollment explicitly starts a new epoch with no restored old data;
- delayed purchase notification cannot reopen a closed identity or grant new rights;
- public/anon execution and caller-selected UUID substitution are rejected.

This audit narrows the backend changes required; implementation and these runtime
checks remain unfinished. Do not expose the existing erase RPC as full deletion.


## Isolated access-control prototype

Tests/Fixtures/account-access-prototype.sql is test-only, NOT a deployable
migration and NOT deletion. Tests/account-access-prototype.test.mjs executes
existing repository home/sharing migrations plus restrictive account-enabled
policies in in-memory PGlite. It verified former identity reads/update/create/load
are denied, authenticated self-enabling is denied, another synthetic user remains
usable, and synthetic other-app data/shared Auth identities remain unchanged.
Run from full repository root: node --test ios/Tests/account-access-prototype.test.mjs.

The fixture covers homes/products/members/tasks/history/invites/imports/restore
and client push-subscription policies. Service notification dispatch,
billing/storage gates, concurrent cleanup,
identity epochs, enrollment, credential/PII deletion and API recent-auth checks
are NOT implemented or tested by this prototype. Never deploy it as account
closure or infer Apple compliance from the passing isolated test. The persistent
marker itself needs a justified retention design before actual account erasure.
No production policies or user records were changed.


Invite prototype extension: the privileged accept_home_invite function now takes
its per-user advisory lock and checks account_enabled BEFORE reading/consuming an
invite. PGlite tests verify a disabled identity cannot join or consume the token,
an enabled third user can redeem that same token, and replay remains rejected.
This preserves existing invite validation and single-use behavior. The lock must
also be used by the eventual closure transaction; no concurrent closure test or
complete production lifecycle is claimed. Changes remain test-fixture-only.


The isolated fixture now also uses repository push/restore migrations. Disabled
identity subscription reads/inserts/updates are denied. A valid whole-home backup
restore fails atomically with no inserted home/restore fingerprint, while an
active second identity can restore that same backup. This is actual PGlite RLS/
transaction verification, not an HTTP mock. The background sender uses service
privileges and still requires separate identity gating and leased-delivery race
tests; client policy denial alone does NOT stop server notifications. The fixture
still cannot be deployed as a complete account-deletion migration.


Server-only cleanup prototype: maintenance_private.close_account_access(uuid)
locks the synthetic identity, denies its app access and deletes app subscriptions,
memberships and owned homes in one transaction. Auth users and another app's
records are preserved. Unknown app identities are rejected; repeated cleanup
returns false instead of recreating records. Public/anon/authenticated execution
is revoked; only service_role may call it. The eventual authenticated API must
validate recent reauthentication and derive UUID itself before invoking this
internal function; it is not a client-facing deletion endpoint.

PGlite checks authenticated cross-user invocation denial, explicit transaction
rollback, injected trigger failure AFTER notification deletion (everything rolls
back), successful cleanup, idempotent retry, old identity load rejection and other
user/other-app preservation. All are synthetic and local. No production function
was created or existing record removed. This is still a retained access marker,
not complete account/PII erasure. Epoch/re-enrollment, Auth credential scope,
leased notifications, billing retention and formal user-facing deletion remain
mandatory before enabling any account-deletion feature.


Final dispatch authorization prototype: can_dispatch_push(subscription_id,
delivery_token) is service-only and verifies an enabled app identity, a matching
lease token and a future lease deadline against the current subscription row.
The isolated test verifies a valid lease is authorized, a different token is
rejected, browser-role execution is denied and the same previously valid lease
is unauthorized after transactional cleanup. No real notification was sent.

This check is not yet wired to the Web cron sender or native APNs. It requires a
service-only exposed RPC adapter or a server DB connection before integration.
It prevents authorization of an already-invalid job; it cannot recall a push
already submitted to Apple/browser providers or eliminate the interval between
a DB check and an external network send. For deletion confirmations, document
in-flight delivery semantics and re-check as close to dispatch as possible; do
not promise that no already-submitted notification can arrive after deletion.
