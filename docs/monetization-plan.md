# 課金・応援チップ実装計画（2026-10-10）

基準main: 4b3e44e。未統合PR164は製品カタログ/対応テスト/coverageだけを変更するため、課金変更では触らない。古いPR3/5/7は別途確認し、本作業では統合しない。

## 無料・有料の境界
既存の製品/項目登録、完了履歴、次回予定、家族共有、標準通知、カレンダー/バックアップ書き出し・復元、品番照合、テーマ変更は無料を維持する。既存記録は期限切れ/返金でも削除しない。
有料は新規追加の機能のみ。初期候補は写真/保証書保管、細かな通知設定、住まいのお手入れレポート。未実装の候補は購入特典として表示しない。公開前にサーバー側機能制御と継続価値の検証を完了する。

## 料金・利用権
月300円/年3000円は提案額。App Store Connect日本価格ポイントで選択可能か本人の商品登録時に確認し、StoreKit取得の実価格を表示する。1subscription groupに月/年2商品を置く。チップ100/300/1000円案はConsumable、任意一回払い、繰り返し可、機能特典なし。
初期は契約アカウント単位。ログインしている同じアカウントのWeb/iPhoneが同じ権利を認識する。家族の既存基本共有は無料。世帯単位の有料共有は費用/所有権移転/退会を含む別設計が必要で、Kakeiの案を流用しない。
Web決済は今は追加しない。Apple契約をWebで認識する。将来Stripe等を比較するまでWeb購入リンクは表示しない。

## 保存容量・期限案
写真/保証書は有料アカウント合計100MiB、1ファイル5MiB、JPEG/PNG/PDF、最大100ファイル。新規追加は権利有効時のみ。契約終了後も既存ファイルの閲覧/ダウンロードは維持し、自動削除しない。本人削除・アカウント削除は既存確認フローに従う。自動90日削除などは採用しない。共有先/所有者/RLS/容量の同時更新を検証してから販売する。100MiB×100人=約9.8GiBで、共有Free1GBを超えるため無料枠だけで100人を保証しない。

## 技術構成・販売停止
Next.jsの専用APIとDBは署名検証後の取引のみ受理。Apple公式App Store Server LibraryでJWS証明書チェーン、bundle ID、environment、appAppleId、appAccountToken、product allowlistを検証。クライアントlocalStorage/メタデータで権利を付与しない。
原取引IDは1アカウントに固定、transaction ID/notification UUIDで重複防止、signedDate順で返金・取消を含む古い通知再送の巻き戻り防止。期限は要求ごとに評価。sandboxとproductionをDB/設定で分離。購入/復元通知を保存後にStoreKit finishする。通信失敗は未完了取引を再送、pending/cancelは権利なし。復元は同じaccountToken以外を自動移管しない。
実請求・本番DB変更・有料契約を有効にしない。購入UIはストア商品がなく、実装済み有料機能がない間は販売不可を明示。サンプル価格を実価格のように表示しない。テスト画面は合成データ、テストStoreKitのみ。
iPhone版はSwiftUI + StoreKit2 + アカウント認証。既存Webを使う場合も単純なサイト表示だけで提出せず、ネイティブ購入/復元、ファイル/写真、通知/共有の端末体験とReview4.2を検証。Xcode本体は現Mac未設定。ソースは用意し、iOSSDKビルド・StoreKit実機検証は本人のXcode/App Store Connect設定後に実施。

## 検証・本人操作
単体/DBで偽署名、他account、重複、更新、失効、返金、取消、順不同通知、同時処理、通信失敗を検証。Web画面で無料範囲/未販売表示/任意チップと既存導線を確認。Previewのみ公開し本番は別段階。
本人操作はApple Developer登録状況確認、年会費支払い/契約、銀行/税務、有料アプリ契約、bundle/app作成、subscription groupと商品登録、価格選択、sandbox tester、署名Team/APIキー設定。画面を開いて1つずつ案内する。秘密鍵/OTP/銀行情報をチャットへ貼らせない。

## 根拠と費用の未確認項目
https://developer.apple.com/jp/app-store/review/guidelines/ （3.1.1/3.1.2/4.2）
https://developer.apple.com/in-app-purchase/
https://github.com/apple/app-store-server-library-node （公式署名検証ライブラリ）
https://supabase.com/docs/guides/storage/pricing （Free1GB、Pro100GB、超過$0.0213/GB月。転送費別）
現請求額/プラン/共有枠残量は管理画面で確認が必要。既存Vercel/Supabase/Resendの請求書を確認するまで実費を断定しない。300円税/手数料控除前、15%適用仮定255円/30%仮定210円。Apple Developer年会費を含む固定費の損益は実請求額確定後。チップは固定収入へ織り込まない。

## このPRの実装範囲と残り
Sandbox専用検証API/取引台帳の隔離SQL fixture/権利判定/設定案内・プランページ/StoreKit2アダプターを実装。SQLは実DBに未適用、BILLING_MODE未設定時は受付503・利用権free。Production取引は常に拒否する。fixtureは移行ファイルではなく、販売開始時にSupabase CLIで正式migrationを生成・レビューする。
Swiftはソース準備段階でiOSSDKビルド未確認。実商品価格表示の購入画面、アプリプロジェクト/署名/認証接続、StoreKit更新監視、通知の自動更新状態/grace period表示、正式Terms/Privacy、写真/通知詳細/レポートの機能実装、実Sandbox購入・復元・返金は残作業。購入画面がないのでこのPRはApp Store提出可能という意味ではない。未実装特典は販売できない。権利判定は有効期限とrevocationDateに基づく。grace periodは初期無効を前提とし、提供時にはrenewalInfo検証が必要。
