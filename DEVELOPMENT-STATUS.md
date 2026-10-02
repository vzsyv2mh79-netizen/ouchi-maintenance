# 残作業・検証台帳

## 最新の保存先・通知権限監査（2026-10-02）

Supabaseを再確認すると、ikukyu-plannerはINACTIVE、汎用hphifiqyypwyxkzfanodと住宅営業cyqmrlminuqwnfgbnqbpはACTIVE_HEALTHY。以前の稼働状況から変わっている。こちらでは停止/再開操作をしていない。汎用プロジェクトはAuthユーザー0人、public.feedback_requestsの実件数2件。推定行数0は空の証明ではなく、既存記録を保持する。おうちメンテの4テーブルは存在しない。共有利用の具体案をユーザーに提示して保存先の回答待ち。実DB変更と契約変更は未実施。

通知購読のINSERT権限をendpoint/p256dh/auth列だけに制限。配送日・送信占有・占有tokenは新規登録時にもブラウザが指定できない。通常の本人購読/upsertと配送処理は通り、3種の配送メタ情報を含むINSERTは拒否されることをPostgresで確認。22件テスト/lint/typecheck/build成功。

## Web Push実装の追加証跡（2026-10-02）

Chrome経路修正commit14ab1f4のGitHub Actions run36949144011はcompleted/success。最新Vercel Preview dpl_ERJGDvybUbgUmv8mcx893XkXFUrfはREADY: https://ouchi-maintenance-84glolsd3-gfgz4m9pkm-8942.vercel.app/ 。本番は変更していない。

通知基盤commit2bb050dのGitHub Actions run36948782614はcompleted/success。Vercel Preview dpl_FrJTGW7mqfGs9tGwjntqjb5cBkc1はREADYで、公開設定画面の通知案内も確認した。証跡 /private/tmp/ouchi-preview-push-settings-mobile.png。Chrome公式ソースで現在のFCM `/wp/`経路を確認し、従来の `/fcm/send/`と双方を許可する修正を追加。新経路を使ったPostgres購読/配送検査を含め22件のテスト/typecheck/lint/buildが再成功。根拠: https://chromium.googlesource.com/chromium/src/+/refs/tags/141.0.7390.94/components/push_messaging/push_messaging_constants.cc 。実通知が届くことの証明ではない。

本人が操作する端末ごとの通知購読/停止UI、RLS付き本人限定購読、最大10端末、毎朝09:00 JSTのVercel Cronを追加。サーバー専用VAPID/サービスキー/CRON_SECRETを使用する構成だが、鍵の生成・設定は未実施。通知は所有/参加住まいの期限済み件数のみで、製品名・住まい名を含めない。既知ブラウザPushホストのHTTPSだけへ送信。一時的な送信占有と同日送信記録、失敗を成功扱いしない処理、404/410購読整理、クラウド記録削除時の購読削除を実装。

22件テスト/typecheck/lint/build成功。Postgresで本人/他人/匿名のアクセス、配送メタ情報のブラウザ書換禁止、共有解除、重複/失敗/古い占有tokenを検査。Service Workerの通知クリックは外部URLを無視してアプリへ開く。ローカル本番APIで未認証/誤認証401、正しい合成Cron認証でも未設定503、公開鍵設定なしnullを確認。390px画面で案内表示と横はみ出しなしを確認。証跡: /private/tmp/ouchi-push-settings-mobile.png。

実Supabase適用、秘密鍵生成/設定、通知許可、実機配信/停止、定期送信は未了。新たな有料サービス契約と本番設定変更は未実施。「未実装」の過去記録は通知基盤に限り更新するが、通知機能全体の完成とは扱わない。

## 2026-10-02 最新監査（以下の過去記録より優先）

