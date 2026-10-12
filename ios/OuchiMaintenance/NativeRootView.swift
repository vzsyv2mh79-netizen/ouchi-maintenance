import SwiftUI
import OuchiCore
import UniformTypeIdentifiers
import StoreKit

struct NativeRootView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.colorScheme) private var appearance
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("ouchi.appearance") private var preferredAppearance = "system"
    var body: some View {
        Group {
            if store.signedIn {
                TabView {
                    HomeDashboard().tabItem { Label("ホーム", systemImage: "house") }
                    CareList().tabItem { Label("やること", systemImage: "checklist") }
                    ApplianceList().tabItem { Label("製品", systemImage: "square.grid.2x2") }
                    HistoryList().tabItem { Label("履歴", systemImage: "clock.arrow.circlepath") }
                    NativeSettings().tabItem { Label("設定", systemImage: "gearshape") }
                }
            } else { SignInView() }
        }
        .preferredColorScheme(preferredAppearance == "dark" ? .dark : preferredAppearance == "light" ? .light : nil)
        .task(id: scenePhase) {
            if scenePhase == .active { await store.recoverPurchasesOnForeground() }
        }
        .safeAreaInset(edge: .top) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                #if DEBUG
                if Bundle.main.bundleIdentifier?.hasPrefix("dev.ouchi.review.")==true,
                   let stamp=Bundle.main.infoDictionary?["OUCHI_REVIEW_BUILD_ID"] as? String,
                   stamp.range(of:"^[a-f0-9]{40}$",options:.regularExpression) != nil {
                    Text("確認用 \(stamp.prefix(7))")
                        .font(.caption).dynamicTypeSize(...DynamicTypeSize.xxxLarge).accessibilityIdentifier("ouchi.reviewBuild")
                        .accessibilityLabel("確認用ビルド \(stamp)")
                    if store.isUIReviewSample { Text("サンプルデータ").font(.caption).dynamicTypeSize(...DynamicTypeSize.xxxLarge).accessibilityIdentifier("ouchi.reviewSample") }
                }
                #endif
                if store.showingOfflineSnapshot { Text("保存済みの記録").font(.caption).accessibilityLabel("通信による更新前の保存済み記録") }
                }.fixedSize(horizontal: false, vertical: true)
                Spacer()
                Button {
                    preferredAppearance = appearance == .dark ? "light" : "dark"
                } label: { Image(systemName: appearance == .dark ? "sun.max" : "moon").frame(width: 44, height: 44) }
                .accessibilityLabel(appearance == .dark ? "ライトモードに切り替える" : "ダークモードに切り替える")
            }.padding(.horizontal).background(.bar)
        }
        .tint(appearance == .dark
            ? Color(red: 0.502, green: 0.839, blue: 0.667)
            : Color(red: 0.125, green: 0.357, blue: 0.251))
        .alert("おうちメンテ", isPresented: Binding(get: { store.message != nil }, set: { if !$0 { store.message = nil } })) {
            Button("閉じる", role: .cancel) { store.message = nil }
        } message: { Text(store.message ?? "") }
    }
}

/// Prepared explicit local recovery; release configuration defaults to off.
private struct LocalRegistrationClosureRecoveryView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    @State private var selected: AppAttestAccountClosure?
    @State private var confirming = false
    var body: some View {
        Form {
            Section("この端末の未完了処理") {
                Text("アプリを閉じた際に残った、端末登録の終了記録を確認します。ログイン情報が残っている場合は実行できません。")
                Text("端末登録の情報だけを整理します。サーバー側の退会申請、記録の削除、Appleの定期購入の解約は行いません。")
                Button("終了記録を再確認") { Task { await store.loadLocalRegistrationClosures() } }
                    .disabled(store.busy)
                Button("ログイン画面へ戻る") { dismiss() }.disabled(store.busy)
            }
            Section("終了記録") {
                if store.pendingLocalRegistrationClosures.isEmpty {
                    Text("再試行できる終了記録は表示されていません。確認に失敗した場合は、再度お試しください。")
                }
                ForEach(Array(store.pendingLocalRegistrationClosures.enumerated()), id: \.element.requestID) { index, record in
                    Button {
                        selected = record; confirming = true
                    } label: {
                        VStack(alignment: .leading) {
                            Text("終了記録 \(index + 1) を再試行")
                            Text(Date(timeIntervalSince1970: Double(record.createdAtMilliseconds) / 1000), style: .date)
                                .font(.caption)
                        }
                    }.disabled(store.busy)
                }
            }
            if let message = store.message { Section { Text(message) } }
            if store.busy { ProgressView("確認しています") }
        }
        .navigationTitle("端末登録の再確認").modifier(AdaptiveNavigationTitle())
        .task { await store.loadLocalRegistrationClosures() }
        .confirmationDialog("この終了記録の処理を再開しますか？", isPresented: $confirming, titleVisibility: .visible) {
            Button("終了処理を再試行") {
                guard let record = selected else { return }
                selected = nil
                Task {
                    _ = await store.recoverAbandonedRegistrationClosure(record)
                    await store.loadLocalRegistrationClosures()
                }
            }
            Button("キャンセル", role: .cancel) { selected = nil }
        } message: {
            Text("失敗した場合は終了記録を保持し、再度確認できます。サーバー側の退会完了を示す操作ではありません。")
        }
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
                    NavigationLink("使い方・困ったとき") { HelpInformation() }
                    if store.localClosureRecoveryConfigured {
                        NavigationLink("未完了の端末登録を確認") { LocalRegistrationClosureRecoveryView() }
                    }

                }
            }.navigationTitle("おうちメンテ").modifier(AdaptiveNavigationTitle())
        }
    }
}

private struct HomePicker: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dynamicTypeSize) private var textSize
    var body: some View {
        Group {
            if textSize.isAccessibilitySize {
                Menu {
                    ForEach(store.household?.homes ?? []) { home in
                        Button(home.name) { store.homeID = home.id }
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("住まい").foregroundStyle(.primary)
                        Text(store.household?.homes.first(where: { $0.id == store.homeID })?.name ?? "住まいを選ぶ")
                            .fixedSize(horizontal: false, vertical: true)
                        Text("住まいを切り替える").font(.caption)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                Picker("住まい", selection: $store.homeID) {
                    ForEach(store.household?.homes ?? []) { Text($0.name).tag($0.id) }
                }
            }
        }.disabled(store.busy)
    }
}

private struct AdaptiveNavigationTitle: ViewModifier {
    @Environment(\.dynamicTypeSize) private var textSize
    func body(content: Content) -> some View {
        content.navigationBarTitleDisplayMode(textSize.isAccessibilitySize ? .inline : .automatic)
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
                            Button("完了を記録") { Task { await store.complete(task) } }
                                .buttonStyle(.borderless)
                                .accessibilityLabel("\(data.products.first(where: { $0.id == task.productId })?.name ?? "製品")の\(task.name)の完了を記録")
                                .disabled(store.busy)
                        }.padding(.vertical, 4)
                    }
                }
            }.navigationTitle("お手入れ").modifier(AdaptiveNavigationTitle())
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
                        if store.attachmentServiceConfigured {
                            NavigationLink("写真・保証書") {
                                AttachmentView(productID: product.id)
                            }
                        }
                    }
                }
            }.navigationTitle("製品").modifier(AdaptiveNavigationTitle()).refreshable { await store.reload() }
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
            }.navigationTitle("履歴").modifier(AdaptiveNavigationTitle()).refreshable { await store.reload() }
        }
    }
}

