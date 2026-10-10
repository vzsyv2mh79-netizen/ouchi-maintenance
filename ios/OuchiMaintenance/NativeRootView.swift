import SwiftUI
import OuchiCore
import UniformTypeIdentifiers

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
    @State private var creating = false
    @State private var resetting = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("住まいと家電のお手入れを、ひとつに。").font(.headline)
                    Text("Web版と同じアカウントでログインできます。")
                }
                Section("クラウド保存にログイン") {
                    TextField("メールアドレス", text: $email).textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if !resetting { SecureField("パスワード（8文字以上）", text: $password).textContentType(creating ? .newPassword : .password) }
                    Button(store.busy ? "処理中…" : resetting ? "再設定メールを送信" : creating ? "アカウントを作成" : "ログイン") {
                        let value = password
                        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
                        let resetMode = resetting, signupMode = creating
                        password = ""
                        Task {
                            if resetMode { await store.requestPasswordReset(email: address) }
                            else if signupMode { await store.signUp(email: address, password: value) }
                            else { await store.signIn(email: address, password: value) }
                        }
                    }.disabled(store.busy || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (!resetting && (creating ? password.count < 8 : password.isEmpty)))
                    Button(creating || resetting ? "ログインに戻る" : "はじめての方") {
                        creating = !(creating || resetting); resetting = false; password = ""
                    }.disabled(store.busy)
                    if !resetting { Button("パスワードを忘れた方") { resetting = true; creating = false; password = "" }.disabled(store.busy) }
                    NavigationLink("プライバシーについて") { PrivacyInformation() }

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
                            NavigationLink { TaskEditor(productID: task.productId, initial: task) } label: { Text(task.name).font(.headline) }
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
    @State private var adding = false
    var body: some View {
        NavigationStack {
            List {
                HomePicker()
                ForEach(store.household?.products(in: store.homeID) ?? []) { product in
                    VStack(alignment: .leading, spacing: 5) {
                        NavigationLink { ProductEditor(home: product.homeId, initial: product) } label: { Text(product.name).font(.headline) }
                        Text("\(product.maker) \(product.modelNumber)").foregroundStyle(.secondary)
                        if let memo = product.memo, !memo.isEmpty { Text(memo).font(.caption) }
                    }
                }
            }.navigationTitle("製品").refreshable { await store.reload() }
            .toolbar { Button("製品を追加", systemImage: "plus") { adding = true }.disabled(store.busy || store.homeID.isEmpty) }
            .sheet(isPresented: $adding) { NavigationStack { ProductEditor(home: store.homeID, initial: nil) } }
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
    @State private var choosingBackup = false
    @State private var pendingBackup: Household?
    var body: some View {
        NavigationStack {
            Form {
                Section("住まい") { NavigationLink("住まいを管理") { HomeSettings() } }
                Section("家族") {
                    NavigationLink("家族と共有") { FamilySettings() }
                }
                Section("記録") {
                    Button("すべての記録を書き出す") {
                        store.prepareExport()
                    }.disabled(store.household == nil || store.busy)
                    if let exportURL = store.exportURL { ShareLink("ファイルを共有・保存", item: exportURL) }
                    Button("バックアップから復元") { choosingBackup = true }.disabled(store.busy)
                }
                Section("プライバシー") { NavigationLink("データの取り扱い") { PrivacyInformation() } }
                Section("アカウント") {
                    Button("ログアウト", role: .destructive) { confirmLogout = true }
                }
            }.navigationTitle("設定")
             .fileImporter(isPresented: $choosingBackup, allowedContentTypes: [.json]) { result in
                 do {
                     let url = try result.get()
                     let scoped = url.startAccessingSecurityScopedResource()
                     defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                     let handle = try FileHandle(forReadingFrom: url)
                     defer { try? handle.close() }
                     let bytes = try handle.read(upToCount: Backup.maximumBytes + 1) ?? Data()
                     pendingBackup = try Backup.decode(bytes)
                 } catch { store.message = "ファイルを読み込めませんでした。おうちメンテのバックアップ（10MB以内）を選んでください。" }
             }
             .confirmationDialog("バックアップを復元しますか？", isPresented: Binding(get: { pendingBackup != nil }, set: { if !$0 { pendingBackup = nil } }), titleVisibility: .visible) {
                 if let data = pendingBackup {
                     Button("復元する") { pendingBackup = nil; Task { _ = await store.restoreBackup(data) } }
                 }
                 Button("キャンセル", role: .cancel) { pendingBackup = nil }
             } message: {
                 if let data = pendingBackup { Text("住まい\(data.homes.count)件・製品\(data.products.count)件・お手入れ\(data.tasks.count)件・履歴\(data.history.count)件を、新しい住まいとして追加します。既存の記録は置き換えません。家族の共有権限は引き継がれません。") }
             }
             .onDisappear { pendingBackup = nil }
             .confirmationDialog("この端末からログアウトしますか？クラウドの記録は保持されます。", isPresented: $confirmLogout, titleVisibility: .visible) {
                 Button("ログアウト", role: .destructive) { Task { await store.signOut() } }
             }
        }
    }
}

private struct ProductEditor: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    let home: String
    let initial: Appliance?
    @State private var recordID = UUID().uuidString.lowercased()
    @State private var name = ""
    @State private var maker = ""
    @State private var model = ""
    @State private var category = "other-appliance"
    @State private var purchase = ""
    @State private var installed = ""
    @State private var memo = ""
    @State private var loaded = false
    @State private var deleting = false
    @State private var searching = false
    @State private var searchMessage: String?
    @State private var candidates: [ProductCandidate] = []
    @State private var candidate: ProductCandidate?
    @State private var selected: Set<Int> = []
    var body: some View {
        Form {
            Section("製品") {
                TextField("製品名", text: $name)
                Picker("種類", selection: $category) {
                    ForEach(Array(zip(RecordRules.categories, RecordRules.categoryNames)), id: \.0) { item in Text(item.1).tag(item.0) }
                }
                TextField("メーカー", text: $maker)
                TextField("品番", text: $model).textInputAutocapitalization(.characters).autocorrectionDisabled()
            }
            if initial == nil {
                Section("品番から調べる") {
                    Button(searching ? "公式情報を確認中…" : "候補を探す") {
                        let query = ProductLookup.normalize(model)
                        searching = true; searchMessage = nil; candidates = []
                        Task {
                            defer { searching = false }
                            do {
                                let results = try await ProductLookup().search(query)
                                guard query == ProductLookup.normalize(model) else { return }
                                candidates = results
                                if results.isEmpty { searchMessage = "確認済みの候補がありません。公式説明書を確認して手入力できます。" }
                            } catch { searchMessage = "公式情報を取得できませんでした。品番と通信状態を確認してください。" }
                        }
                    }.disabled(searching || store.busy || model.isEmpty)
                    if let searchMessage { Text(searchMessage).font(.caption) }
                    ForEach(Array(candidates.enumerated()), id: \.offset) { _, result in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("\(result.maker) \(result.modelNumber)").font(.headline)
                            Text(result.name)
                            if let note = result.lookupNote { Text(note).font(.caption) }
                            if let url = ProductLookup.officialURL(result.productUrl) { Link(result.productLinkLabel ?? "公式情報を確認", destination: url) }
                            if let url = ProductLookup.officialURL(result.manualUrl) { Link(result.manualLinkLabel ?? "取扱説明書", destination: url) }
                            Button("品番の一致を確認して選ぶ") {
                                model = result.modelNumber; name = result.name; maker = result.maker; category = result.categoryId
                                candidate = result; selected = []; candidates = []
                            }
                        }
                    }
                }
                if let candidate {
                    Section("お手入れ候補（任意）") {
                        Text("公式の周期・条件を確認して選んでください。自動では登録しません。確認日：\(candidate.verifiedAt)").font(.caption)
                        ForEach(Array(candidate.suggestions.enumerated()), id: \.offset) { index, suggestion in
                            VStack(alignment: .leading, spacing: 6) {
                                Toggle(suggestion.name, isOn: Binding(get: { selected.contains(index) }, set: { if $0 { selected.insert(index) } else { selected.remove(index) } }))
                                Text(suggestion.frequency).font(.caption)
                                Text(suggestion.conditions).font(.caption)
                                if let source = suggestion.sourceUrl, let url = ProductLookup.officialURL(source) { Link("根拠を確認", destination: url) }
                            }
                        }
                        if candidate.suggestions.isEmpty { Text("周期を確認済みのお手入れ候補はありません。登録後に手入力で追加できます。").font(.caption) }
                    }
                }
            }
            Section("日付・メモ") {
                TextField("購入日（YYYY-MM-DD・任意）", text: $purchase)
                TextField("設置日（YYYY-MM-DD・任意）", text: $installed)
                TextField("メモ", text: $memo, axis: .vertical)
            }
            if let initial {
                Section("お手入れ") {
                    NavigationLink("お手入れ項目を追加") { TaskEditor(productID: initial.id, initial: nil) }
                }
            }
            Button(store.busy ? "保存中…" : "保存") {
                let value = Appliance(id: initial?.id ?? recordID, homeId: home, categoryId: category,
                    maker: maker.trimmingCharacters(in: .whitespacesAndNewlines), name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                    modelNumber: model.trimmingCharacters(in: .whitespacesAndNewlines), purchaseDate: purchase.isEmpty ? nil : purchase,
                    installedDate: installed.isEmpty ? nil : installed, memo: memo.isEmpty ? nil : memo)
                Task {
                    do {
                        let tasks = try selected.sorted().map { index -> CareTask in
                            guard let candidate, ProductLookup.normalize(model) == ProductLookup.normalize(candidate.modelNumber), candidate.suggestions.indices.contains(index) else { throw CloudError.invalidInput }
                            return try candidate.suggestions[index].task(productID: value.id)
                        }
                        if await store.saveProduct(value, creating: initial == nil, tasks: tasks) { dismiss() }
                    } catch { store.message = "候補を再確認してください。" }
                }
            }.disabled(store.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || home != store.homeID)
            if initial != nil {
                Section { Button("製品を削除", role: .destructive) { deleting = true }.disabled(store.busy || home != store.homeID) }
            }
        }.navigationTitle(initial == nil ? "製品を追加" : "製品を編集")
         .confirmationDialog("製品と関連する記録を削除しますか？", isPresented: $deleting, titleVisibility: .visible) {
             if let initial { Button("製品を削除", role: .destructive) { Task { if await store.deleteProduct(initial) { dismiss() } } } }
         } message: { Text("この製品のお手入れ項目と完了履歴も削除され、共有家族の画面からも消えます。元に戻せません。必要な記録は設定から書き出してください。") }
         .interactiveDismissDisabled(store.busy)
         .onChange(of: model) { _, value in
             candidates = []
             if let candidate, ProductLookup.normalize(value) != ProductLookup.normalize(candidate.modelNumber) { self.candidate = nil; selected = [] }
         }
         .onAppear {
             guard !loaded else { return }; loaded = true
             if let initial {
                 name = initial.name; maker = initial.maker; model = initial.modelNumber; category = initial.categoryId
                 purchase = initial.purchaseDate ?? ""; installed = initial.installedDate ?? ""; memo = initial.memo ?? ""
             }
         }
    }
}

