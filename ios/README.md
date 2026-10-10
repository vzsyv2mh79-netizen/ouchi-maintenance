# iPhone版の実装と検証

OuchiCore は既存の load_household / complete_maintenance RPC と同じクラウド記録を扱う。
ユーザーJWTをAuthorization、publishable keyをapikeyに設定する。
secret/service role key、平文HTTP、他ホスト、URL内の認証情報を拒否する。
完了の通信エラーで自動再送せず、再読み込みして履歴を確認する。

検証: `cd ios && swift test`。合成データと注入した通信処理のみを使い、実DBへアクセスしない。
Xcode本体の導入後、iOS SDKビルドと端末テストを行う。
Packageは共通ライブラリ。OuchiMaintenance.xcodeprojにはSwiftUIアプリターゲットを追加した。
ログイン、お手入れ完了、住まい切替、製品/履歴の閲覧、製品/項目追加編集、無料の書き出し、ログアウトを実装。
未完成の機能があり、まだ提出可能なアプリではない。

Xcodeで開く: `ios/OuchiMaintenance.xcodeproj`。
Config/Local.example.xcconfigをLocal.xcconfigにコピーし、publishable keyとTeamを設定。
Bundle IDは仮のjp.ouchi.maintenance。本人のApp Store Connect登録に合わせて確定する。
秘密鍵やログイン用パスワードはビルド設定に入れない。
Keychainは端末ロック中に読み取り不可、他端末へ移行しない設定。
ユーザーセッションの更新はactorで単一化し、ログアウト後の古い応答を保存しない。
アプリの記録をログアウト時に画面から消し、生成した一時書き出しファイルも破棄する。
書き出しはWeb共通のapp/version/exportedAt/data形式（version 1、10MB以内）。復元は既存RPCで新しい住まいとして追加し、既存記録と家族権限を置き換えない。

次の実装:
- iOS SDKでSwiftUI/StoreKitとXcodeターゲットをビルド、シミュレータ/実機で画面検証。
- 家族共有とバックアップ復元の実機/実DB確認。
- アカウント作成/再設定の実機確認、アカウント削除、正式プライバシーポリシー、利用規約、サポート窓口。
- 写真/保証書保存と容量制御、通知詳細、レポートの実装・サーバー側権限制御。
- 購入画面、検証済み利用権の取得、ストア実価格、二重契約防止、保留/復元/返金の実機検証。
- 組み込み済みのAppIconをiOS端末で検証。

PurchaseManagerの更新監視は認証後に開始し、ログアウト/切替前に停止する。
persistはそのアカウントに固定した認証処理を注入する。
Sandbox以外は受け入れない。検証済み取引をサーバー保存後にfinishする。
失敗した取引は未完了のまま残し、再接続時observeUnfinishedで処理する。

現在のMacはXcode未導入でSwiftPMとデフォルトSDKにもバージョン不整合がある。
構文チェックと、互換SDKによる共通ライブラリの検証を分けて記録する。
SwiftUI/StoreKitのiOSビルドを成功したとは扱わない。

2026-10-10検証: MacOSX15.4 SDKを明示しSwift 6でOuchiCoreの型検査/ライブラリ生成、
CoreSmokeをビルドして実行。設定拒否・ユーザーJWT・住まい分離・全記録の書き出し・
完了RPC・401拒否・ログイン契約が成功した。通信はすべて合成応答。
PurchaseManagerは構文チェックのみ成功。StoreKitの型検査/実機検証は未実施。
SwiftPMのXCTest実行はローカルツールの不整合で未実施。

本人操作は公開前の依存段階でまとめる。Apple有料登録/契約/銀行税務/商品価格/署名。
商品登録と購入画面の実機検証が終わるまで販売を有効化しない。

2026-10-10追記: 製品/項目の追加編集フォームと既存RPC/REST保存を追加。ユーザーJWTと既存RLSを使用。更新0件を拒否し、任意項目の空欄をnullとして保存。元の製品/住まいを変更できない保存前確認を実装。内容を編集したお手入れはユーザー設定とし、元のリンク/注記は保持。MutationSmokeで作成/更新/空欄/0件拒否/日付検証成功。iOS SDKによるフォーム型検査/描画/実DB検証は未実施。

家族共有: 既存create_home_invite/accept_home_inviteを使用する招待・参加画面、家族一覧、未使用の招待取消、所有者の共有解除、本人退出を追加。解除は住まい/対象ユーザー両方で絞り0件を拒否。7日/1回限りは既存サーバーで強制される仕様。画面退出と住まい変更時にコードを隠し、遅い応答の再表示を防止。FamilySmokeの通信契約/不正コード/0件拒否/取消対象の検証成功。RLSと期限/使用済みの実サーバー検証は未実施。

バックアップ: WebのvalidateDataと同じフィールド順/任意項目省略でSHA256を作り、同じバックアップの重複復元をサーバーで拒否。復元時に旧ローカルIDをUUIDに置換し関連付けを保持。10MB/各10000件/重複ID/参照/日付/情報源URLを検証。ファイル選択後に件数と追加方式の確認を表示。BackupSmokeはFixturesを使いWebとの正規化/ハッシュ一致・往復・UUID関連・上限・重複拒否を検証。実際のWeb lib/backup.tsで作成→Swift読み込み→Web再読み込みを確認成功。ファイル選択画面/復元RPC実DBは未検証。

アカウント: native signup/recoverを追加。確認待ちではログイン済みにしない。即時セッションがある構成ではSessionControllerがKeychainへ保存し、アカウント世代を確認。再設定メールは既存Web /reset-passwordで変更後にネイティブログイン。メール送信は本人のボタン操作でのみ行う。AuthSmokeは合成応答でsignup/確認待ち/入力拒否/recover先/429拒否PASS。実メール送信と即時セッション構成の実機テストは未検証。プライバシー説明画面は開発中で正式ポリシーではない。共有Authを残す既存の記録削除をアカウント削除とは扱わず、Docs/AccountDeletion.mdに実装前提と必要検証を記録。