private struct NativeSettings: View {
    @EnvironmentObject private var store: NativeStore
    @State private var confirmLogout = false
    @State private var choosingBackup = false
    @State private var pendingBackup: Household?
    @State private var deletionPreviewRevision = UUID()
    @State private var deletionPreviewFlow = AccountDeletionFlow()
    var body: some View {
        NavigationStack {
            Form {
                if store.releasePurchaseRecoveryConfigured {
                    Section("プラン・開発を応援") {
                        NavigationLink("購入と契約の確認") { ReleasePurchaseRecoveryView() }
                    }
                }
                #if DEBUG
                if store.isPurchaseRecoveryUIReviewSample {
                    Section("購入画面の表示確認") {
                        Text("サンプル表示です。契約照会・購入・復元は実行しません。")
                        NavigationLink("購入と契約の確認") { ReleasePurchaseRecoveryView() }
                    }
                }
                #endif
                if store.explicitEnrollmentConfigured {
                    Section("クラウド登録") { NavigationLink("おうちメンテへの登録") { ExplicitEnrollmentView() } }
                }
                if store.formalNativePushConfiguration != nil {
                    Section("この端末への通知") { NavigationLink("通知先を管理") { FormalNativePushView() } }
                }
                if store.formalChannelEnvironment != nil {
                    Section("通知の受け取り先") { NavigationLink("受け取り先を選ぶ") { FormalChannelView() } }
                }
                if store.formalReminderEnvironment != nil {
                    Section("お手入れの通知") { NavigationLink("通知の細かな設定") { FormalReminderSettingsView() } }
                }
                if store.formalReportEnvironment != nil {
                    Section("お手入れレポート") { NavigationLink("住まい全体のレポート") { FormalReportView() } }
                }
                if store.sandboxBillingConfigured { Section("開発用") {
                    NavigationLink("応援チップのSandbox確認") { SandboxTipView(purchases: store.purchases) }
                    NavigationLink("有料プランのSandbox確認") { SandboxSubscriptionView(purchases: store.purchases) }
                    NavigationLink("レポートのSandbox確認") { SandboxReportView() }
                    NavigationLink("細かな通知設定のSandbox確認") { SandboxReminderSettingsView() }
                } }
                if store.developmentLifecycleConfigured {
                    Section("開発用") {
                        NavigationLink("アカウント処理のテスト") { DevelopmentLifecycleView() }
#if DEBUG
                        NavigationLink("退会画面の表示確認") {
                            AccountDeletionView(accountID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
                                epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!,
                                bindingRevision: deletionPreviewRevision, available: false, deletionExplanation: "",
                                token: { nil }, exportAvailable: false, export: {},
                                cleanupLocalData: { _, _, _, _ in false }, flow: deletionPreviewFlow)
                        }
#endif
                        NavigationLink("iPhone通知の登録テスト") { DevelopmentRemoteNotificationView() }
                    }
                }
                if store.attachmentServiceConfigured {
                    Section("写真・保証書") { NavigationLink("保存したファイルを管理") { AttachmentView() } }
                }
                Section("住まい") { NavigationLink("住まいを管理") { HomeSettings() } }
                Section("家族") {
                    NavigationLink("家族と共有") { FamilySettings() }
                }
                Section("記録") {
                    Text("家電・お手入れ・完了履歴を、無料でバックアップ用ファイルに保存できます。元の記録は消えません。ほかのアプリへの取り込みは、移行先がこの形式に対応している必要があります。")
                        .font(.caption)
                    Button("すべての記録を書き出す") {
                        store.prepareExport()
                    }.disabled(store.household == nil || store.busy)
                    if let exportURL = store.exportURL { ShareLink("ファイルを共有・保存", item: exportURL) }
                    Button("バックアップから復元") { choosingBackup = true }.disabled(store.busy)
                }
                Section("この端末のお手入れ通知") {
                    Toggle("朝9時に通知する", isOn: Binding(get: { store.remindersEnabled }, set: { value in Task { await store.setReminders(value) } })).disabled(store.busy || store.household == nil)
                    Text("読み込んだ予定をもとに、次の30日間の通知を予約します。住まい名・製品名は通知に表示しません。アプリを開いて記録を更新すると予約も更新します。別端末での変更は、再読み込みするまで反映されません。").font(.caption)
                }
                Section("カレンダーでリマインド") {
                    Text("すべての住まいのお手入れ予定を午前9時、通知を前日の午前9時として書き出します。製品名・お手入れ名がファイルに含まれます。")
                    Button("予定をカレンダー用に保存") { store.prepareCalendar() }.disabled(store.busy || store.household == nil)
                    if let url = store.calendarURL { ShareLink("カレンダーファイルを共有・保存", item: url) }
                    Text("取り込み後の通知設定はカレンダーで確認してください。アプリで完了・周期変更・削除しても、自動では反映されません。再取り込み時は重複に注意してください。TimeTreeでの直接取り込みは未確認です。").font(.caption)
                }
                if store.appAttestRegistrationConfigured && store.pendingRegistrationMaintenanceNeedsAttention {
                    Section("端末の一時データ") {
                        Text("一時データの整理を完了できませんでした。端末のロックを解除し、通信できる状態で再確認してください。記録や購入の利用権は、この整理によって変更されません。")
                            .font(.caption)
                        Button("整理を再確認") { Task { await store.maintainExpiredPendingRegistration() } }.disabled(store.busy)
                    }
                }
                Section("プライバシー") { NavigationLink("データの取り扱い") { PrivacyInformation() } }
                Section("ヘルプ") { NavigationLink("使い方・困ったとき") { HelpInformation() } }
                Section("アカウント") {
                    if let email = store.accountEmail, !email.isEmpty {
                        LabeledContent("ログイン中", value: email)
                            .textSelection(.enabled)
                    } else {
                        Text("メールアドレスを確認できませんでした。通信を確認して再度お試しください。")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Button("ログアウト", role: .destructive) { confirmLogout = true }
                }
            }.navigationTitle("設定").modifier(AdaptiveNavigationTitle())
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
    @State private var manualURL = ""
    @State private var manualConsent = false
    @State private var manualReading = false
    @State private var manualResult: ManualInspection?
    @State private var manualModel = ""
    @State private var manualSelected: Set<Int> = []
    @State private var manualMessage: String?
    @State private var manualGeneration = UUID()
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
                    }.disabled(searching || manualReading || store.busy || model.isEmpty)
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
                                manualResult = nil; manualSelected = []; manualGeneration = UUID(); manualReading = false
                            }
                        }
                    }
                }
                Section("公式の取扱説明書から調べる") {
                    Text("対応するSHARP・Panasonicの公式PDFから、明記された周期だけを読み取ります。説明書の品番・対象・条件を確認してください。推測で補いません。").font(.caption)
                    TextField("公式PDFのURL", text: $manualURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if let url = ManualLookup.supportedURL(manualURL) { Link("説明書と利用条件を確認", destination: url) }
                    Toggle("メーカーの説明書利用条件を確認し、同意しました", isOn: $manualConsent)
                    Button(manualReading ? "説明書を確認中…" : "説明書から候補を読み取る") {
                        let query = ProductLookup.normalize(model)
                        let source = manualURL
                        let expected = UUID(); manualGeneration = expected
                        manualReading = true; manualMessage = nil; manualResult = nil; manualSelected = []
                        Task {
                            defer { if manualGeneration == expected { manualReading = false } }
                            do {
                                let result = try await ManualLookup().inspect(model: query, url: source, consentConfirmed: true)
                                guard manualGeneration == expected, query == ProductLookup.normalize(model), source == manualURL, manualConsent else { return }
                                manualResult = result; manualModel = query
                                candidate = nil; selected = []
                                if result.suggestions.isEmpty { manualMessage = "周期を安全に読み取れる候補はありません。説明書を確認して手入力してください。" }
                            } catch { if manualGeneration == expected { manualMessage = "説明書を読み取れませんでした。品番の一致・対応PDF・通信を確認してください。" } }
                        }
                    }.disabled(manualReading || searching || store.busy || !manualConsent || ManualLookup.supportedURL(manualURL) == nil || model.isEmpty)
                    if let manualMessage { Text(manualMessage).font(.caption) }
                    if let result = manualResult {
                        Text("\(result.maker)・\(result.name)／\(result.pageCount)ページ。登録する項目を選んでください。製品名や種類は上の入力欄で確認してください。").font(.caption)
                        ForEach(Array(result.suggestions.enumerated()), id: \.offset) { index, suggestion in
                            VStack(alignment: .leading, spacing: 6) {
                                Toggle(suggestion.name, isOn: Binding(get: { manualSelected.contains(index) }, set: { if $0 { manualSelected.insert(index) } else { manualSelected.remove(index) } }))
                                Text(suggestion.frequency).font(.caption)
                                Text(suggestion.conditions).font(.caption)
                                if let source = suggestion.sourceUrl, let url = ProductLookup.officialURL(source) { Link("根拠ページを確認", destination: url) }
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
                        var tasks = try selected.sorted().map { index -> CareTask in
                            guard let candidate, ProductLookup.normalize(model) == ProductLookup.normalize(candidate.modelNumber), candidate.suggestions.indices.contains(index) else { throw CloudError.invalidInput }
                            return try candidate.suggestions[index].task(productID: value.id)
                        }
                        tasks += try manualSelected.sorted().map { index -> CareTask in
                            guard manualConsent, manualModel == ProductLookup.normalize(model), let result = manualResult,
                                  result.suggestions.indices.contains(index) else { throw CloudError.invalidInput }
                            return try result.suggestions[index].task(productID: value.id)
                        }
                        if await store.saveProduct(value, creating: initial == nil, tasks: tasks) { dismiss() }
                    } catch { store.message = "候補を再確認してください。" }
                }
            }.disabled(store.busy || searching || manualReading || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || home != store.homeID)
            if initial != nil {
                Section { Button("製品を削除", role: .destructive) { deleting = true }.disabled(store.busy || home != store.homeID) }
            }
        }.navigationTitle(initial == nil ? "製品を追加" : "製品を編集")
         .confirmationDialog("製品と関連する記録を削除しますか？", isPresented: $deleting, titleVisibility: .visible) {
             if let initial { Button("製品を削除", role: .destructive) { Task { if await store.deleteProduct(initial) { dismiss() } } } }
         } message: { Text("この製品のお手入れ項目と完了履歴も削除され、共有家族の画面からも消えます。元に戻せません。必要な記録は設定から書き出してください。") }
         .interactiveDismissDisabled(store.busy)
         .onChange(of: model) { _, value in
             manualGeneration = UUID(); manualReading = false; manualResult = nil; manualSelected = []
             candidates = []
             if let candidate, ProductLookup.normalize(value) != ProductLookup.normalize(candidate.modelNumber) { self.candidate = nil; selected = [] }
         }
         .onChange(of: manualURL) { _, _ in
             manualGeneration = UUID(); manualReading = false; manualResult = nil; manualSelected = []; manualConsent = false
         }
         .onChange(of: manualConsent) { _, accepted in
             if !accepted { manualGeneration = UUID(); manualReading = false; manualResult = nil; manualSelected = [] }
         }
         .onDisappear { manualGeneration = UUID(); manualReading = false }
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
                if let frequency = initial?.sourceFrequency, !frequency.isEmpty { Text("元の頻度・条件：\(frequency)").font(.subheadline) }
                if let note = initial?.sourceNote, !note.isEmpty { Text(note).font(.caption) }
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
        }.navigationTitle("家族と共有").modifier(AdaptiveNavigationTitle())
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

