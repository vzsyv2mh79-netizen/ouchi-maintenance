# お手入れレポート — 開発用の実装

`lib/maintenance-report.ts` は選択した住まいの過去6か月の完了件数、製品ごとの当月完了件数、現在の期限超過/当日期限件数を集計する。日本時間の日付・月境界を使用し、未来の完了記録を当日の実績に数えない。集計は登録済みの記録を示し、故障予測や安全性判定は行わない。

`GET /api/development/maintenance-report?homeId=UUID` は開発/Sandboxのサーバー側利用権に基づくテスト用API。BILLING_MODE=sandboxと既存の検証構成、明示的OUCHI_REPORT_TEST_MODE=trueが必要。Vercel Productionは常に拒否し、初期状態では無効。チップ、期限切れ、返金、別アカウント、Production取引では取得不可。取引情報は既存の署名検証済みサーバー保存から取得し、クライアントの課金フラグは使わない。

住まいの取得はpublishable keyと本人JWTで既存RLSを通す。利用権を調べるservice権限で住まいの記録を読まない。返却はno-store。負荷制御、正式Production課金/権利失効/アカウント削除の統合、iPhone/Web画面、実DB・実購入テストは未完成。このAPIだけをもって販売可能な特典と扱わない。

検証: 合成データで6か月/年境界/東京深夜/未来記録/住まい分離を確認。実routeをスタブ通信で実行し、Production拒否、無料/失効/返金/チップ/他アカウント拒否、JWTを使うRLSクライアント、アクセス不可住まい404を確認。実DBへの接続・請求・本番設定変更なし。

確認用画面: `/development/report-preview`。サンプルと例示日付を明記し、実際の記録・販売画面とは扱わない。開発/Previewでだけ表示、本番用ローカルビルドのHTTP404を確認済み。スマホ390×844で集計グラフ・件数の表示確認、lint/typecheck/build成功。API初期無効503も本番用ローカルビルドで確認。製品別集計はMapを使用して各記録を一度ずつ処理し、記録数増加時の繰り返し走査を避ける。認証済み実DBと実購入の確認は未実施。

iPhone: ReportAPIで本人JWTを固定ホストの開発APIへ送る通信と、DEBUG/Sandbox構成のみの設定画面導線を追加。HTTPリダイレクトは追従せず、住まいID、日付、件数、返却環境と初期販売無効を検証する。サーバー利用権確認後だけ取得し、アカウント世代/住まい変更/記録再読込後の古い応答を表示しない。ReportSmokeの合成通信検証と15種の共通Smoke、iOS Simulatorビルドは成功。

ネイティブ開発画面の通信先は、Vercelのプロジェクト/ブランチ/コミット情報で確認した固定Preview（ouchi-maintenance-n2u08a2mo-gfgz4m9pkm-8942.vercel.app、298a8d9b69ae882427a54989ba0b03841059dd8c、READY）に限定。任意ホストを設定する機能はなく、認証情報を別ホストへ転送するHTTPリダイレクトは拒否。API初期無効、Sandbox商品/利用権とテスト用DB構成が未設定のため実取得は未検証。テスト環境の準備と実接続、実描画を確認するまで完成とは扱わない。通常Releaseの販売特典として表示しない。

## 追加の検証結果と現在の制限

0b070ca4以降の統合テストでは、実際のAuth・PostgREST・RLSを通してこのレポートrouteを実行した。サーバーに保存した人工の正式取引台帳を使用し、有料利用権で200、未知の住まいで404、取消後に403となることを確認した（workflow38106183650/job114372097654）。13e181a4でも同じ実サービス検証が成功した（workflow38107808052/job114376920083）。これはApple署名済みの購入を実行した証拠ではない。

サーバーは30秒の全体期限と10秒の個別通信期限を組み合わせ、返却直前に現在のアカウント・正式または旧Sandbox台帳の利用権を再確認する。iPhone側も中断された応答を表示しない。共有表示部品を使うDEBUG限定のレポートサンプルをSimulatorで表示確認し、Releaseバイナリからサンプル画面と専用起動引数が除外されることを確認済み。

最新Previewの配信成功はAPIの利用可能性を証明しない。fd14bfe7のPreviewはREADYだったが、既存Vercel認証を使ったAPI確認では503だった。iPhoneの固定Previewへの実データ取得、本番用の環境構成、Appleの実購入、署名付き配布および実機での表示確認は引き続き未完了。冒頭の旧検証記述をこれらの追加結果で補足するが、販売可能な特典とはまだ扱わない。


## Read-only ledger configuration update (b6922c4)

The development report now supports a separate read-only Sandbox configuration:
`OUCHI_REPORT_TEST_MODE=true`, `BILLING_MODE=sandbox`,
`BILLING_ACCOUNT_BINDING_MODE=epoch`, `BILLING_STORAGE_MODE=verified-ledger`,
and the server database/publishable settings. No Apple bundle ID/root certificates
are required for this *existing verified ledger read*. Purchase proof acceptance
still uses the unchanged Apple verifier configuration. Never create paid rights
in a shared project to demonstrate the screen.

Auth verifies the exact bearer, current session/epoch is required, and household
reads use the caller JWT/RLS. Authoritative paid rights and current identity are
rechecked before returning the report. Free/expired/revoked accounts remain
refused. Production remains disabled. Existing explicitly configured legacy
Sandbox test behavior remains available; it does not bypass epoch checks.

Four route/calculation tests, typecheck and lint passed locally. The actual
Auth/PostgREST test removes Apple bundle/root settings before checking paid200,
unknown-home404 and revoked403; all four b6922c4 CI workflows succeeded (native38109502207, Auth38109502267, migration38109502265, regression38109502194). Actual integration job114381932425 ran one Storage lifecycle test with zero skips.
These synthetic ledger transactions are not Apple-signed purchases. Preview
configuration has not been changed and its last observed API response was503.