private struct TaskEditor: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    let productID: String
    let initial: CareTask?
    @State private var recordID = UUID().uuidString.lowercased()
    @State private var name = ""
    @State private var kind = "掃除"
    @State private var interval = "30"
    @State private var due = ""
    @State private var loaded = false
    @State private var deleting = false
    var body: some View {
        Form {
            Section("お手入れ") {
                TextField("お手入れ名", text: $name)
                Picker("種類", selection: $kind) { ForEach(RecordRules.kinds, id: \.self) { Text($0) } }
                TextField("周期（日）", text: $interval).keyboardType(.numberPad)
                TextField("次回予定（YYYY-MM-DD）", text: $due)
                Text("周期を変更しても次回予定は自動では変わりません。予定日も確認してください。").font(.caption)
            }
            Section("情報の根拠") {
                Text(initial?.sourceKind ?? "ユーザー設定")
                if let source = initial?.sourceUrl, let url = URL(string: source), url.scheme == "https" { Link("元の情報を確認", destination: url) }
                Text("編集した項目はユーザー設定として保存します。元の情報はリンクと注記に保持します。").font(.caption)
            }
            Button(store.busy ? "保存中…" : "保存") {
                let changed = initial == nil || name != initial?.name || kind != initial?.kind || Int(interval) != initial?.intervalDays
                let value = CareTask(id: initial?.id ?? recordID, productId: productID,
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines), kind: kind, intervalDays: Int(interval) ?? 0,
                    lastCompletedAt: initial?.lastCompletedAt, nextDueAt: due,
                    sourceKind: changed ? "ユーザー設定" : (initial?.sourceKind ?? "ユーザー設定"),
                    sourceUrl: initial?.sourceUrl, sourceNote: initial?.sourceNote,
                    sourceFrequency: changed ? nil : initial?.sourceFrequency)
                Task { if await store.saveTask(value, creating: initial == nil) { dismiss() } }
            }.disabled(store.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !((1...3650).contains(Int(interval) ?? 0)))
            if initial != nil {
                Section { Button("お手入れ項目を削除", role: .destructive) { deleting = true }.disabled(store.busy) }
            }
        }.navigationTitle(initial == nil ? "お手入れを追加" : "お手入れを編集")
         .confirmationDialog("お手入れ項目と履歴を削除しますか？", isPresented: $deleting, titleVisibility: .visible) {
             if let initial { Button("お手入れ項目を削除", role: .destructive) { Task { if await store.deleteTask(initial) { dismiss() } } } }
         } message: { Text("この項目の完了履歴も削除され、共有家族の画面からも消えます。元に戻せません。必要な記録は設定から書き出してください。") }
         .interactiveDismissDisabled(store.busy)
         .onAppear {
             guard !loaded else { return }; loaded = true
             if let initial { name = initial.name; kind = initial.kind; interval = String(initial.intervalDays); due = initial.nextDueAt }
             else {
                 var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
                 let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.calendar = calendar; f.timeZone = calendar.timeZone; f.dateFormat = "yyyy-MM-dd"
                 due = f.string(from: calendar.date(byAdding: .day, value: 30, to: Date())!)
             }
         }
    }
}

