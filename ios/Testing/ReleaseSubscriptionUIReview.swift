import SwiftUI
import StoreKit
import OuchiCore

struct ReleaseSubscriptionPurchaseSection: View {
    @EnvironmentObject private var store: NativeStore
    @ObservedObject var purchases: PurchaseManager
    let disclosure: SubscriptionOfferDisclosure
    @State private var selected: Product?
    @State private var confirming = false
    private var plans: [Product] {
        ["ouchi.premium.monthly", "ouchi.premium.annual"].compactMap { id in
            purchases.products.first {
                guard $0.id == id, $0.type == .autoRenewable,
                      let period = $0.subscription?.subscriptionPeriod, period.value == 1 else { return false }
                return id == "ouchi.premium.monthly" ? period.unit == .month : period.unit == .year
            }
        }
    }
    private var available: Bool { store.releasePurchaseSalesAvailable(subscription: true) }
    private var alreadySubscribed: Bool {
        store.releaseEntitlement?.premiumIsCurrent(now: Date(), expectedEnvironment: store.releasePurchaseEnvironment ?? .production) == true
    }
    private var canPurchase: Bool { available && !store.busy && !alreadySubscribed }
    private func price(_ product: Product) -> String {
        "\(product.displayPrice) / \(product.id == "ouchi.premium.monthly" ? "1か月" : "1年")"
    }
    private func size(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }
    var body: some View {
        Section("有料プランに含まれる機能") {
            Text("写真・保証書のクラウド保管、通知の細かな設定、住まい全体のお手入れレポート")
            Text("保存容量：\(size(disclosure.maximumBytes))、\(disclosure.maximumFiles)件まで。1ファイルは\(size(disclosure.maximumFileBytes))まで。JPEG・PNG・PDFに対応します。")
            Text("保存期間と契約終了後の扱い：\(disclosure.retention)")
        }
        Section("自動更新プラン") {
            if store.releasePurchaseEnvironment == .sandbox {
                Text("購入のテスト環境です。実際の請求は発生しません。")
            }
            if alreadySubscribed {
                Text("有効な契約があります。新しい契約を重ねて購入する必要はありません。")
            } else if !available {
                Text("購入の準備が確認できません。契約状態を再確認してください。")
            } else if plans.isEmpty {
                Text("ストアの価格を取得できていません。価格を確認するまで購入できません。")
            }
            ForEach(plans, id: \.id) { product in
                Button { selected = product; confirming = true } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(price(product)).font(.headline)
                        Text(product.displayName).font(.caption)
                        Text("自動更新").font(.caption)
                    }
                }.disabled(!canPurchase)
            }
            Button("ストアの価格を再取得") { Task { await store.loadReleasePurchaseProducts() } }
                .disabled(store.busy || !available)
            Text("契約は解約するまで自動更新されます。Appleの定期購入管理から確認・解約できます。契約終了後も既存の記録の閲覧・書き出しは利用できます。")
            Link("Appleで契約を確認・解約", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
        }
        .confirmationDialog("自動更新プランを購入", isPresented: $confirming, titleVisibility: .visible) {
            if let product = selected {
                Button("\(price(product))で契約する") {
                    selected = nil
                    Task { await store.purchaseReleaseProduct(product) }
                }.disabled(!canPurchase)
            }
            Button("キャンセル", role: .cancel) { selected = nil }
        } message: {
            Text("表示した期間ごとの自動更新契約です。Appleの購入画面で価格と契約条件を確認してください。")
        }
        .onChange(of: store.accountBindingRevision) { _, _ in selected = nil; confirming = false }
        .onChange(of: canPurchase) { _, value in if !value { selected = nil; confirming = false } }
    }
}