- GitHubで未マージPR #3と#4を確認。#3の検査変更は#4に取り込み済み。mainの本番は2351151のまま。
- PR #4最新公開commit a9eb265のGitHub Actions run36945478730はcompleted/success。Vercel Preview dpl_3vswLjAe7ARnpWNfsdQGUTgUAmuvはREADY。以前の公開パッケージ失敗は修正済み。
- ローカル最新検査はlint/typecheck/build成功、テスト18件成功。全機能の実環境検証完了を意味しない。
- 最優先の残作業はクラウド保存先・費用方針の確定。その後、migration/RLS/Auth/環境変数を適用し、保存・再ログイン・別ユーザー拒否・家族共有・移行を実環境で確認する。既存Supabaseを停止・削除せず、課金変更は未実施。
- 実装済みで検証が残るもの: 個別削除、バックアップの実ファイル保存と復元確定、クラウド移行、再設定メール、クラウド記録削除、家族招待/解除/退出、複数住まい、ICS実取り込み、スマホ実機PWA/本番オフライン。
- 未実装または部分実装: 他メーカーへの対応拡充、説明書PDF URLの自動発見、閉じたアプリへのPush通知、Authアカウント自体の退会。公式PDF抽出はSHARP空気清浄機限定で利用者がURLを入力する方式。
- 公開に残るもの: PR #4最終レビュー、PR #3の重複整理、main取り込み、本番反映後の操作確認。紹介ページもPreviewまでで本番未反映。
- 動画制作/Higgsfieldは今回必須に含めない。バックアップのクラウドへの全体復元は端末移行と別の仕様として必要性を決める。
- 作業ツリーのnext-env.d.tsはビルドによる生成変更であり、機能変更として公開しない。

目標: 2026-10-02の残作業一覧をすべて完成・検証する。部分実装を完了として扱わない。

## 最新基準
- main: 2351151b19a740e1a9cc395a7300b0f92b7d4f69
- PR #2: merged
- PR #3: draft/open、回帰検査の自動化。別作業で作成済み。重複実装を避ける。
- 本番: https://ouchi-maintenance.vercel.app/
- 現作業: feat/complete-maintenance

## 作業状況
- [ ] クラウド接続先の確定（費用最小化、別チャットとの決定を要確認。課金変更未承認）
- [ ] Supabase適用・Auth・Vercel環境変数・本番接続
- [ ] 実環境RLS/保存/再ログイン/別端末確認
- [ ] 製品・項目の編集／個別削除: コード実装済み、型検査/lint/build成功、ブラウザで製品名・周期編集と製品名の再読み込み保持を確認。実DB/削除UIは未了
- [ ] バックアップ／復元: コード実装済み、往復/不正日付/不正関連/重複ID/周期/公式根拠必須のテスト成功、画面検証未了
- [ ] 端末からクラウドへの移行: 確認UI、UUID関連の変換、一括RPC、再送重複防止を実装。Postgresで原子性・既存保持・匿名/他ユーザー拒否を確認。実クラウドUI検証待ち。
- [ ] 品番対応の拡充
- [ ] 公式Web検索・説明書抽出・候補照合・根拠付き提案（AI推測と公式情報を混同しない）
- [ ] パスワード再設定: 再設定メール送信UI・専用変更画面を実装。実メール検証待ち。アカウント削除は未実装
- [ ] 通知／リマインダー: カレンダーICS出力・周期・前日通知を実装。自動Push・カレンダー実取り込みは未了。
- [ ] PWAアイコン・オフライン・インストール・実機検証: 192/512px PNG・manifest・案内を実装。API/auth非保存テスト成功。ローカル本番サーバー停止後の起動・完了保存・再読み込み保持をブラウザで確認。モバイル実機・本番インストールは未了。
- [ ] 家族共有・複数住まい
- [ ] 紹介ページ（Higgsfield必須でない、動画制作は別途範囲を確認）
- [ ] PR #3検証・取り込み
- [ ] 最終lint/typecheck/test/build
- [ ] スマホ・Vercel Preview・Productionを検証

## 最新検査
2026-10-02: pnpm typecheck/lint/test/build成功。テスト5件（バックアップ2件、日付、品番、Postgres/RLS）。クラウド実接続、編集・削除のUI操作、端末実機、通知の証明ではない。

## 注意
既存Supabaseは育休・住宅営業ともデータがあり、停止・削除しない。契約変更は具体的料金を示してユーザー確認する。新PRの本番mergeはPR #2の承認を流用しない。

2026-10-02追加: ローカルブラウザで製品名と周期編集成功。証跡 /private/tmp/ouchi-edit-verification.png。開発サーバー 127.0.0.1:3010 session 60149。

2026-10-02追加: オフライン回帰2件を含むテスト7件成功。アイコンとPWAはビルド成功。証跡 /private/tmp/ouchi-offline-verification.png。検証サーバー3011は停止済み。

2026-10-02追加: CLI 2.119.0でatomic_importの新規migrationファイルを作成。既存migrationは変更なし。費用検討チャットの決定は未確認。

2026-10-02 最新の残作業監査: 家族共有・複数住まいを実装中（未コミット・未公開）。最新の型検査とlintは成功。テストは12件中11件成功、1件失敗。招待参加後に共有製品を取得できない。既存productsの所有者限定ポリシーを共有権限に合わせて更新する必要がある。修正後に項目・履歴・完了処理も含め再検査する。最終buildは共有実装後に未実施。現時点では全項目完了ではない。

2026-10-02 修正: 製品RLSを所有者・参加家族の双方に対応。共有テストの失敗を解消し、12件すべて成功。型検査・lint・build成功。住まいの追加/編集/削除/選択、7日間・単回利用招待、参加/解除/退出を実装。複数住まいの端末移行は移行元を選択可能。実クラウドとスマホ画面は未検証。

2026-10-02 品番検索: KI-RX100を追加。公式説明書29・30ページを確認し、本体/後ろパネル、センサー、加湿フィルター/トレーの3項目を根拠ページ付きで提案。未対応品番は5メーカーの公式ドメイン検索へ案内。外部検索結果の自動取得・説明書抽出・候補照合はまだ未実装であり、検索導線をその完了とは扱わない。

2026-10-02 紹介ページ: /aboutを実装。使い始め方、保存方式、対応品番と通知の制限を案内。390px幅のブラウザで表示とアプリ導線を確認。住まいを追加し、切り替えで製品0件に分離され、再読み込み後も追加住まいが残ることを確認。本番公開は未了。証跡 /private/tmp/ouchi-introduction-mobile.png。

2026-10-02 データ削除: このアプリの所有住まい・製品・項目・履歴を一括削除し、参加共有から退出するRPCと二段階確認UIを追加。共有先の他ユーザーの住まいと共通Authアカウントは保持。ログインアカウント自体の退会は、専用/共有DB方針未確定のため未了。実データの削除は実行していない。

2026-10-02 レビュー公開: PR #4 draft https://github.com/vzsyv2mh79-netizen/ouchi-maintenance/pull/4。GitHubコネクタでcommit 4d909ccaf480f03a12276e74480de9394d4983a7を作成、tree 8774ce8c861e4384be85e26ad83aa6c9d2c0611eはローカルHEADと一致。PR #3の自動検査変更を取り込み済み。本番mainは2351151のまま。Vercel Preview dpl_2xUPhLLa6Nuj16LLmuVm3wowU9MJ READY。公開Previewの/about表示とアプリへの導線、現在日付の表示をブラウザで確認。証跡 /private/tmp/ouchi-preview-about.png。

2026-10-02 Preview追加検証: GitHub Actions Regression checks run 36943361171（commit4d909cc）completed/success。Previewで不正バックアップ拒否、正しい合成バックアップの件数表示（製品1・項目0・履歴0）、キャンセル後も元の製品5件保持を確認。復元確定は実行せず、上書き動作の画面検証は未了。バックアップ書き出しのdownloadイベント取得はタイムアウトし、保存完了は未証明。ブラウザのerror/warnログは空。証跡 /private/tmp/ouchi-backup-preview-check.png。