private struct FamilySettings: View {
    @EnvironmentObject private var store: NativeStore
    @State private var joinCode = ""
    @State private var nickname = ""
    @State private var revoke = false
    @State private var leave = false
    @State private var removing: FamilyMember?
    @State private var joined = false
    private var owner: Bool { store.household?.homes.first(where: { $0.id == store.homeID })?.role == "owner" }
    var body: some View {
        Form {
            HomePicker()
            Section("家族と共有") {
                Text("参加した家族は、この住まいの製品・お手入れ・履歴を追加・編集・削除できます。家族は自分のアカウントでログインしてください。")
                if owner {
                    Button("招待コードを作る") { let home = store.homeID; Task { await store.createInvite(home: home) } }.disabled(store.busy)
                    if store.familyHomeID == store.homeID, let code = store.inviteCode {
                        Text("7日間有効・1回限りです。共有したい家族にだけ渡してください。").font(.caption)
                        Text(code).font(.caption.monospaced()).textSelection(.enabled)
                        ShareLink("招待コードを共有", item: code)
                    }
                    Button("未使用の招待を取り消す", role: .destructive) { revoke = true }.disabled(store.busy)
                }
            }
            Section("参加している家族") {
                if store.familyHomeID == store.homeID {
                    if store.familyMembers.isEmpty { Text("参加している家族はまだいません。") }
                    ForEach(store.familyMembers) { member in
                        HStack {
                            Text(member.nickname)
                            Spacer()
                            if owner { Button("共有を解除", role: .destructive) { removing = member }.disabled(store.busy) }
                        }
                    }
                } else { Text("一覧を読み込んでください。") }
                Button("家族一覧を再読み込み") { let home = store.homeID; Task { await store.loadMembers(home: home) } }.disabled(store.busy)
                if !owner { Button("この住まいから退出", role: .destructive) { leave = true }.disabled(store.busy) }
            }
            Section("招待された住まいに参加") {
                TextField("受け取った招待コード", text: $joinCode).textInputAutocapitalization(.never).autocorrectionDisabled()
                TextField("家族に表示する名前", text: $nickname)
                Button("この権限で参加する") {
                    let code = joinCode.trimmingCharacters(in: .whitespacesAndNewlines)
                    let name = nickname.trimmingCharacters(in: .whitespacesAndNewlines)
                    Task { if await store.joinFamily(code: code, name: name) { joinCode = ""; joined = true; await store.loadMembers(home: store.homeID) } }
                }.disabled(store.busy || !HouseholdAPI.validInvite(joinCode.trimmingCharacters(in: .whitespacesAndNewlines)) || !(1...80).contains(nickname.trimmingCharacters(in: .whitespacesAndNewlines).count))
                if joined { Text("参加しました。上の住まい一覧から家族の住まいを選べます。") }
            }
        }.navigationTitle("家族と共有")
         .task(id: store.homeID) { await store.loadMembers(home: store.homeID) }
         .onDisappear { store.clearFamily() }
         .onChange(of: store.homeID) { _, _ in revoke = false; leave = false; removing = nil; joined = false }
         .confirmationDialog("未使用の招待コードをすべて無効にしますか？", isPresented: $revoke, titleVisibility: .visible) {
             Button("招待を取り消す", role: .destructive) { let home = store.homeID; Task { await store.revokeInvites(home: home) } }
         }
         .confirmationDialog("この住まいから退出しますか？記録は所有者のもとに残ります。", isPresented: $leave, titleVisibility: .visible) {
             Button("退出", role: .destructive) { let home = store.homeID; Task { await store.removeMember(home: home, user: nil) } }
         }
         .confirmationDialog("\(removing?.nickname ?? "家族")の共有アクセスを解除しますか？", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
             if let member = removing { Button("共有を解除", role: .destructive) { let home = store.homeID; Task { await store.removeMember(home: home, user: member.user_id) }; removing = nil } }
         }
    }
}

