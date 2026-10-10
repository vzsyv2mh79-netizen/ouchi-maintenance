import SwiftUI
import OuchiCore

struct NativeRootView: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        Group {
            if store.signedIn {
                TabView {
                    CareList().tabItem { Label("やること", systemImage: "checklist") }
                    ApplianceList().tabItem { Label("製品", systemImage: "square.grid.2x2") }
                    HistoryList().tabItem { Label("履歴", systemImage: "clock.arrow.circlepath") }
                    NativeSettings().tabItem { Label("設定", systemImage: "gearshape") }
                }
            } else { SignInView() }
        }
        .tint(Color(red: 0.125, green: 0.357, blue: 0.251))
        .alert("おうちメンテ", isPresented: Binding(get: { store.message != nil }, set: { if !$0 { store.message = nil } })) {
            Button("閉じる", role: .cancel) { store.message = nil }
        } message: { Text(store.message ?? "") }
    }
}

private struct SignInView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var email = ""
    @State private var password = ""
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("住まいと家電のお手入れを、ひとつに。").font(.headline)
                    Text("Web版と同じアカウントでログインできます。")
                }
                Section("クラウド保存にログイン") {
                    TextField("メールアドレス", text: $email).textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("パスワード", text: $password).textContentType(.password)
                    Button(store.busy ? "ログイン中…" : "ログイン") {
                        let value = password
                        password = ""
                        Task { await store.signIn(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: value) }
                    }.disabled(store.busy || email.isEmpty || password.isEmpty)
                }
            }.navigationTitle("おうちメンテ")
        }
    }
}

private struct HomePicker: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        Picker("住まい", selection: $store.homeID) {
            ForEach(store.household?.homes ?? []) { Text($0.name).tag($0.id) }
        }.disabled(store.busy)
    }
}

private struct CareList: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        NavigationStack {
            List {
                HomePicker()
                if let data = store.household {
                    let tasks = data.tasks(in: store.homeID)
                    if tasks.isEmpty { Text("お手入れ項目がありません。") }
                    ForEach(tasks) { task in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(task.name).font(.headline)
                            Text(data.products.first(where: { $0.id == task.productId })?.name ?? "製品").foregroundStyle(.secondary)
                            Text("次回 \(task.nextDueAt)・\(task.intervalDays)日ごと").font(.subheadline)
                            Text(task.sourceKind).font(.caption).foregroundStyle(.secondary)
                            if let note = task.sourceNote, !note.isEmpty { Text(note).font(.caption) }
                            Button("完了を記録") { Task { await store.complete(task) } }.disabled(store.busy)
                        }.padding(.vertical, 4)
                    }
                }
            }.navigationTitle("お手入れ")
             .refreshable { await store.reload() }
             .toolbar { if store.busy { ProgressView() } else { Button("再読み込み", systemImage: "arrow.clockwise") { Task { await store.reload() } } } }
        }
    }
}

private struct ApplianceList: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        NavigationStack {
            List {
                HomePicker()
                ForEach(store.household?.products(in: store.homeID) ?? []) { product in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(product.name).font(.headline)
                        Text("\(product.maker) \(product.modelNumber)").foregroundStyle(.secondary)
                        if let memo = product.memo, !memo.isEmpty { Text(memo).font(.caption) }
                    }
                }
            }.navigationTitle("製品").refreshable { await store.reload() }
        }
    }
}

private struct HistoryList: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        NavigationStack {
            List {
                HomePicker()
                if let data = store.household {
                    ForEach(data.history(in: store.homeID)) { history in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(data.tasks.first(where: { $0.id == history.taskId })?.name ?? "お手入れ")
                            Text(history.completedAt).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }.navigationTitle("履歴").refreshable { await store.reload() }
        }
    }
}

private struct NativeSettings: View {
    @EnvironmentObject private var store: NativeStore
    @State private var confirmLogout = false
    var body: some View {
        NavigationStack {
            Form {
                Section("記録") {
                    Button("すべての記録を書き出す") {
                        store.prepareExport()
                    }.disabled(store.household == nil || store.busy)
                    if let exportURL = store.exportURL { ShareLink("ファイルを共有・保存", item: exportURL) }
                }
                Section("アカウント") {
                    Button("ログアウト", role: .destructive) { confirmLogout = true }
                }
            }.navigationTitle("設定")
             .confirmationDialog("この端末からログアウトしますか？クラウドの記録は保持されます。", isPresented: $confirmLogout, titleVisibility: .visible) {
                 Button("ログアウト", role: .destructive) { Task { await store.signOut() } }
             }
        }
    }
}
