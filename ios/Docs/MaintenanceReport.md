# お手入れレポート — 開発用の実装

`lib/maintenance-report.ts` は選択した住まいの過去6か月の完了件数、製品ごとの当月完了件数、現在の期限超過/当日期限件数を集計する。日本時間の日付・月境界を使用し、未来の完了記録を当日の実績に数えない。集計は登録済みの記録を示し、故障予測や安全性判定は行わない。

`GET /api/development/maintenance-report?homeId=UUID` は開発/Sandboxのサーバー側利用権に基づくテスト用API。BILLING_MODE=sandboxと既存の検証構成、明示的OUCHI_REPORT_TEST_MODE=trueが必要。Vercel Productionは常に拒否し、初期状態では無効。チップ、期限切れ、返金、別アカウント、Production取引では取得不可。取引情報は既存の署名検証済みサーバー保存から取得し、クライアントの課金フラグは使わない。

住まいの取得はpublishable keyと本人JWTで既存RLSを通す。利用権を調べるservice権限で住まいの記録を読まない。返却はno-store。負荷制御、正式Production課金/権利失効/アカウント削除の統合、iPhone/Web画面、実DB・実購入テストは未完成。このAPIだけをもって販売可能な特典と扱わない。

検証: 合成データで6か月/年境界/東京深夜/未来記録/住まい分離を確認。実routeをスタブ通信で実行し、Production拒否、無料/失効/返金/チップ/他アカウント拒否、JWTを使うRLSクライアント、アクセス不可住まい404を確認。実DBへの接続・請求・本番設定変更なし。