private struct PrivacyInformation: View {
    var body: some View {
        List {
            Section("保存する情報") { Text("クラウド保存に登録するメールアドレス、住まい・製品・お手入れ・履歴、家族に表示する名前を保存します。ログイン情報はこの端末の安全な保管領域に保存します。") }
            Section("使いみち") { Text("ログイン、記録の保存と端末間の共有、家族共有、確認メールとパスワード再設定に使用します。招待で参加した家族は、共有した住まいの記録を閲覧・編集・削除できます。") }
            Section("保存先") { Text("クラウドの認証と記録保存にはSupabaseを使用します。メールは設定したメール配信サービスから送られます。書き出したファイルの保管と共有先は利用者が選びます。") }
            Section("記録の管理") { Text("設定から記録を書き出せます。ログアウトするとこの端末のログイン情報を消しますが、クラウドの記録は残ります。") }
            Section("公開前の確認事項") { Text("このiPhone版は開発中です。正式なプライバシーポリシー、運営者と問い合わせ先、アカウント削除は公開前に整備します。") }
        }.navigationTitle("プライバシー")
    }
}

private struct HomeSettings: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        List {
            Section("住まい") {
                ForEach(store.household?.homes ?? []) { home in
                    if home.role == "owner" { NavigationLink(home.name) { HomeEditor(initial: home) } }
                    else { VStack(alignment: .leading) { Text(home.name); Text("家族が所有する共有の住まい").font(.caption).foregroundStyle(.secondary) } }
                }
            }
            Section { NavigationLink("住まいを追加") { HomeEditor(initial: nil) } }
        }.navigationTitle("住まいを管理")
    }
}
private struct HomeEditor: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    let initial: Home?
    @State private var name = ""
    @State private var kind = "home"
    @State private var loaded = false
    var body: some View {
        Form {
            TextField("住まいの名前", text: $name)
            Picker("種類", selection: $kind) {
                Text("自宅").tag("home"); Text("実家").tag("parents")
                Text("別宅").tag("second"); Text("賃貸").tag("rental")
            }
            Button(store.busy ? "保存中…" : "保存") {
                let value = name.trimmingCharacters(in: .whitespacesAndNewlines)
                Task {
                    let success: Bool
                    if let initial { success = await store.updateHome(id: initial.id, name: value, kind: kind) }
                    else { success = await store.createHome(name: value, kind: kind) }
                    if success { dismiss() }
                }
            }.disabled(store.busy || !(1...80).contains(name.trimmingCharacters(in: .whitespacesAndNewlines).count))
        }.navigationTitle(initial == nil ? "住まいを追加" : "住まいを編集")
         .onAppear { if !loaded { loaded = true; name = initial?.name ?? ""; kind = initial?.kind ?? "home" } }
         .interactiveDismissDisabled(store.busy)
    }
}
