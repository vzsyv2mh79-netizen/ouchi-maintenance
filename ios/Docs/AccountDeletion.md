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