private struct HelpInformation: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        List {
            Section("家電とお手入れを登録する") {
                Text("「製品」から家電を追加し、品番を入力して候補を調べます。候補の品番とメーカーの根拠ページを確認して、必要なお手入れを選んでください。対応する候補がないときは、説明書を確認して手入力できます。")
                Text("使用状況で必要なお手入れが変わる場合があります。説明書の条件を確認してください。読み取れない周期を推測で登録することはありません。")
            }
            Section("完了を記録する") {
                Text("お手入れが済んだら「完了」を押します。完了履歴と次回予定を確認してください。周期や次回予定は、お手入れ項目の編集で変更できます。")
            }
            Section("家族と共有する") {
                Text("設定の「家族と共有」で、住まいの所有者が招待を作ります。家族は自分のおうちメンテアカウントでログインし、受け取った招待から参加します。ログイン用のパスワードを渡す必要はありません。")
                Text("共有後は右上の住まいを確認してください。共有した記録の変更や削除は家族にも反映されます。別端末の変更が見えない場合は、通信できる状態で記録を再読み込みしてください。")
            }
            Section("通知が届かないとき") {
                Text("設定の「この端末のお手入れ通知」で「朝9時に通知する」をオンにします。iPhoneの設定でも、おうちメンテの通知が許可されているか確認してください。集中モードなど、iPhone側の設定によって通知の表示が変わります。")
                Text("この端末の通知は、読み込んだ予定から次の30日間を予約します。定期的にアプリを開いて記録を読み込み直してください。Web版の通知設定とは別に、このiPhoneで設定します。")
            }
            Section("カレンダーに予定を入れる") {
                Text("設定の「予定をカレンダー用に保存」でファイルを作り、対応するカレンダーへ取り込みます。取り込み後の予定は、おうちメンテで完了・編集・削除しても自動で変わりません。再取り込み時は重複を確認してください。TimeTreeへの直接取り込みは未確認です。")
            }
            Section("記録を保存・移す") {
                Text("設定の「すべての記録を書き出す」から、無料でバックアップ用ファイルを保存できます。元の記録は消えません。保存したファイルは「バックアップから復元」で読み込めます。ほかのアプリへの移行には、そのアプリがこの形式に対応している必要があります。")
                Text("書き出したファイルには住まいや家電の情報が含まれます。保存先・共有先を確認し、必要なファイルを大切に保管してください。")
            }
            Section("ログイン・購入の確認") {
                Text("Web版とiPhone版は、同じおうちメンテアカウントでログインしてください。設定の「ログイン中」でメールアドレスを確認できます。Appleの購入に使うアカウントと、おうちメンテのログインは別です。")
                Text("購入・契約の確認機能が利用できる場合は、設定の「購入と契約の確認」から再確認・復元できます。通信を確認し、購入をひもづけたおうちメンテアカウントで操作してください。結果が分からないときは、新しい購入を繰り返さず確認してください。")
                Link("Appleの定期購入を確認・解約", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                Text("解約しても既存の記録は削除しません。記録の閲覧・書き出しは引き続き利用できます。")
            }
            Section("問い合わせ") {
                if let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
                   let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String {
                    LabeledContent("アプリのバージョン", value: "\(version)（\(build)）")
                        .textSelection(.enabled)
                }
                if let links = store.releasePurchaseDisclosureLinks {
                    Link("問い合わせ先を開く", destination: links.support)
                } else {
                    Text("このiPhone版は公開準備中です。正式な問い合わせ先は公開前に掲載します。")
                }
                Text("問い合わせには、困った操作、表示されたエラー、発生した時刻、アプリとiPhoneのバージョンを添えてください。パスワード・確認コード・支払い情報は送らないでください。画面の写真を送るときは、個人情報が写っていないか確認してください。")
            }
        }.navigationTitle("使い方・困ったとき").modifier(AdaptiveNavigationTitle())
    }
}

private struct PrivacyInformation: View {
    var body: some View {
        List {
            Section("この説明について") {
                Text("このiPhone版は公開準備中です。以下は現在の機能と準備中の機能の説明です。正式なプライバシーポリシーは公開前に掲載します。")
            }
            Section("アカウントと記録") {
                Text("クラウド保存にはメールアドレス、住まい・製品・お手入れ・履歴、家族に表示する名前を使用します。ログイン情報は端末の安全な保管領域に保存し、読み込んだ記録を端末にも保存します。")
                Text("認証とクラウドの記録保存にはSupabaseを使用します。確認メールとパスワード再設定のメールは、設定したメール配信サービスから送られます。")
            }
            Section("家族との共有") {
                Text("招待で参加した家族は、共有した住まいの記録を閲覧・編集・削除できます。家族に共有する記録には、見せたくない情報を入力しないでください。")
            }
            Section("写真・保証書（準備中）") {
                Text("写真や保証書をクラウドに保存する機能を準備しています。新しく選んだJPEG・PNG画像は、アップロード前に画像として作り直します。PDFはそのまま送信するため、文書に含まれる氏名や住所なども保存対象になります。")
                Text("画像に写った個人情報は、画像を作り直しても残ります。保存する内容を確認してください。利用できる容量・保存期間・共有範囲は、機能の公開前に案内します。")
            }
            Section("購入情報（準備中）") {
                Text("Appleの購入・復元に対応する機能を準備しています。利用権の確認と二重処理の防止のため、Appleの取引情報とアカウントに対応する購入用の識別子を照合します。端末の表示だけで有料利用権を付けることはありません。")
                Text("購入できる商品と価格は、購入画面で確認してください。準備中の機能を購入特典として案内することはありません。")
            }
            Section("通知と書き出し") {
                Text("端末のお手入れ通知には住まい名・製品名を表示しません。カレンダー用の書き出しには製品名・お手入れ名が含まれます。記録の書き出しも無料で利用できます。保存先と共有先は利用者が選びます。")
            }
            Section("ログアウトと削除") {
                Text("ログアウトでは、この端末のログイン情報・保存した記録・一時的な書き出しファイルの整理を行います。通信や端末の状態により完了できない場合は、画面の案内に沿って再試行してください。自分で別の場所に保存・共有したファイルは削除されません。")
                Text("ログアウトしてもクラウドの記録は残ります。アカウント削除と端末登録の整理は、公開前に正式な手順を整備します。購入記録などの保存期間と削除範囲も、その手順で説明します。")
            }
            Section("公開前の確認事項") {
                Text("運営者・問い合わせ先、正式な規約とプライバシーポリシー、保存期間、利用するサービスのデータの扱いを確定し、公開前に案内します。")
            }
        }.navigationTitle("プライバシー").modifier(AdaptiveNavigationTitle())
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
        }.navigationTitle("住まいを管理").modifier(AdaptiveNavigationTitle())
    }
}
private struct HomeEditor: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    let initial: Home?
    @State private var name = ""
    @State private var kind = "home"
    @State private var loaded = false
    @State private var confirmDelete = false
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
            if let initial, initial.role == "owner", (store.household?.homes.count ?? 0) > 1 {
                Section {
                    Button("この住まいを削除", role: .destructive) { confirmDelete = true }
                        .disabled(store.busy)
                } footer: {
                    Text("製品・お手入れ・履歴と家族の共有も削除されます。必要な記録は設定から書き出しておいてください。")
                }
            }
        }.confirmationDialog("この住まいを削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("住まいと記録を削除", role: .destructive) {
                guard let initial else { return }
                Task { if await store.deleteHome(id: initial.id) { dismiss() } }
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("製品・お手入れ・完了履歴が削除され、共有している家族も見られなくなります。この操作は取り消せません。")
        }.navigationTitle(initial == nil ? "住まいを追加" : "住まいを編集")
         .onAppear { if !loaded { loaded = true; name = initial?.name ?? ""; kind = initial?.kind ?? "home" } }
         .interactiveDismissDisabled(store.busy)
    }
}

private struct HomeDashboard: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 60)) { context in
                List {
                    HomePicker()
                    Section {
                        Button {
                            Task { await store.reload() }
                        } label: {
                            Label(store.busy ? "記録を更新中…" : "最新の記録を読み込む", systemImage: "arrow.clockwise")
                        }
                        .disabled(store.busy)
                    }
                    if let data = store.household {
                        let overview = data.overview(home: store.homeID, now: context.date)
                        Section(overview.today) {
                            LabeledContent("期限を過ぎたお手入れ", value: "\(overview.overdue)件")
                            LabeledContent("今日のお手入れ", value: "\(overview.dueToday)件")
                            LabeledContent("明日から7日以内", value: "\(overview.upcoming)件")
                        }
                        Section("わが家の記録") {
                            LabeledContent("登録製品", value: "\(overview.productCount)件")
                            LabeledContent("今月の完了記録", value: "\(overview.completedThisMonth)件")
                        }
                        Section("次のお手入れ") {
                            let tasks = Array(data.tasks(in: store.homeID).prefix(5))
                            if tasks.isEmpty { Text("製品とお手入れを登録すると、ここに予定が表示されます。") }
                            ForEach(tasks) { task in
                                NavigationLink { TaskEditor(productID: task.productId, initial: task) } label: {
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(task.name)
                                        Text("\(data.products.first(where: { $0.id == task.productId })?.name ?? "製品")・\(task.nextDueAt)").font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }.refreshable { await store.reload() }
            }.navigationTitle("おうちメンテ").modifier(AdaptiveNavigationTitle())
        }
    }
}

private struct SandboxTipView: View {
    @EnvironmentObject private var store: NativeStore
    @ObservedObject var purchases: PurchaseManager
    @State private var selected: Product?
    @State private var loading = false
    @State private var status: String?
    private var tips: [Product] {
        purchases.products.filter { ["ouchi.tip.small", "ouchi.tip.medium", "ouchi.tip.large"].contains($0.id) && $0.type == .consumable }.sorted { $0.price < $1.price }
    }
    var body: some View {
        List {
            Section("開発を応援する（Sandbox確認）") {
                Text("任意の一回払いです。サブスクリプションではなく、機能の特典はありません。この画面は開発用で、実際の請求は有効にしていません。")
                ForEach(tips) { product in
                    Button { selected = product } label: { HStack { Text(product.displayName); Spacer(); Text(product.displayPrice) } }.disabled(store.busy || loading)
                }
                if tips.isEmpty { Text("Appleの商品情報をまだ取得できていません。確認前の金額や購入ボタンは表示しません。") }
                Button(loading ? "読込中…" : "Appleの商品情報を再読み込み") {
                    loading = true; status = nil
                    Task { defer { loading = false }; do { try await purchases.load() } catch { status = "商品情報を取得できませんでした。" } }
                }.disabled(loading || store.busy)
                if let status { Text(status).font(.caption) }
            }
            Section("Sandbox\u{306e}\u{8cfc}\u{5165}\u{5fa9}\u{5143}") {
                Button("\u{8cfc}\u{5165}\u{3092}\u{5fa9}\u{5143}") { Task { await store.restoreSandboxPurchases() } }.disabled(store.busy)
                Text("\u{540c}\u{3058}Apple Account\u{3068}\u{304a}\u{3046}\u{3061}\u{30e1}\u{30f3}\u{30c6}\u{306e}\u{30a2}\u{30ab}\u{30a6}\u{30f3}\u{30c8}\u{306e}Sandbox\u{5229}\u{7528}\u{6a29}\u{3092}\u{78ba}\u{8a8d}\u{3057}\u{307e}\u{3059}\u{3002}\u{30c1}\u{30c3}\u{30d7}\u{306f}\u{5fa9}\u{5143}\u{5bfe}\u{8c61}\u{5916}\u{3067}\u{3059}\u{3002}")
            }
            Section("未完了の取引") {
                Text("チップは消費型の商品です。通常の購入復元の対象ではありません。サーバーへ保存できなかった未完了取引を再確認できます。")
                Button("未完了取引を再確認") { Task { await store.retrySandboxTransactions() } }.disabled(store.busy)
                if purchases.needsRetry { Text("未完了の結果を確認する必要があります。") }
            }
            Section { Text("正式な利用規約・プライバシーポリシーと問い合わせ窓口は公開前に整備します。サブスクリプションも別の開発画面で検証中です。正式販売は、有料特典と購入テストの確認後に開始します。") }
        }.navigationTitle("応援チップの確認").modifier(AdaptiveNavigationTitle())
         .confirmationDialog("一回払いのSandboxテストを開始しますか？", isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil } }), titleVisibility: .visible) {
             if let product = selected { Button("\(product.displayPrice)のチップをテスト") { selected = nil; Task { await store.testTip(product) } } }
             Button("キャンセル", role: .cancel) { selected = nil }
         }.onDisappear { selected = nil }
    }
}

private struct SandboxSubscriptionView: View {
    @EnvironmentObject private var store: NativeStore
    @ObservedObject var purchases: PurchaseManager
    @State private var selected: Product?
    @State private var loading = false
    @State private var status: String?
    private var plans: [Product] {
        purchases.products.filter {
            guard $0.type == .autoRenewable, let period = $0.subscription?.subscriptionPeriod,
                  period.value == 1 else { return false }
            return ($0.id == "ouchi.premium.monthly" && period.unit == .month) ||
                   ($0.id == "ouchi.premium.annual" && period.unit == .year)
        }.sorted { $0.price < $1.price }
    }
    private func period(_ product: Product) -> String {
        guard let period = product.subscription?.subscriptionPeriod else { return "期間未確認" }
        switch period.unit {
        case .day: return "\(period.value)日"
        case .week: return "\(period.value)週間"
        case .month: return "\(period.value)か月"
        case .year: return "\(period.value)年"
        @unknown default: return "期間未確認"
        }
    }
    var body: some View {
        List {
            Section("Sandbox専用") {
                Text("販売前の動作確認です。実際の請求は有効にしていません。")
                Text("この画面では購入・復元の通信をテストします。お手入れレポートや写真・保証書の保存は別の開発画面で検証中です。有料特典としての提供はまだ開始していません。")
                Text("基本の家電登録、記録、家族共有、書き出しは無料のままです。契約終了後も記録は消えません。")
            }
            Section("Appleから取得したプラン") {
                ForEach(plans) { product in
                    Button { selected = product } label: {
                        VStack(alignment: .leading) {
                            Text(product.displayName)
                            Text("\(product.displayPrice) / \(period(product))・自動更新").font(.caption)
                        }
                    }.disabled(store.busy || loading || store.sandboxEntitlement?.premiumIsCurrent() == true)
                }
                if plans.isEmpty { Text("商品情報を取得してから価格と契約期間を表示します。") }
                Button(loading ? "読込中…" : "商品情報を読み込む") {
                    loading = true; status = nil
                    Task { defer { loading = false }; do { try await purchases.load() } catch { status = "商品情報を取得できませんでした。" } }
                }.disabled(loading || store.busy)
                if let status { Text(status) }
            }
            Section("契約と復元") {
                Text("契約は解約するまで自動更新されます。iPhoneの設定 → 自分の名前 → サブスクリプションから契約の確認・解約ができます。")
                Link("Appleで契約を確認・解約", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                Button("購入を復元・契約を確認") { Task { await store.restoreSandboxPurchases() } }.disabled(store.busy)
                if let progress = store.billingRecoveryStatus {
                    switch progress.state {
                    case .none: Text("\u{7167}\u{5408}\u{4f9d}\u{983c}\u{306f}\u{3042}\u{308a}\u{307e}\u{305b}\u{3093}")
                    case .queued: Text("\u{5c65}\u{6b74}\u{306e}\u{7167}\u{5408}\u{5f85}\u{3061}\u{3067}\u{3059}")
                    case .running: Text("\u{5c65}\u{6b74}\u{3092}\u{7167}\u{5408}\u{4e2d}\u{3067}\u{3059}")
                    case .complete: Text("\u{5c65}\u{6b74}\u{306e}\u{7167}\u{5408}\u{304c}\u{5b8c}\u{4e86}\u{3057}\u{307e}\u{3057}\u{305f}\u{3002}\u{5229}\u{7528}\u{6a29}\u{306f}\u{5951}\u{7d04}\u{72b6}\u{614b}\u{3092}\u{3054}\u{78ba}\u{8a8d}\u{304f}\u{3060}\u{3055}\u{3044}")
                    case .failed: Text("\u{5c65}\u{6b74}\u{306e}\u{7167}\u{5408}\u{306b}\u{78ba}\u{8a8d}\u{304c}\u{5fc5}\u{8981}\u{3067}\u{3059}")
                    case .cancelled: Text("\u{5c65}\u{6b74}\u{306e}\u{7167}\u{5408}\u{306f}\u{4e2d}\u{65ad}\u{3055}\u{308c}\u{307e}\u{3057}\u{305f}")
                    }
                }
                Button("\u{5fa9}\u{5143}\u{306e}\u{72b6}\u{6cc1}\u{3092}\u{78ba}\u{8a8d}") { Task { await store.refreshBillingRecoveryStatus() } }.disabled(store.busy)
                Text("有効な契約がある場合は新規購入を止めます。Webでも同じアカウントの確認済み利用権を使います。")
            }
            if store.sandboxRestoreConfigured {
                Section("別の登録に紐づく購入の復元") {
                    Text("同じAppleアカウントの有効なテスト契約を、この登録で利用できるか確認します。新しい購入は行いません。")
                    Button("復元を確認する") { Task { await store.startSandboxRestore() } }.disabled(store.busy)
                    Button("復元の状況を確認") { Task { await store.refreshSandboxRestore() } }.disabled(store.busy)
                    if let outcome = store.sandboxRestoreOutcome {
                        switch outcome {
                        case .absent: Text("保存された復元はありません。")
                        case .pending: Text("復元の処理待ちです。完了するまで新しい購入をしないでください。")
                        case .complete: Text("復元の処理が完了しました。現在の契約状態をご確認ください。")
                        case .cancelled: Text("未処理の復元を取り消しました。改めて確認できます。")
                        }
                    }
                    if store.sandboxRestoreNeedsAttention {
                        Text("復元の確認が必要です。保存中の情報は残しています。")
                        Button("復元をやり直す準備") { Task { await store.cancelUnreservedSandboxRestore() } }.disabled(store.busy)
                        Text("処理が始まっていない場合のみ、前の復元を取り消します。契約の解約は行いません。確認できない場合は情報を残します。")
                    }
                }
            }
            Section("公開前の準備") {
                Text("正式な利用規約・プライバシーポリシーのリンク、運営者、問い合わせ窓口は公開前に確定します。この画面は正式な販売画面ではありません。")
            }
        }.navigationTitle("プランのテスト").modifier(AdaptiveNavigationTitle())
        .confirmationDialog("自動更新契約のSandboxテスト", isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil } }), titleVisibility: .visible) {
            if let product = selected {
                Button("\(product.displayPrice) / \(period(product))でテスト") {
                    selected = nil; Task { await store.testSubscription(product) }
                }
            }
            Button("キャンセル", role: .cancel) { selected = nil }
        } message: { Text("Sandbox専用です。テスト契約は自動更新されます。") }
        .onDisappear { selected = nil }
    }
}

private struct SandboxReminderSettingsView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var hour = 9
    @State private var minute = 0
    @State private var weekdays = Set(1...7)
    @State private var leadDays = 0
    @State private var includeOverdue = true
    @State private var operation: Task<Void, Never>?
    private let labels = ["日", "月", "火", "水", "木", "金", "土"]
    private var canEdit: Bool { store.reminderSettings?.premiumActive == true && !store.busy }
    var body: some View {
        Form {
            Section {
                Text("テスト用の確認画面です。販売は準備中です。通知は適用ボタンを押したときに、この端末だけに設定します。")
                    .font(.caption).foregroundStyle(.secondary)
                Button(store.busy ? "確認中…" : "最新の設定を読み込む") {
                    operation = Task { await store.loadSandboxReminderSettings() }
                }.disabled(store.busy)
                if let receipt = store.reminderSettings {
                    Text(receipt.premiumActive ? "テスト用の有料利用権を確認済み" : "無料の設定を使用：毎日9時、期限が来たお手入れ")
                    if !receipt.premiumActive, receipt.saved != nil {
                        Text("以前の設定は保存されています。利用権がない間は無料の設定を使用します。")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Section("通知時刻（日本時間）") {
                Picker("時", selection: $hour) { ForEach(0..<24, id: \.self) { Text("\($0)時").tag($0) } }
                Picker("分", selection: $minute) { ForEach(0..<60, id: \.self) { Text("\($0)分").tag($0) } }
            }.disabled(!canEdit)
            Section("通知する曜日") {
                ForEach(1...7, id: \.self) { day in
                    Toggle(labels[day - 1] + "曜日", isOn: Binding(
                        get: { weekdays.contains(day) },
                        set: { if $0 { weekdays.insert(day) } else { weekdays.remove(day) } }
                    ))
                }
            }.disabled(!canEdit)
            Section("お知らせするお手入れ") {
                Picker("何日前から", selection: $leadDays) {
                    Text("当日から").tag(0); Text("1日前から").tag(1)
                    Text("3日前から").tag(3); Text("7日前から").tag(7)
                }
                Toggle("期限を過ぎたものも含める", isOn: $includeOverdue)
            }.disabled(!canEdit)
            Section {
                Button("テスト用の設定を保存") {
                    guard let schedule = try? ReminderSchedule(minuteOfDay: hour * 60 + minute,
                        weekdays: Array(weekdays), leadDays: leadDays, includeOverdue: includeOverdue) else { return }
                    operation = Task { await store.saveSandboxReminderSettings(schedule) }
                }.disabled(!canEdit || weekdays.isEmpty)
                Button("この端末の通知に適用（テスト）") {
                    operation = Task { await store.applySandboxReminderSettings() }
                }.disabled(store.busy || store.reminderSettings == nil)
                if let message = store.message { Text(message).font(.caption) }
            }
        }
        .navigationTitle("通知の細かな設定").modifier(AdaptiveNavigationTitle())
        .onChange(of: store.reminderSettings) { _, receipt in
            let schedule = receipt?.saved ?? receipt?.effective ?? .free
            hour = schedule.minuteOfDay / 60; minute = schedule.minuteOfDay % 60
            weekdays = Set(schedule.weekdays); leadDays = schedule.leadDays; includeOverdue = schedule.includeOverdue
        }
        .onDisappear { operation?.cancel(); operation = nil }
    }
}

private struct ReleasePurchaseRecoveryView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            Form {
                Section { Button("設定に戻る") { dismiss() }.disabled(store.busy) }
                Section("無料で使える機能") {
                    Text("家電の登録、お手入れの記録、基本の共有、記録の書き出しは無料で使えます。契約が終了しても記録は削除しません。")
                }
                Section("契約の確認") {
                    if store.releasePurchaseEnvironment == .sandbox {
                        Text("購入のテスト環境です。実際の請求は発生しません。")
                    }
                    if let rights = store.releaseEntitlement {
                        if rights.premiumIsCurrent(now: context.date, expectedEnvironment: store.releasePurchaseEnvironment ?? .production) {
                            Text("有料プランの利用権を確認しました。")
                            if let expiry = rights.expiresAt {
                                Text("確認した利用期限：\(Date(timeIntervalSince1970: expiry / 1000).formatted(date: .abbreviated, time: .shortened))")
                            }
                        } else { Text("現在有効な有料プランは確認されていません。") }
                    } else { Text("契約状態はまだ確認できていません。通信できる状態で再確認してください。") }
                    Button("契約状態を再確認") { Task { await store.loadReleasePurchaseState() } }.disabled(store.busy)
                    Button("Appleの購入を復元") { Task { await store.restoreReleasePurchases() } }
                        .disabled(store.busy || store.releaseEntitlement == nil)
                    Link("Appleの定期購入を管理", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                    Text("復元は同じおうちメンテアカウントの購入を確認します。別のアカウントへ契約を移す操作ではありません。")
                        .font(.caption)
                }
                if store.releaseNewPurchaseConfigured(subscription: false) {
                    ReleaseTipPurchaseSection(purchases: store.releasePurchases)
                } else {
                    Section("開発を応援する") {
                        Text("任意の応援チップは、まだ受け付けていません。ここから請求は発生しません。")
                    }
                }
                if store.releaseNewPurchaseConfigured(subscription: true), let disclosure = store.releaseSubscriptionDisclosure {
                    ReleaseSubscriptionPurchaseSection(purchases: store.releasePurchases, disclosure: disclosure)
                } else {
                    Section("新しい有料プラン") {
                        Text("新しい有料プランは、まだ受け付けていません。提供する機能と購入画面の確認後に開始します。")
                    }
                }
                Section("規約と問い合わせ") {
                    if let links = store.releasePurchaseDisclosureLinks {
                        Link("利用規約", destination: links.terms)
                        Link("プライバシーポリシー", destination: links.privacy)
                        Link("問い合わせ", destination: links.support)
                    } else {
                        Text("正式な規約・プライバシーポリシー・問い合わせ先を準備しています。公開前の確認が済むまで、新しい購入は受け付けません。")
                    }
                }
                if store.busy { ProgressView("確認しています") }
            }
        }
        .navigationTitle("購入と契約の確認").modifier(AdaptiveNavigationTitle())
        .task {
            await store.loadReleasePurchaseState()
            await store.loadReleasePurchaseProducts()
        }
    }
}

private struct ReleaseSubscriptionPurchaseSection: View {
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

// Uses StoreKit Product.displayPrice; draft yen prices are never purchase options.
private struct ReleaseTipPurchaseSection: View {
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

private struct FormalReminderSettingsView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var selection: FormalReminderSelection?
    private var binding: String { store.accountBindingRevision.uuidString + "/" + store.homeID }
    @State private var hour = 9
    @State private var minute = 0
    @State private var weekdays = Set(1...7)
    @State private var leadDays = 0
    @State private var includeOverdue = true
    @State private var operation: Task<Void, Never>?
    private let labels = ["日", "月", "火", "水", "木", "金", "土"]
    private var canEdit: Bool { selection?.canEdit == true && !store.busy }
    var body: some View {
        Form {
            Section {
                Text("時刻・曜日・何日前から知らせるかを保存できます。保存した設定を使った通知配信は準備中です。")
                    .font(.caption).foregroundStyle(.secondary)
                Button(store.busy ? "確認中…" : "最新の設定を読み込む") {
                    load()
                }.disabled(store.busy)
                if let receipt = selection?.receipt {
                    Text(receipt.premiumActive ? "有料プランの利用権を確認済み" : "無料の設定を使用：毎日9時、期限が来たお手入れ")
                    if !receipt.premiumActive, receipt.saved != nil {
                        Text("以前の設定は保存されています。利用権がない間は無料の設定を使用します。")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Section("通知時刻（日本時間）") {
                Picker("時", selection: $hour) { ForEach(0..<24, id: \.self) { Text("\($0)時").tag($0) } }
                Picker("分", selection: $minute) { ForEach(0..<60, id: \.self) { Text("\($0)分").tag($0) } }
            }.disabled(!canEdit)
            Section("通知する曜日") {
                ForEach(1...7, id: \.self) { day in
                    Toggle(labels[day - 1] + "曜日", isOn: Binding(
                        get: { weekdays.contains(day) },
                        set: { if $0 { weekdays.insert(day) } else { weekdays.remove(day) } }
                    ))
                }
            }.disabled(!canEdit)
            Section("お知らせするお手入れ") {
                Picker("何日前から", selection: $leadDays) {
                    Text("当日から").tag(0); Text("1日前から").tag(1)
                    Text("3日前から").tag(3); Text("7日前から").tag(7)
                }
                Toggle("期限を過ぎたものも含める", isOn: $includeOverdue)
            }.disabled(!canEdit)
            Section {
                Button("設定を保存") {
                    guard let schedule = try? ReminderSchedule(minuteOfDay: hour * 60 + minute,
                        weekdays: Array(weekdays), leadDays: leadDays, includeOverdue: includeOverdue) else { return }
                    load(schedule: schedule)
                }.disabled(!canEdit || weekdays.isEmpty)
                if let message = store.message { Text(message).font(.caption) }
            }
        }
        .navigationTitle("通知の細かな設定").modifier(AdaptiveNavigationTitle())
        .onChange(of: selection?.receipt) { _, receipt in
            let schedule = receipt?.saved ?? receipt?.effective ?? .free
            hour = schedule.minuteOfDay / 60; minute = schedule.minuteOfDay % 60
            weekdays = Set(schedule.weekdays); leadDays = schedule.leadDays; includeOverdue = schedule.includeOverdue
        }
        .task(id: binding) { clear() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { clear() } }
        .onDisappear { clear() }
    }
    private func clear() { operation?.cancel(); operation = nil; selection = nil }
    private func load(schedule: ReminderSchedule? = nil) {
        let expected = binding, prior = selection
        clear()
        operation = Task { @MainActor in
            let result = await store.changeFormalReminderSettings(schedule: schedule, prior: prior)
            guard !Task.isCancelled, expected == binding else { return }
            selection = result
        }
    }

}

private struct FormalReportView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var report: ReportDisplayLease?
    @State private var operation: Task<Void, Never>?
    private var binding: String { store.accountBindingRevision.uuidString + "/" + store.homeID }
    var body: some View {
        Form {
            Section {
                HomePicker()
                Text("登録したお手入れと完了履歴から、住まい全体の状況を集計します。有料プランの利用権を確認して表示します。")
                Button(store.busy ? "確認中…" : "レポートを更新") {
                    let expected = binding
                    report = nil; operation?.cancel()
                    operation = Task { @MainActor in
                        let value = await store.loadFormalReport()
                        guard !Task.isCancelled, expected == binding else { return }
                        report = value
                        guard let value else { return }
                        let delay = max(0, value.deadline.timeIntervalSinceNow)
                        do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                        guard !Task.isCancelled, expected == binding else { return }
                        report = nil
                    }
                }.disabled(store.busy)
            }
            if let report {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    if report.isCurrent(now: context.date) { MaintenanceReportSections(report: report.report) }
                    else { Text("利用権を再確認するため、レポートを更新してください。") }
                }
            }
            if let message = store.message { Section { Text(message) } }
        }
        .navigationTitle("お手入れレポート").modifier(AdaptiveNavigationTitle())
        .task(id: binding) { operation?.cancel(); operation = nil; report = nil }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { operation?.cancel(); operation = nil; report = nil }
        }
        .onDisappear { operation?.cancel(); operation = nil; report = nil }
    }
}

private struct SandboxReportView: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        List {
            Section {
                Text("開発中のテスト用レポートです。販売は有効になっていません。")
                    .font(.caption).foregroundStyle(.secondary)
                HomePicker()
                Button(store.busy ? "確認中…" : "レポートを更新") { Task { await store.loadSandboxReport() } }
                    .disabled(store.busy)
            }
            if let report = store.report {
                MaintenanceReportSections(report: report)
            } else {
                Section { Text("表示する記録はまだありません。更新時にサーバーでテスト用利用権と住まいへのアクセスを確認します。") }
            }
        }.navigationTitle("お手入れレポート").modifier(AdaptiveNavigationTitle())
    }
}

private struct MaintenanceReportSections: View {
    let report: MaintenanceReport
    var body: some View { Group {
                Section("今のお手入れ") {
                    LabeledContent("住まい", value: report.homeName)
                    LabeledContent("集計日", value: report.today)
                    LabeledContent("期限を過ぎた項目", value: "\(report.overdue)件")
                    LabeledContent("今日の項目", value: "\(report.dueToday)件")
                }
                Section("6か月のお手入れ実績") {
                    ForEach(report.months, id: \.month) { month in
                        LabeledContent(month.month, value: "\(month.completed)件")
                    }
                }
                Section("製品ごとの今月の実績") {
                    ForEach(report.perProduct, id: \.productId) { product in
                        LabeledContent(product.name, value: "\(product.completedThisMonth)件")
                    }
                }
                Section { Text(report.explanation).font(.caption).foregroundStyle(.secondary) }
    } }
}

#if DEBUG
struct ReportPreviewView: View {
    private let report: MaintenanceReport? = try? JSONDecoder().decode(MaintenanceReport.self, from: Data(#"{"homeId":"11111111-1111-4111-8111-111111111111","homeName":"わが家（サンプル）","generatedAt":"2026-10-11T00:00:00.000Z","today":"2026-10-11","productCount":1,"taskCount":2,"overdue":1,"dueToday":1,"months":[{"month":"2026-05","completed":1},{"month":"2026-06","completed":2},{"month":"2026-07","completed":3},{"month":"2026-08","completed":4},{"month":"2026-09","completed":5},{"month":"2026-10","completed":6}],"perProduct":[{"productId":"22222222-2222-4222-8222-222222222222","name":"空気清浄機（サンプル）","completedThisMonth":6,"overdue":1,"dueToday":1}],"explanation":"登録したお手入れと完了履歴の集計です。故障予測ではありません。"}"#.utf8))
    var body: some View {
        NavigationStack {
            List {
                Section { Text("画面確認用のサンプルです。実際の記録ではありません。") }
                if let report { MaintenanceReportSections(report: report) }
            }.navigationTitle("お手入れレポート").modifier(AdaptiveNavigationTitle())
        }
    }
}
#endif

private struct FormalNativePushView: View {
    @EnvironmentObject private var store: NativeStore
    @EnvironmentObject private var notifications: RemoteNotificationDelegate
    @Environment(\.scenePhase) private var scenePhase
    @State private var selection: FormalNativePushSelection?
    @State private var status = "この画面では登録状態をまだ確認していません。"
    @State private var operation: Task<Void, Never>?
    private var binding: String { store.accountBindingRevision.uuidString + "/" + store.homeID }
    private func clear() { operation?.cancel(); operation = nil; selection = nil; status = "この画面では登録状態をまだ確認していません。" }
    private func change(disable: Bool, lookup: Bool = false) {
        let prior = disable ? selection : nil
        operation?.cancel()
        if !disable { selection = nil }
        status = "登録状態を確認しています。"
        operation = Task {
            let result: FormalNativePushChange?
            if disable { result = await store.changeFormalNativePush(prior: prior) }
            else { result = await store.changeFormalNativePush(lookup: lookup) { try await notifications.requestToken() } }
            guard !Task.isCancelled else { return }
            if let result {
                switch result {
                case .registered(let value): selection = value; status = "この端末の通知先の登録を確認済みです。"
                case .disabled: selection = nil; status = "この端末の通知先は停止しています。"
                case .absent: selection = nil; status = "現在のログインで登録された通知先は見つかりませんでした。"
                }
            } else { status = "登録状態を確認できませんでした。再度お試しください。" }
        }
    }
    var body: some View {
        Form {
            Section("この端末の通知先") {
                Text(status)
                Button("現在の登録状態を確認") { change(disable: false, lookup: true) }.disabled(store.busy || !store.signedIn)
                Button("通知を許可して登録を確認") { change(disable: false) }.disabled(store.busy || !store.signedIn)
                Button("この端末の通知先を停止", role: .destructive) { change(disable: true) }.disabled(store.busy || selection == nil)
                Text("登録の確認は無料です。通知の配信は準備中です。").font(.caption)
            }
        }.navigationTitle("この端末への通知").modifier(AdaptiveNavigationTitle())
        .onChange(of: binding) { _, _ in clear() }
        .onChange(of: scenePhase) { _, phase in if phase == .background { clear() } }
        .onDisappear { clear() }
    }
}

private struct DevelopmentRemoteNotificationView: View {
    @EnvironmentObject private var store: NativeStore
    @EnvironmentObject private var notifications: RemoteNotificationDelegate
    var body: some View {
        Form {
            Section("この端末の通知先") {
                Text(store.developmentRemoteNotificationsRegistered ? "登録済み" : "未登録")
                Button("通知を許可して登録する") {
                    Task { await store.registerDevelopmentRemoteNotifications { try await notifications.requestToken() } }
                }.disabled(store.busy)
                Button("この端末の通知先を停止する") {
                    Task { await store.disableDevelopmentRemoteNotifications() }
                }.disabled(store.busy || !store.developmentRemoteNotificationsRegistered)
                Text("通知先の登録と停止を確認するテストです。予定に基づく通知配信はまだ開始していません。通常版ではこの画面を表示しません。").font(.caption)
            }
        }.navigationTitle("iPhone通知のテスト").modifier(AdaptiveNavigationTitle())
    }
}

private struct DevelopmentLifecycleView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var password = ""
    @State private var reenrolling = false
    @State private var confirming = false
    var body: some View {
        Form {
            Section("独立したテスト環境") {
                Text("テスト用アカウントだけで操作してください。アプリの利用を終了してテスト記録を削除します。個人情報を含む完全なアカウント削除ではなく、共通のログイン情報は残ります。必要なテスト記録は先に書き出してください。")
                Picker("操作", selection: $reenrolling) {
                    Text("利用を終了").tag(false)
                    Text("明示的に再登録").tag(true)
                }
                SecureField("現在のパスワード", text: $password).textContentType(.password)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Button(reenrolling ? "再登録を確認" : "利用終了を確認", role: reenrolling ? nil : .destructive) { confirming = true }
                    .disabled(store.busy || password.isEmpty || !store.developmentLifecycleConfigured)
            }
        }.navigationTitle("アカウント処理のテスト").modifier(AdaptiveNavigationTitle())
        .confirmationDialog(reenrolling ? "新しく再登録しますか？" : "テスト用アカウントの利用を終了しますか？", isPresented: $confirming, titleVisibility: .visible) {
            Button(reenrolling ? "再登録する" : "利用を終了", role: reenrolling ? nil : .destructive) {
                let secret = password; password = ""
                let enrolling = reenrolling
                Task { await store.testAccountLifecycle(password: secret, reenrolling: enrolling, confirmed: true) }
            }
            Button("キャンセル", role: .cancel) {}
        } message: { Text(reenrolling ? "過去の記録や古いログインのアクセス権は復元しません。" : "所有するテスト用の住まいと共有への参加情報を削除します。元に戻せません。Appleの定期購入は別途管理してください。") }
        .onDisappear { password = ""; confirming = false }
    }
}

private struct AttachmentView: View {
    @EnvironmentObject private var store: NativeStore
    private let fixedProductID: String?
    @State private var productID = ""
    init(productID: String? = nil) {
        fixedProductID = productID
        _productID = State(initialValue: productID ?? "")
    }
    private struct SelectionBinding: Hashable {
        let product: String
        let home: String
        let revision: UUID
    }
    private var selectionBinding: SelectionBinding {
        SelectionBinding(product: productID, home: store.homeID, revision: store.accountBindingRevision)
    }
    private var hasSelectedProduct: Bool {
        store.household?.products(in: store.homeID).contains(where: { $0.id.lowercased() == productID.lowercased() }) == true
    }
    @State private var choosingFile = false
    @State private var fileSelectionBinding: SelectionBinding?
    @State private var bytes: Data?
    @State private var mime = ""
    @State private var filename = ""
    @State private var attachmentID = UUID()
    @State private var confirmUpload = false
    @State private var confirmRemoval = false
    @State private var removalID: UUID?
    @State private var pendingRemoval: PendingAttachmentRemoval?
    @State private var confirmRetryRemoval = false
    @State private var savedAttachments: [DevelopmentAttachmentAPI.StoredAttachment] = []
    @State private var nextAttachment: UUID?
    @State private var listingLoading = false
    @State private var listingGeneration = 0
    private func loadAttachmentPage(reset: Bool) async {
        guard !listingLoading, let product = UUID(uuidString: productID) else { return }
        let selected = productID, home = store.homeID, expected = listingGeneration, bindingRevision = store.accountBindingRevision
        let cursor = reset ? nil : nextAttachment
        listingLoading = true
        let page = await store.pageDevelopmentAttachments(product: product, after: cursor)
        guard !Task.isCancelled, selected == productID, home == store.homeID, expected == listingGeneration, bindingRevision == store.accountBindingRevision else { return }
        listingLoading = false
        guard let page else { return }
        let existing = reset ? [] : savedAttachments
        guard Set(existing.map(\.id)).isDisjoint(with: Set(page.items.map(\.id))) else { status = "一覧が更新されました。画面を開き直してください。"; return }
        savedAttachments = existing + page.items; nextAttachment = page.next
    }

    @State private var attachmentUsage: DevelopmentAttachmentAPI.Usage?
    @State private var status: String?
    var body: some View {
        Form {
            if pendingRemoval != nil {
                Section("確認待ちの削除") {
                    Text("前回の削除結果を受け取れていません。同じファイルの削除を再確認できます。製品が削除されていても再確認できます。")
                    Button("削除結果を再確認", role: .destructive) { confirmRetryRemoval = true }
                        .disabled(store.busy)
                }
            }
            Section(store.developmentLifecycleConfigured ? "独立したテスト環境専用" : "保存について") {
                if store.developmentLifecycleConfigured {
                    Text("実際の写真や個人情報を含む保証書を使わず、テスト用ファイルで確認してください。公開版の保管機能はまだ有効にしていません。")
                } else {
                    Text("新しいファイルの保存には有料プランが必要です。契約終了後も、住まいへのアクセス権がある保存済みファイルを取得できます。")
                }
                Text("1ファイル5MiB、合計100MiB・100ファイルまで。JPEG・PNG・PDFに対応します。")
            }
            if let usage = attachmentUsage {
                Section("このアカウントの保存容量") {
                    Text("\(usage.usedBytes / 1024) KiB / \(usage.limitBytes / 1024) KiB・\(usage.usedFiles) / \(usage.limitFiles)ファイル")
                    if usage.reservedFiles > 0 { Text("確認待ち: \(usage.reservedFiles)ファイル。確認待ちの容量も上限に含まれます。") }
                    Text("家族が保存したファイルは、保存した人の容量に含まれます。")
                }
            }
            Section("添付先") {
                if fixedProductID != nil {
                    if let selected = store.household?.products(in: store.homeID).first(where: { $0.id.lowercased() == productID.lowercased() }) {
                        Text(selected.name)
                        Text("\(selected.maker) \(selected.modelNumber)").font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text("この製品を現在の住まいで確認できません。製品画面から開き直してください。")
                    }
                } else { Picker("製品", selection: $productID) {
                    Text("選択してください").tag("")
                    ForEach(store.household?.products(in: store.homeID) ?? []) { product in
                        Text(product.name).tag(product.id)
                    }
                }.disabled(bytes != nil || store.busy) }
            }
            if !savedAttachments.isEmpty {
                Section("保存済みのファイル") {
                    ForEach(savedAttachments) { attachment in
                        Button {
                            Task { await store.exportDevelopmentAttachment(attachment.id) }
                        } label: {
                            VStack(alignment: .leading) {
                                Text(attachment.mime == "application/pdf" ? "PDFを取得して書き出す" : "写真を取得して書き出す")
                                Text("\(attachment.size)バイト・\(attachment.createdAt)").font(.caption)
                            }
                        }.disabled(store.busy)
                        Button("このファイルを削除", role: .destructive) {
                            removalID = attachment.id; confirmRemoval = true
                        }.disabled(store.busy)
                    }
                    if nextAttachment != nil {
                        Button(listingLoading ? "読込中…" : "続きを読み込む") { Task { await loadAttachmentPage(reset: false) } }.disabled(listingLoading || store.busy)
                    }
                    Text("保存済みファイルの取得には、新しい購入は必要ありません。住まいへのアクセス権を確認します。")
                    if let file = store.attachmentExportURL { ShareLink("ファイルを共有・保存", item: file) }
                }
            }
            Section("ファイル") {
                Text("写真は撮影情報を除いたコピーに変換して保存します（JPEGは再圧縮されます）。写真に写った文字やPDFの内容は変更しません。氏名・住所などが含まれていないか確認してください。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button(store.developmentLifecycleConfigured ? "テスト用ファイルを選択" : "ファイルを選択") {
                    fileSelectionBinding = selectionBinding
                    choosingFile = true
                }.disabled(bytes != nil || store.busy || UUID(uuidString: productID) == nil || !hasSelectedProduct)
                if let bytes {
                    Text(filename)
                    Text("\(bytes.count)バイト / 添付ID: \(attachmentID.uuidString)").font(.caption)
                    Text("送信を確認したファイルは、保存完了の確認まで端末内に保持します。ログアウトすると端末の再送用ファイルを消去します。")
                    Button("保存・同じIDで再確認") { confirmUpload = true }.disabled(store.busy || !hasSelectedProduct)
                }
                if let status { Text(status) }
            }
        }.navigationTitle(store.developmentLifecycleConfigured ? "添付のテスト" : "写真・保証書")
        .fileImporter(isPresented: $choosingFile, allowedContentTypes: [.jpeg, .png, .pdf]) { result in
            guard fileSelectionBinding == selectionBinding else { return }
            fileSelectionBinding = nil
            do {
                let file = try result.get()
                let access = file.startAccessingSecurityScopedResource()
                defer { if access { file.stopAccessingSecurityScopedResource() } }
                let count = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max
                guard count > 0, count <= 5 * 1024 * 1024 else { throw CloudError.invalidInput }
                let type = UTType(filenameExtension: file.pathExtension)
                let media = type == .jpeg ? "image/jpeg" : type == .png ? "image/png" : type == .pdf ? "application/pdf" : ""
                guard !media.isEmpty else { throw CloudError.invalidInput }
                let data = try Data(contentsOf: file)
                guard !data.isEmpty, data.count <= 5 * 1024 * 1024 else { throw CloudError.invalidInput }
                let prepared = media == "application/pdf" ? data : try AttachmentImagePreparation.sanitizedCopy(data, mime: media)
                bytes = prepared; mime = media; filename = file.lastPathComponent; attachmentID = UUID(); status = nil
            } catch { status = "5MiB以下のJPEG・PNG・PDFを選択してください。写真は24メガピクセル以下で、変換後も5MiB以下である必要があります。" }
        }
        .confirmationDialog(store.developmentLifecycleConfigured ? "テスト環境へこのファイルを保存しますか？" : "このファイルを保存しますか？", isPresented: $confirmUpload, titleVisibility: .visible) {
            Button(store.developmentLifecycleConfigured ? "テスト用ファイルを送信" : "保存する") {
                guard let bytes, let product = UUID(uuidString: productID) else { return }
                let id = attachmentID, media = mime
                let home = store.homeID, selected = productID, expected = listingGeneration, bindingRevision = store.accountBindingRevision
                Task {
                    if await store.uploadDevelopmentAttachment(product: product, attachment: id, bytes: bytes, mime: media, confirmed: true) {
                        guard !Task.isCancelled, home == store.homeID, selected == productID, expected == listingGeneration, bindingRevision == store.accountBindingRevision, id == attachmentID else { return }
                        self.bytes = nil; filename = ""; mime = ""
                        await loadAttachmentPage(reset: true)
                        guard !Task.isCancelled, home == store.homeID, expected == listingGeneration, bindingRevision == store.accountBindingRevision else { return }
                        let usage = await store.developmentAttachmentUsage()
                        guard !Task.isCancelled, home == store.homeID, expected == listingGeneration, bindingRevision == store.accountBindingRevision else { return }
                        attachmentUsage = usage
                    }
                }
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("写真の撮影情報は除きますが、写っている氏名・住所やPDFの内容はそのまま保存されます。不要な情報が含まれていないことを確認してください。")
        }
        .confirmationDialog("確認待ちのファイル削除を再確認しますか？", isPresented: $confirmRetryRemoval, titleVisibility: .visible) {
            Button("同じファイルの削除を再確認", role: .destructive) {
                guard let pending = pendingRemoval else { return }
                let home = store.homeID, expected = listingGeneration, bindingRevision = store.accountBindingRevision
                Task {
                    guard await store.removeDevelopmentAttachment(pending.id, product: pending.product, confirmed: true),
                          !Task.isCancelled, home == store.homeID, expected == listingGeneration else { return }
                    pendingRemoval = nil
                    await loadAttachmentPage(reset: true)
                    guard !Task.isCancelled, home == store.homeID, expected == listingGeneration, bindingRevision == store.accountBindingRevision else { return }
                        let usage = await store.developmentAttachmentUsage()
                        guard !Task.isCancelled, home == store.homeID, expected == listingGeneration, bindingRevision == store.accountBindingRevision else { return }
                        attachmentUsage = usage
                }
            }
            Button("キャンセル", role: .cancel) {}
        } message: { Text("未完了なら削除を再実行します。削除済みなら結果を確認します。元に戻せません。") }
        .confirmationDialog("このファイルを削除しますか？", isPresented: $confirmRemoval, titleVisibility: .visible) {
            Button("ファイルを削除", role: .destructive) {
                guard let id = removalID, let product = UUID(uuidString: productID) else { return }
                let selected = productID, home = store.homeID, expected = listingGeneration, bindingRevision = store.accountBindingRevision
                removalID = nil
                Task {
                    let removed = await store.removeDevelopmentAttachment(id, product: product, confirmed: true)
                    guard !Task.isCancelled, selected == productID, home == store.homeID, expected == listingGeneration, bindingRevision == store.accountBindingRevision else { return }
                    pendingRemoval = await store.resumeDevelopmentAttachmentRemoval()
                    guard !Task.isCancelled, selected == productID, home == store.homeID, expected == listingGeneration, bindingRevision == store.accountBindingRevision, removed else { return }
                    await loadAttachmentPage(reset: true)
                    guard !Task.isCancelled, home == store.homeID, expected == listingGeneration, bindingRevision == store.accountBindingRevision else { return }
                        let usage = await store.developmentAttachmentUsage()
                        guard !Task.isCancelled, home == store.homeID, expected == listingGeneration, bindingRevision == store.accountBindingRevision else { return }
                        attachmentUsage = usage
                }
            }
            Button("キャンセル", role: .cancel) { removalID = nil }
        } message: { Text("元に戻せません。保存した人か住まいの所有者が削除できます。購入が終了していても削除できます。") }
        .task(id: selectionBinding) {
            confirmRemoval = false; removalID = nil; confirmRetryRemoval = false; pendingRemoval = nil
            listingGeneration += 1
            let expected = listingGeneration, selected = productID, home = store.homeID, bindingRevision = store.accountBindingRevision
            let recoveredRemoval = await store.resumeDevelopmentAttachmentRemoval()
            guard !Task.isCancelled, expected == listingGeneration, bindingRevision == store.accountBindingRevision, selected == productID, home == store.homeID else { return }
            pendingRemoval = recoveredRemoval
            listingLoading = false; nextAttachment = nil
            savedAttachments = []; attachmentUsage = nil; store.clearDevelopmentAttachmentExport()
            if bytes == nil, let pending = await store.resumeDevelopmentAttachment() {
                guard !Task.isCancelled, expected == listingGeneration, bindingRevision == store.accountBindingRevision, selected == productID, home == store.homeID else { return }
                let pendingProduct = pending.product.uuidString.lowercased()
                if let fixedProductID, fixedProductID.lowercased() != pendingProduct {
                    status = "別の製品への保存が確認待ちです。設定の写真・保証書の保存画面から、先にそのファイルの結果を確認してください。"
                    return
                }
                guard store.household?.products(in: store.homeID).contains(where: { $0.id.lowercased() == pendingProduct }) == true else {
                    status = "確認待ちのファイルは別の住まいの製品に保存予定です。添付先の住まいに切り替えてから、この画面を開き直してください。製品が削除された場合は、サーバーの予約状態を確認する必要があります。"
                    return
                }
                bytes = pending.bytes; mime = pending.mime; filename = "保存結果を確認中のファイル"; attachmentID = pending.id
                if productID.lowercased() != pendingProduct { productID = pendingProduct; return }
            }
            let usage = await store.developmentAttachmentUsage()
            guard !Task.isCancelled, expected == listingGeneration, bindingRevision == store.accountBindingRevision, selected == productID, home == store.homeID else { return }
            attachmentUsage = usage
            await loadAttachmentPage(reset: true)
        }
        .onChange(of: store.homeID) { _, _ in
            choosingFile = false; fileSelectionBinding = nil
            listingGeneration += 1; listingLoading = false; nextAttachment = nil; savedAttachments = []
            if bytes == nil, fixedProductID == nil { productID = "" }
            confirmUpload = false; confirmRemoval = false; removalID = nil
            confirmRetryRemoval = false; pendingRemoval = nil; attachmentUsage = nil
            store.clearDevelopmentAttachmentExport()
            status = "住まいを変更しました。添付先の製品を確認してください。"
        }
        .onChange(of: store.accountBindingRevision) { _, _ in
            choosingFile = false; fileSelectionBinding = nil
            listingGeneration += 1; listingLoading = false; nextAttachment = nil
            bytes = nil; filename = ""; mime = ""; attachmentID = UUID()
            savedAttachments = []; attachmentUsage = nil
            confirmUpload = false; confirmRemoval = false; removalID = nil
            confirmRetryRemoval = false; pendingRemoval = nil
            store.clearDevelopmentAttachmentExport()
            status = "アカウントの状態が変わりました。保存先とファイルをもう一度確認してください。"
        }
        .onDisappear { choosingFile = false; fileSelectionBinding = nil; listingGeneration += 1; listingLoading = false; nextAttachment = nil; bytes = nil; filename = ""; mime = ""; confirmUpload = false; confirmRemoval = false; removalID = nil; confirmRetryRemoval = false; pendingRemoval = nil; savedAttachments = []; attachmentUsage = nil; store.clearDevelopmentAttachmentExport() }
    }
}

private struct FormalChannelView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var localMessage: String?
    @State private var confirmLocalStop = false
    @State private var selection: FormalChannelSelection?
    @State private var chosen: NotificationChannel = .both
    @State private var operation: Task<Void, Never>?
    private var binding: String { store.accountBindingRevision.uuidString + "/" + store.homeID }
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            Form {
                Section {
                    Text("無料で選べます。このアカウントの定期通知に反映します。iPhoneへの配信は準備中です。")
                    Button("受け取り先を確認") { load() }.disabled(store.busy)
                }
                Section("受け取り先") {
                    Picker("受け取り先", selection: $chosen) {
                        Text("WebとiPhoneの両方").tag(NotificationChannel.both)
                        Text("Webだけ").tag(NotificationChannel.web)
                        Text("iPhoneだけ").tag(NotificationChannel.native).disabled(selection?.receipt.nativeRegistered != true)
                    }
                    .disabled(selection?.current != true || store.busy)
                    if selection?.receipt.nativeRegistered == false { Text("iPhoneだけを選ぶには、iPhone版で通知先の登録が必要です。") }
                    Button("受け取り先を保存") { load(save: true) }
                        .disabled(selection?.current != true || store.busy || chosen == .native && selection?.receipt.nativeRegistered != true)
                }
                Section {
                    Text("iPhoneだけを選ぶと、このアカウントのすべてのWeb端末への定期通知を止めます。届いた通知と、別の端末内に予約済みの通知は取り消せません。")
                    Text("この端末内の朝9時の通知は別の設定です。WebやiPhoneへの遠隔配信を使う前に、この端末内の予約通知を停止できます。遠隔配信はまだ準備中のため、停止すると通知が届かなくなる場合があります。")
                    Button("この端末内の予約通知を止める", role: .destructive) { confirmLocalStop = true }.disabled(store.busy)
                    if let message = localMessage { Text(message).font(.caption) }
                }
            }
        }
        .navigationTitle("通知の受け取り先").modifier(AdaptiveNavigationTitle())
        .confirmationDialog("この端末内の予約通知を停止しますか？", isPresented: $confirmLocalStop, titleVisibility: .visible) {
            Button("予約通知を停止", role: .destructive) {
                operation?.cancel()
                let expected = binding
                localMessage = nil
                operation = Task { @MainActor in
                    await store.stopLocalPendingForRemoteDelivery()
                    guard !Task.isCancelled, expected == binding else { return }
                    localMessage = store.message
                }
            }
            Button("キャンセル", role: .cancel) { }
        } message: { Text("このアカウントがこの端末内に予約した通知を止めます。届いた通知と他の端末の予約はそのままです。遠隔配信を有効にする操作ではありません。") }
        .task(id: binding) { clear() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { clear() } }
        .onDisappear { clear() }
    }
    private func clear() { operation?.cancel(); operation = nil; selection = nil; chosen = .both; confirmLocalStop = false; localMessage = nil }
    private func load(save: Bool = false) {
        let expected = binding, prior = selection, requested = chosen
        clear()
        operation = Task { @MainActor in
            let result = await store.changeFormalChannel(save ? requested : nil, prior: prior)
            guard !Task.isCancelled, expected == binding else { return }
            selection = result; chosen = result?.receipt.channel ?? .both; localMessage = store.message
        }
    }
}

private struct ExplicitEnrollmentView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var state: EnrollmentState?
    @State private var password = ""
    @State private var consent = false
    @State private var operation: Task<Void, Never>?
    var body: some View {
        Form {
            Section {
                Text("このログインをおうちメンテで使うことに同意して登録します。無料です。有料契約は行いません。")
                Button("登録状態を確認") { run() }.disabled(store.busy)
            }
            if let state {
                if state.enrolled {
                    Section { Text("このログインの登録を確認しました。")
                        Button("記録を読み込み直す") { Task { await store.reload() } }.disabled(store.busy)
                    }
                } else {
                    Section("無料で登録する") {
                        SecureField("本人確認のパスワード", text: $password).textContentType(.password)
                        Toggle("このログインをおうちメンテで使うことに同意します", isOn: $consent)
                        Text("以前に削除した記録や、別のアプリの購入権は引き継ぎません。")
                        Button("無料で登録する") { run(register: true) }.disabled(store.busy || !consent || password.isEmpty || password.count > 1024)
                    }.disabled(store.busy)
                }
            }
        }.navigationTitle("おうちメンテへの登録").modifier(AdaptiveNavigationTitle())
         .task(id: store.accountBindingRevision) { clear() }
         .onChange(of: scenePhase) { _, phase in if phase != .active { clear() } }
         .onDisappear { clear() }
    }
    private func clear() { operation?.cancel(); operation = nil; state = nil; password = ""; consent = false }
    private func run(register: Bool = false) {
        guard !store.busy, !register || consent else { return }
        let proof = register ? password : nil, expected = store.accountBindingRevision
        clear()
        operation = Task { @MainActor in
            let result = await store.confirmExplicitEnrollment(password: proof)
            guard !Task.isCancelled, expected == store.accountBindingRevision else { return }
            state = result
        }
    }
}