2026-10-02 自動品番取得: 固定のSHARP公式説明書一覧データをサーバー側取得し、品番完全一致の空気清浄機候補を返すAPIを実装。JSを実行せずJSONレコードのみ解析、タイムアウト/容量制限/固定取得先で制限。周期未確認候補は提案なしと明示。既存確認済み品番はオフライン照合を維持。実APIでKI-RX70候補あり/KI-RX7候補なしを確認。テスト14件、lint/typecheck/build成功。説明書本文の自動取得/解析、他メーカー、Preview反映は未了。

2026-10-02 説明書解析基盤: pdfjs-dist6.3.289でSHARP空気清浄機の公式PDFから文字/ページを取得。公式URL許可リスト、redirect拒否、10MB/100ページ制限、表紙2ページの品番完全一致、異なる列と異なる周期の拒否を実装。日本語CMap169ファイルとworker1ファイルが本番出力に含まれることを確認。実APIでKI-RX100説明書から本体/後ろパネル（29ページ）・加湿フィルター/トレー（30ページ）の2項目を自動抽出、KI-RX70で同じPDFは拒否。利用者が公式PDF URLを入力して根拠を確認するUIを追加。テスト18件/lint/typecheck/build成功。PDF自動発見の全自動化、他メーカー、画面操作とVercel実行確認は未了。

2026-10-02 Preview解析公開: commit0935df7のGitHub Actions run36945161430は成功。ただしVercel dpl_FhyGHp98jdpLKkx9ZSfEDuRN8CasはERROR。画面ログでビルド完了後の公開パッケージがsymlinked directoriesにより無効と確認。必要なCMap/workerをビルド時に実体コピーする修正を追加し、ローカルbuild/APIの2項目抽出は成功。commit a9eb2650bfce5a2e72d36b9cbaa09d9fbda24208で再Preview、dpl_3vswLjAe7ARnpWNfsdQGUTgUAmuvの進行を追跡。実公開成功はまだ未証明。

2026-10-02 公開Previewの説明書登録を検証: KI-RX100公式PDFから2候補を取得し、本体・後ろパネルのみ選択して合成製品「公式PDF検証用 空気清浄機」を端末保存で登録。再読み込み後も1項目・30日後（11月1日）の予定・根拠29ページへのリンクが保持されることを確認。証跡 /private/tmp/ouchi-preview-manual-registered.png。実クラウド保存の検証とは区別する。照合方法を説明するUI文言も修正。

2026-10-02 ビルド後の再lint修正: コピーされた第三者PDF workerをESLint対象から除外。lint/typecheck/test18件/build/ビルド後lintの順で全成功。クリーンなCIだけでなく、生成物が残る開発環境でも検査成功。

2026-10-02 バックアップ容量修正: 書き出し/読み込みを共通10MB（UTF-8実バイト数）に統一。日本語の長文が文字数上限内でもファイル容量上限を超える場合、復元不能なファイルの出力を拒否。容量未満の日本語データは往復保持。ダウンロード用リンクはDOMに追加後クリックして除去する。lint/typecheck/19件テスト/build成功。Previewの保存ボタン操作では8秒内にdownloadイベントが得られず、実ファイル保存と復元確定は未証明。最新公開前commit d7a8e43のGitHub Actions run36946348801は成功。

2026-10-02 復元確定UIを検証: 最新Preview ba9135b（dpl_3TBpvoJqEpkFJMuw8nkdbJAesWbW READY）で、既存デモ5製品/9項目/3履歴をすべて含む合成バックアップに検証用1製品/1項目/1履歴を追加して読み込み。6/10/4の件数表示→確認→復元成功。再読み込み後の製品/3週間周期/最終実施日10月2日/次回10月23日、追加履歴と元の3履歴の保持を画面で確認。証跡 /private/tmp/ouchi-preview-backup-restored.png。元データの削除を伴う置換とクラウド復元は検証していない。別品番KI-RX70にKI-RX100公式PDFを指定した拒否と、公式一覧由来KI-RX70候補に周期未確認/提案なし表示も公開画面で確認。証跡 /private/tmp/ouchi-preview-model-rejection.png。修正版でもdownloadイベントはタイムアウトし、実ファイル書き出しの保存完了は未証明。
