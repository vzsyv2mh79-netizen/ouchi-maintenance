import SwiftUI
import StoreKit
import OuchiCore

struct ReleaseTipPurchaseSection: View {
    @EnvironmentObject private var store: NativeStore
    @ObservedObject var purchases: PurchaseManager
    @State private var selected: Product?
    @State private var confirming = false
    private let tipIDs = ["ouchi.tip.small", "ouchi.tip.medium", "ouchi.tip.large"]
    private var tips: [Product] {
        tipIDs.compactMap { id in purchases.products.first { $0.id == id && $0.type == .consumable } }
    }
    private var available: Bool { store.releasePurchaseSalesAvailable(subscription: false) }
    var body: some View {
        Section("開発を応援する") {
            Text("任意の一回払いです。機能の追加特典はなく、サブスクや自動更新にはなりません。応援しなくても無料の機能は使えます。")
            if store.releasePurchaseEnvironment == .sandbox {
                Text("購入のテスト環境です。実際の請求はありません。")
            }
            if !available {
                Text("購入の準備が確認できません。契約状態を再確認してください。")
            } else if tips.isEmpty {
                Text("ストアの価格を取得できていません。価格を確認するまで購入できません。")
            }
            ForEach(tips, id: \.id) { product in
                Button("\(product.displayPrice)で応援する") { selected = product; confirming = true }
                    .disabled(store.busy || !available)
            }
            Button("ストアの価格を再取得") { Task { await store.loadReleasePurchaseProducts() } }
                .disabled(store.busy || !available)
        }
        .confirmationDialog("開発を応援する", isPresented: $confirming, titleVisibility: .visible) {
            if let product = selected {
                Button("\(product.displayPrice)の一回払いで応援する") {
                    selected = nil
                    Task { await store.purchaseReleaseProduct(product) }
                }.disabled(store.busy || !available)
            }
            Button("キャンセル", role: .cancel) { selected = nil }
        } message: {
            Text("任意の一回払いです。機能の追加特典はなく、自動更新もありません。Appleの購入画面で金額を確認してください。")
        }
        .onChange(of: store.accountBindingRevision) { _, _ in selected = nil; confirming = false }
        .onChange(of: available) { _, value in if !value { selected = nil; confirming = false } }
    }
}

