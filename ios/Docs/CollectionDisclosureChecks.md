# 配布ファイルのデータ収集説明チェック

`ios/scripts/verify-store-artifact.py` は実際の `.app` の Info.plist と
PrivacyInfo.xcprivacy を読み取り、機能設定と説明の最低限の整合を検査する。
アップロード、機能の有効化、App Store Connectへの申告は行わない。

- 基本のクラウド利用はメール、名前・ニックネーム、アカウントID、その他のユーザーコンテンツの説明を必要とする。
- 写真添付には写真・動画、購入には購入履歴、端末への通知・App Attestには端末IDの説明を必要とする。
- 購入復元の端末登録を伴う経路には購入履歴と端末IDが必要。
- 今のアカウント連携では本人との関連とアプリ機能目的を明記する。
- 未解決の文字列フラグ、重複項目、型不正、トラッキングなしの方針と矛盾する説明を拒否する。

これは必要条件のチェックであり、全データ分類・用途の自動判定ではない。
特に検索・アクセスログ、サポート、サービス提供者のログ・保存期間・追跡利用は、
実際の運用と最終ビルドに照らした確認が必要。検査成功を、App Storeの回答・規約承認・
写真保存や課金の運用開始許可として扱わない。

Apple公式資料（2026-10-16確認）：

- https://developer.apple.com/app-store/app-privacy-details/
- https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests

検証：`node --test ios/Tests/store-artifact.test.mjs`。
