# おうちメンテのアイコン

採用案はアイボリー背景と深緑の家、背景色で抜いた四つの先端を持つきらめき。
小さいサイズでも識別できるよう、影・文字・外側の余白・焼き込んだ角丸は使わない。

`assets/brand/icon-design.json` が共通の形・配色の元データ。
アプリ内ロゴと `scripts/render-app-icons.mjs` が同じデータを使う。
再生成は `node scripts/render-app-icons.mjs`。生成済み素材もGitに保存する。

Webはバージョン付きの `/icons/ivory-v1/` を使用。180pxはSafariのホーム画面用、
192pxと512pxはPWA、1024pxはApp Store用の原稿。従来のblack-v4 URLは保持する。
既に追加したiPhoneのホーム画面アイコンはOSに保持される場合がある。
アプリの記録を削除せず、Safariで最新サイトを開いてホーム画面への追加プレビューを確認する。

## iOSに組み込む素材

`ios/OuchiMaintenance/Assets.xcassets/AppIcon.appiconset` に1024×1024の
不透明なsRGB PNGとContents.jsonを用意した。XcodeのターゲットでAppIconを選択する。
角丸はOSのマスクに任せる。iOSプロジェクトが完成した時点でXcodeで検証する。
現時点ではアイコン素材の準備であり、App Storeへの申請やiOSビルドの完了ではない。
Icon Composer用の追加レイヤーや外観はネイティブ版を検証するときに調整する。

公式資料:
- https://developer.apple.com/documentation/xcode/configuring-your-app-icon
- https://developer.apple.com/design/human-interface-guidelines/app-icons
- https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer
