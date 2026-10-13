import SwiftUI
import OuchiCore
#if DEBUG
import Security
import Darwin
#endif

/// Prepared screen. Shipping navigation remains disabled until actual erasure,
/// finite retention, timing disclosure and authenticated provider are ready.
@MainActor struct AccountClosureReviewView: View {
    @Environment(\.dynamicTypeSize) private var textSize
    let accountID: UUID
    let epochID: UUID
    let revision: UUID
    let available: Bool
    let processingExplanation: String
    let token: () -> String?
    let vault: AccountClosureReviewVault
    let api: AccountClosureReviewAPI
    @State private var references: [AccountClosureReviewBinding] = []
    @State private var selected: AccountClosureReviewBinding?
    @State private var flow: AccountClosureReviewFlow?
    @State private var receipt: AccountClosureReviewReceipt?
    @State private var password = ""
    @FocusState private var passwordFocused: Bool
    @State private var consent = false
    @State private var message: String?
    @State private var loaded = false
    @State private var busy = false
    @State private var confirmRequest = false
    @State private var confirmCancel = false
    @State private var operation: Task<Void, Never>?
    private struct Context: Hashable { let accountID: UUID; let epochID: UUID; let revision: UUID }
    private var context: Context { .init(accountID: accountID, epochID: epochID, revision: revision) }
    @State private var active: Context?
    private var ready: Bool { available && !processingExplanation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var requestHint: String? {
        if !loaded { return "保存した依頼の読み込みを確認してください。" }
        if selected == nil && !references.isEmpty { return "先に保存した依頼の状況を確認してください。" }
        if receipt?.state == .reviewRequired && flow?.resultUnconfirmed == false { return "この依頼は受付済みです。新しい依頼を送る前に状況を確認してください。" }
        if password.isEmpty { return "現在のパスワードを入力してください。" }
        if !consent { return "受付と削除完了が別であることを確認し、確認欄を選んでください。" }
        return nil
    }
    var body: some View {
        ScrollViewReader { proxy in
        Form {
            Section("退会を依頼する前に") {
                Text("依頼の受付だけでは、アカウントや記録の削除は完了しません。家族の回答がなくても依頼できます。")
                Text("必要な記録は、設定の書き出し機能で保存してください。")
                Text("Appleの定期購入は、退会を依頼しても自動では解約されません。")
                Link("Appleの定期購入を確認", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                if !processingExplanation.isEmpty { Text(processingExplanation) }
                if !ready { Text("現在、退会依頼の送信・オンライン確認は準備中です。") }
            }
            Section("この端末に保存した依頼") {
                if loaded { Text("保存された依頼：\(references.count)件").accessibilityIdentifier("closure-review.reference-count") }
                if loaded && references.isEmpty { Text("保存した依頼はありません。サーバー側の退会状況を示すものではありません。") }
                ForEach(references, id: \.submissionID) { reference in
                    VStack(alignment: .leading, spacing: 8) {
                        Text("依頼番号：" + String(reference.submissionID.uuidString.suffix(8)))
                        Button("この依頼を確認") { check(reference) }
                            .accessibilityIdentifier("closure-review.check." + reference.submissionID.uuidString.lowercased())
                            .disabled(busy || !ready)
                    }
                }
            }
            if let selected {
                Section("選択した依頼の状況") {
                    Text("選択した依頼：" + String(selected.submissionID.uuidString.suffix(8)))
                        .accessibilityIdentifier("closure-review.selected")
                        .id("closure-review.result")
                    if let receipt {
                        Text(receipt.state == .cancelled ? "この退会依頼は取り消されています。" : "退会依頼の受付を確認しました。削除処理はまだ完了していません。")
                            .accessibilityIdentifier("closure-review.status")
                    }
                    if flow?.resultUnconfirmed == true { Text("最新の状況は未確認です。通信できる状態で、この依頼を再確認してください。") }
                    if receipt?.state == .reviewRequired && flow?.resultUnconfirmed == false {
                        Button("この退会依頼を取り消す") { confirmCancel = true }.disabled(busy || !ready)
                            .accessibilityIdentifier("closure-review.cancel")
                    }
                }
            }
            Section("本人確認して依頼") {
                SecureField("現在のパスワード", text: $password)
                    .focused($passwordFocused)
                    .accessibilityIdentifier("closure-review.password")
                    .textContentType(.password).autocorrectionDisabled()
                    .disabled(busy || !ready)
                Toggle("受付と削除完了が別であることを確認しました", isOn: $consent)
                    .accessibilityIdentifier("closure-review.consent")
                    .disabled(busy || !ready)
                if ready, let requestHint { Text(requestHint).font(.footnote).accessibilityIdentifier("closure-review.request-hint") }
                Button(receipt?.state == .cancelled ? "新しい退会依頼を送る" : "退会を依頼する", role: .destructive) { confirmRequest = true }
                    .accessibilityIdentifier("closure-review.submit")
                    .disabled(busy || !ready || !loaded || !consent || password.isEmpty || (selected == nil && !references.isEmpty) || (receipt?.state == .reviewRequired && flow?.resultUnconfirmed == false))
            }
            if let message { Section("確認結果") { Text(message).id("closure-review.message") } }
            if busy { Section { ProgressView("依頼の状況を確認しています") } }
        }
        .navigationTitle("退会の依頼")
        .navigationBarTitleDisplayMode(textSize.isAccessibilitySize ? .inline : .automatic)
        .safeAreaInset(edge: .bottom) {
            if passwordFocused {
            HStack {
                Spacer()
                Button("入力を完了") { passwordFocused = false }
                    .accessibilityIdentifier("closure-review.keyboard-done")
            }
            .padding(8).background(.background)
            }
        }
        .confirmationDialog("退会を依頼しますか？", isPresented: $confirmRequest, titleVisibility: .visible) {
            Button("退会を依頼", role: .destructive) { send() }
            Button("戻る", role: .cancel) {}
        } message: { Text("必要な記録を保存してください。この操作だけで削除が完了することはありません。") }
        .confirmationDialog("選択した退会依頼を取り消しますか？", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("依頼を取り消す") { cancel() }
            Button("戻る", role: .cancel) {}
        } message: { Text("すでに削除処理へ移った依頼は、この画面からは取り消せません。結果を確認してください。") }
        .task(id: context) {
            operation?.cancel(); operation = nil; active = context
            references = []; selected = nil; receipt = nil; password = ""; consent = false; busy = false; loaded = false; message = nil
            passwordFocused = false
            confirmRequest = false; confirmCancel = false
            let next = AccountClosureReviewFlow(api: api, persist: { try vault.prepare($0) })
            next.bind(accountID: accountID, epochID: epochID, revision: revision); flow = next
            do { references = try vault.references(accountID: accountID, epochID: epochID); loaded = true }
            catch { message = "保存した依頼を読み込めません。端末を利用できる状態で、もう一度開いてください。送信は行っていません。" }
        }
        .onDisappear {
            operation?.cancel(); operation = nil; active = nil; password = ""; consent = false
            passwordFocused = false
            flow?.bind(accountID: nil, epochID: nil, revision: nil)
            selected = nil; receipt = nil; busy = false
        }
        .onChange(of: receipt) { _, value in
            if value != nil { withAnimation { proxy.scrollTo("closure-review.result", anchor: .top) } }
        }
        .onChange(of: message) { _, value in
            if value != nil { withAnimation { proxy.scrollTo("closure-review.message", anchor: .top) } }
        }
        }
    }
    private func check(_ reference: AccountClosureReviewBinding) {
        guard references.contains(reference), ready, !busy, active == context, let flow else { return }
        selected = reference; receipt = nil
        flow.bind(accountID: accountID, epochID: epochID, revision: revision, restored: reference)
        run { bearer in try await flow.recover(token: bearer) }
    }
    private func send() {
        guard consent, !password.isEmpty, let flow else { return }
        let entered = password; password = ""; consent = false
        passwordFocused = false
        run { bearer in
            if flow.binding == nil || (flow.receipt?.state == .cancelled && !flow.resultUnconfirmed) {
                return try await flow.startNew(password: entered, token: bearer)
            }
            // Reconcile the same saved submission before retrying an unknown result.
            let current = try await flow.recover(token: bearer)
            if current != nil { return current }
            return try await flow.retry(password: entered, token: bearer)
        }
    }
    private func cancel() {
        guard selected != nil, let flow else { return }
        run { bearer in try await flow.cancel(token: bearer) }
    }
    private func run(_ action: @escaping @MainActor (String) async throws -> AccountClosureReviewReceipt?) {
        guard ready, !busy, active == context, let flow else { return }
        guard let bearer = token() else { message = "ログイン状態を確認してください。依頼は送信していません。"; return }
        let expected = context; busy = true; message = nil
        operation?.cancel()
        operation = Task {
            defer { if active == expected { busy = false } }
            do {
                let value = try await action(bearer)
                guard !Task.isCancelled, active == expected else { return }
                selected = flow.binding; receipt = value
                message = value == nil ? "この番号に対応する退会依頼は見つかりませんでした。削除完了を示すものではありません。" : nil
            } catch {
                guard !Task.isCancelled, active == expected else { return }
                selected = flow.binding; receipt = flow.receipt
                message = "結果を確認できません。依頼番号は保持しています。通信できる状態で同じ依頼を再確認してください。"
            }
            guard !Task.isCancelled, active == expected else { return }
            do { references = try vault.references(accountID: expected.accountID, epochID: expected.epochID); loaded = true }
            catch { loaded = false; message = "保存した依頼の一覧を読み込めません。新しい依頼は送らず、もう一度この画面を開いてください。" }
        }
    }
}

/// Settings wiring is present but default-disabled. Activation requires a real
/// reviewed processing disclosure and authenticated production backend/erasure.
@MainActor struct AccountClosureReviewSettingsView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var selection: AccountClosureReviewSelection?
    @State private var loading = false
    var body: some View {
        VStack(spacing: 0) {
            if let selection, selection.revision == store.accountBindingRevision,
               selection.accountID == store.preparedDeletionAccountID, store.closureReviewConfigured {
                AccountClosureReviewView(accountID: selection.accountID, epochID: selection.epochID,
                    revision: selection.revision, available: true, processingExplanation: selection.processingExplanation,
                    token: {
                        store.accountBindingRevision == selection.revision
                            && store.preparedDeletionAccountID == selection.accountID ? selection.bearer : nil
                    }, vault: store.closureReviewVault, api: AccountClosureReviewAPI())
            } else {
                Form {
                    Section {
                        if loading { ProgressView("登録とログイン状態を確認中") }
                        else {
                            Text("退会依頼を準備できませんでした。通信とログイン状態を確認してください。この画面を開いただけでは依頼・登録・削除は行いません。")
                            Button("もう一度確認") { Task { await load() } }.disabled(store.busy)
                        }
                    }
                }.navigationTitle("退会の依頼")
            }
        }
        .task(id: store.accountBindingRevision) { await load() }
        .onDisappear { selection = nil; loading = false }
    }
    private func load() async {
        let revision = store.accountBindingRevision
        selection = nil; loading = true
        let prepared = await store.prepareClosureReview()
        guard !Task.isCancelled, revision == store.accountBindingRevision else { return }
        selection = prepared; loading = false
    }
}

#if DEBUG
private actor ClosureReviewPreviewServer {
    private var states: [String: String]
    init(pending: UUID, cancelled: UUID) { states = [pending.uuidString.lowercased(): "review_required", cancelled.uuidString.lowercased(): "cancelled"] }
    func reply(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        guard request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic-closure-preview",
              let data = request.httpBody, let body = try JSONSerialization.jsonObject(with: data) as? [String: String],
              let epoch = body["expectedEpochID"], let submission = body["submissionID"] else { throw CloudError.invalidInput }
        let action = request.url!.lastPathComponent
        if action == "request", states[submission] == nil { states[submission] = "review_required" }
        if action == "cancel", states[submission] == "review_required" { states[submission] = "cancelled" }
        var result = ["kind": "app-closure-review/v2", "state": states[submission] ?? "review_not_found", "epochID": epoch, "submissionID": submission]
        if states[submission] != nil { result["reviewRequestID"] = submission }
        let status = states[submission] == nil ? 404 : action == "request" ? 202 : 200
        return (try JSONEncoder().encode(result), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}
/// Explicitly isolated, synthetic-only preview. No owner credentials or network.
@MainActor struct AccountClosureReviewPreview: View {
    private let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let epoch = UUID(uuidString: "99999999-9999-4999-8999-999999999999")!
    private let pending = UUID(uuidString: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!
    private let cancelled = UUID(uuidString: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")!
    private let vault = AccountClosureReviewVault(service: "dev.ouchi.review.closure.sample.references")
    @State private var api: AccountClosureReviewAPI?
    @State private var revision = UUID()
    @State private var message: String?
    var body: some View {
        NavigationStack {
            if let api {
                AccountClosureReviewView(accountID: account, epochID: epoch, revision: revision, available: true,
                    processingExplanation: "確認用データです。実際の退会・削除は行いません。", token: { "synthetic-closure-preview" }, vault: vault, api: api)
                    .safeAreaInset(edge: .top) {
                        Text("確認用サンプル・通信なし").font(.caption)
                            .dynamicTypeSize(...DynamicTypeSize.xxxLarge).padding(8)
                            .frame(maxWidth: .infinity).background(.background)
                            .accessibilityIdentifier("closure-review.sample")
                    }
            } else { Text(message ?? "確認用の依頼を準備しています") }
        }
        .task {
            guard Bundle.main.bundleIdentifier == "dev.ouchi.review.closure",
                  Bundle.main.infoDictionary?["OUCHI_REVIEW_SAMPLE_DATA"] as? String == "YES" else { message = "専用の確認版でのみ表示できます"; return }
            var stage = "restore"
            do {
                if ProcessInfo.processInfo.arguments.contains("--ouchi-cleanup-preview") {
                    for saved in try vault.references(accountID: account, epochID: epoch) { try vault.remove(saved) }
                    message = "確認用の依頼番号を消去しました"; return
                }
                if ProcessInfo.processInfo.arguments.contains("--ouchi-require-existing-review-fixture") {
                    for id in [pending, cancelled] {
                        guard try vault.read(submissionID: id) == .init(accountID: account, epochID: epoch, submissionID: id) else { throw CloudError.unavailable }
                    }
                    print("PASS: both original synthetic closure references restored before any new preparation.")
                }
                stage = "prepare"
                for id in [pending, cancelled] { _ = try vault.prepare(.init(accountID: account, epochID: epoch, submissionID: id)) }
                stage = "attributes"
                // This check runs in the actual iOS app sandbox, not macOS legacy Keychain.
                let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: vault.service,
                    kSecAttrAccount as String: "closure-review-" + pending.uuidString.lowercased(),
                    kSecAttrSynchronizable as String: kSecAttrSynchronizableAny,
                    kSecReturnAttributes as String: true, kSecReturnData as String: false, kSecMatchLimit as String: kSecMatchLimitOne]
                var result: CFTypeRef?
                let attributeStatus = SecItemCopyMatching(query as CFDictionary, &result)
                if let attributes = result as? [String: Any] {
                    print("Synthetic closure attribute status=\(attributeStatus), accessible=\(attributes[kSecAttrAccessible as String] ?? "missing"), synchronizable=\(attributes[kSecAttrSynchronizable as String] ?? "missing")")
                    fflush(nil)
                }
                guard attributeStatus == errSecSuccess,
                      let attributes = result as? [String: Any],
                      attributes[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String,
                      attributes[kSecAttrSynchronizable as String] as? Bool == false else { throw CloudError.unavailable }
                print("PASS: synthetic iOS closure references use WhenUnlockedThisDeviceOnly and synchronizable=false.")
                fflush(nil)
                let server = ClosureReviewPreviewServer(pending: pending, cancelled: cancelled)
                api = AccountClosureReviewAPI(transport: { try await server.reply($0) })
            } catch {
                let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: vault.service,
                    kSecAttrAccount as String: "closure-review-" + pending.uuidString.lowercased(), kSecMatchLimit as String: kSecMatchLimitOne]
                let status = SecItemCopyMatching(query as CFDictionary, nil)
                message = "確認用の依頼を準備できませんでした（\(stage)：\(status)）"
                print("Synthetic closure fixture failed at \(stage), status=\(status), error=\(error)")
                fflush(nil)
            }
        }
    }
}
#endif
