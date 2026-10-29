import SwiftUI
import OuchiCore
#if DEBUG
import Security
#endif

/// Read-only screen; callers must supply the dedicated vault and a new revision
/// whenever the visible account/session changes. Live navigation remains gated.
@MainActor struct SavedDeletionReceiptsView: View {
    @Environment(\.dynamicTypeSize) private var textSize
    let userID: UUID?
    let revision: UUID
    let available: Bool
    let vault: DeletionReadCredentialVault
    let flow: DeletionReceiptRecoveryFlow
    var now: () -> Date = Date.init
    @State private var references: [DeletionReadCredentialVault.Reference] = []
    @State private var loaded = false
    @State private var message: String?
    @State private var busy = false
    @State private var activeRevision: UUID?
    @State private var operation: Task<Void, Never>?

    private struct Context: Hashable {
        let userID: UUID?
        let revision: UUID
    }
    private var context: Context { Context(userID: userID, revision: revision) }
    @State private var activeContext: Context?

    var body: some View {
        List {
            Section {
                Text("この端末に保存された削除申請の状況を確認します。新しい削除申請は行いません。")
                if !available { Text("現在、オンラインでの状況確認は準備中です。") }
            }
            Section("保存された申請") {
                if loaded && references.isEmpty {
                    Text("保存された申請はありません。これだけでは、サーバー側の削除状況は判断できません。")
                }
                ForEach(references, id: \.requestID) { reference in
                    VStack(alignment: .leading, spacing: 8) {
                        Text("申請番号：" + String(reference.requestID.uuidString.suffix(8)))
                        Text("確認期限：" + reference.expiresAt.formatted(date: .numeric, time: .shortened))
                            .font(.footnote)
                        if reference.expiresAt <= now() {
                            Text("確認期限が過ぎています。削除完了を意味するものではありません。")
                        } else {
                            Button("この申請の状況を確認") { check(reference) }
                                .disabled(busy || !available)
                        }
                    }
                }
            }
            if let message { Section("確認結果") { Text(message) } }
            if busy { Section { ProgressView("状況を確認しています") } }
        }
        .navigationTitle("削除申請の確認")
        .navigationBarTitleDisplayMode(textSize.isAccessibilitySize ? .inline : .automatic)
        .task(id: context) {
            operation?.cancel(); operation = nil; flow.bind(nil)
            activeRevision = revision; activeContext = context
            busy = false; references = []; loaded = false; message = nil
            do { references = try vault.references(userID: userID); loaded = true }
            catch { message = "保存された申請を読み込めません。端末のロックを解除した状態で、もう一度この画面を開いてください。" }
        }
        .onDisappear {
            operation?.cancel(); operation = nil; activeRevision = nil; activeContext = nil
            flow.bind(nil); references = []; loaded = false; message = nil; busy = false
        }
    }

    private func check(_ reference: DeletionReadCredentialVault.Reference) {
        guard available, !busy, activeContext == context, activeRevision == revision, reference.expiresAt > now(),
              references.contains(reference) else { return }
        let expected = revision
        let expectedContext = context
        flow.bind(.init(requestID: reference.requestID, userID: reference.userID,
                        inventoryDigest: reference.inventoryDigest, revision: expected,
                        expiresAt: reference.expiresAt))
        busy = true; message = nil
        operation = Task {
            defer { if activeContext == expectedContext { busy = false } }
            do {
                let result = try await flow.recover()
                guard !Task.isCancelled, activeContext == expectedContext else { return }
                switch result {
                case .complete:
                    message = "この申請について、サーバー側の削除完了を確認しました。端末に保存された記録の消去は、この画面では行いません。"
                case .unconfirmed:
                    message = "削除完了を確認できていません。通信できる状態で、時間をおいて再確認してください。"
                }
            } catch {
                guard !Task.isCancelled, activeContext == expectedContext else { return }
                message = "状況を確認できませんでした。通信状態や確認期限を確認してください。削除が完了したとは判断できません。"
            }
        }
    }
}

#if DEBUG
/// Isolated rendering fixture. Never accepts an owner account or server token.
@MainActor struct SavedDeletionReceiptPreview: View {
    private let vault = DeletionReadCredentialVault(service: "dev.ouchi.review.receipts.deletion-receipts")
    private let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let requests = [UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
                            UUID(uuidString: "33333333-3333-4333-8333-333333333333")!]
    @State private var revision = UUID()
    @State private var flow: DeletionReceiptRecoveryFlow?
    @State private var referenceTime = Date()
    @State private var message: String?
    var body: some View {
        NavigationStack {
            if let flow {
                SavedDeletionReceiptsView(userID: account, revision: revision, available: false,
                    vault: vault, flow: flow, now: { referenceTime })
                    .safeAreaInset(edge: .top) {
                        Text("確認用サンプル・通信なし").font(.caption)
                            .dynamicTypeSize(...DynamicTypeSize.xxxLarge).padding(8)
                    }
            } else { Text(message ?? "確認用の申請を準備しています") }
        }
        .task {
            guard Bundle.main.bundleIdentifier == "dev.ouchi.review.receipts",
                  Bundle.main.infoDictionary?["OUCHI_REVIEW_SAMPLE_DATA"] as? String == "YES" else {
                message = "専用の確認版でのみ表示できます"; return
            }
            do {
                for request in requests { try vault.remove(requestID: request) }
                guard try vault.references().isEmpty else { throw CloudError.unavailable }
                if ProcessInfo.processInfo.arguments.contains("--ouchi-cleanup-preview") {
                    message = "確認用の保存情報を消去しました"; return
                }
                let start = Date()
                for (index, request) in requests.enumerated() {
                    _ = try vault.prepare(requestID: request, userID: account,
                        inventoryDigest: String(repeating: "a", count: 64),
                        expiresAt: start.addingTimeInterval(index == 0 ? 300 : 600))
                }
                // Advance only this view's clock: one expired and one live row,
                // without changing simulator/system time or renewing a record.
                referenceTime = start.addingTimeInterval(450)
                flow = DeletionReceiptRecoveryFlow { binding in try vault.recoveryReceipt(binding) }
            } catch {
                // Only a numeric status from this synthetic service is shown.
                // Never print credentials or query an owner's Keychain group.
                let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                    kSecAttrService as String: vault.service, kSecMatchLimit as String: kSecMatchLimitOne]
                message = "確認用の保存情報を読み込めませんでした（状態 \(SecItemCopyMatching(query as CFDictionary, nil))）"
            }
        }
    }
}
#endif

/// Prepared screen. Not connected to Settings until full server/device erasure,
/// the shared-login boundary and retention disclosure have been finalized.
@MainActor struct AccountDeletionView: View {
    let accountID: UUID
    let epochID: UUID
    let bindingRevision: UUID
    let available: Bool
    let deletionExplanation: String
    let token: () -> String?
    let exportAvailable: Bool
    let export: () -> Void
    // The adapter must check this immutable binding before every side effect.
    // A view's post-await check cannot undo cleanup applied to a new account.
    let cleanupLocalData: (_ expectedAccount: UUID, _ expectedEpoch: UUID, _ expectedRevision: UUID, _ receipt: AccountDeletionStatus) async -> Bool
    let flow: AccountDeletionFlow
    @State private var operation: Task<Void, Never>?
    private struct Binding: Hashable {
        let account: UUID
        let epoch: UUID
        let revision: UUID
    }
    private var binding: Binding { Binding(account: accountID, epoch: epochID, revision: bindingRevision) }
    @State private var activeBinding: Binding?
    @State private var password = ""
    @State private var consent = false
    @State private var confirming = false
    @State private var busy = false
    @State private var receipt: AccountDeletionStatus?
    @State private var message: String?
    @State private var cleanupPending = false

    private var ready: Bool { available && !deletionExplanation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        Form {
            if !ready { Section { Text("この画面は確認用です。現在、削除の申請はできません。") } }
            Section("削除前に保存") {
                Text("必要な記録は、削除する前に書き出して保存してください。")
                Button("記録を書き出す", action: export).disabled(busy || !exportAvailable)
            }
            Section("削除について") {
                Text("所有している住まいの記録を削除すると、共有している家族も見られなくなります。")
                Text("Appleの定期購入は、アカウントを削除しても自動では解約されません。")
                Link("Appleの定期購入を確認", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                if !deletionExplanation.isEmpty { Text(deletionExplanation) }
            }
            if let receipt {
                Section("申請状況") {
                    Text(statusText(receipt.state))
                    if cleanupPending { Text("この端末の保存記録・一時ファイル・通知の消去を再確認してください。") }
                    Button("状況を確認") { startOperation { await recover() } }.disabled(busy || !ready)
                    if cleanupPending {
                        Button("端末のデータ消去を再確認") { startOperation { await cleanLocalData() } }.disabled(busy)
                    }
                }
            } else {
                Section("本人確認") {
                    Button("申請状況を確認") { startOperation { await recover() } }.disabled(busy || !ready)
                    SecureField("現在のパスワード", text: $password)
                    Toggle("削除について確認しました", isOn: $consent)
                    Button("アカウントを削除", role: .destructive) { confirming = true }
                        .disabled(!ready || busy || !consent || password.isEmpty)
                }
            }
            if let message { Section { Text(message) } }
            if busy { Section { ProgressView("確認しています") } }
        }
        .navigationTitle("アカウントの削除")
        .confirmationDialog("アカウントの削除を申請しますか？", isPresented: $confirming, titleVisibility: .visible) {
            Button("削除を申請", role: .destructive) { startOperation { await submit() } }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("削除後の記録は元に戻せません。必要な記録を保存したことを確認してください。")
        }
        .task(id: binding) {
            operation?.cancel(); operation = nil
            activeBinding = binding
            password = ""; consent = false; receipt = nil; cleanupPending = false; busy = false; message = nil
            flow.bind(accountID: accountID, epochID: epochID, revision: bindingRevision)
            if ready { await recover() }
        }
        .onDisappear {
            operation?.cancel(); operation = nil
            activeBinding = nil
            password = ""
            flow.bind(accountID: nil)
        }
    }

    private func startOperation(_ action: @escaping @MainActor () async -> Void) {
        guard !busy, activeBinding == binding else { return }
        operation?.cancel()
        operation = Task { await action() }
    }

    private func statusText(_ state: AccountDeletionStatus.State) -> String {
        switch state {
        case .pending: return "削除の申請を受け付けました。処理が完了するまでお待ちください。"
        case .running: return "削除処理を進めています。まだ完了していません。"
        case .failed: return "削除処理が完了していません。状況を確認してください。"
        case .complete: return "サーバー側の削除処理が完了しました。"
        }
    }
    private func recover() async {
        guard ready, !busy, let bearer = token() else { return }
        let expected = binding
        busy = true; defer { if expected == activeBinding { busy = false } }
        do {
            let recovered = try await flow.recover(token: bearer)
            guard expected == activeBinding, !Task.isCancelled else { return }
            receipt = recovered; message = nil
            if let recovered {
                cleanupPending = true
                let cleaned = await cleanupLocalData(expected.account, expected.epoch, expected.revision, recovered)
                guard expected == activeBinding, !Task.isCancelled else { return }
                cleanupPending = !cleaned
            }
        }
        catch { guard expected == activeBinding, !Task.isCancelled else { return }; message = "状況を確認できません。通信できる状態で、もう一度確認してください。" }
    }
    private func submit() async {
        guard ready, !busy, consent, let bearer = token() else { return }
        let entered = password; password = ""
        let expected = binding
        busy = true; defer { if expected == activeBinding { busy = false } }
        do {
            let accepted = try await flow.submit(password: entered, token: bearer)
            guard expected == activeBinding, !Task.isCancelled else { return }
            receipt = accepted
            message = nil
            if let receipt {
                cleanupPending = true
                let cleaned = await cleanupLocalData(expected.account, expected.epoch, expected.revision, receipt)
                guard expected == activeBinding, !Task.isCancelled else { return }
                cleanupPending = !cleaned
            }
        } catch AccountDeletionError.familyReviewRequired, AccountDeletionError.familyHandoffRequired {
            guard expected == activeBinding, !Task.isCancelled else { return }
            receipt = nil; cleanupPending = false
            message = "共有記録の確認が必要です。設定の「退会の依頼・状況確認」から依頼してください。今回の削除申請は受け付けられていません。"
        } catch {
            guard expected == activeBinding, !Task.isCancelled else { return }
            message = "申請の結果を確認できません。再申請する前に状況を確認してください。"
            // Recover first after an ambiguous response; never infer completion.
            do {
                let recovered = try await flow.recover(token: bearer)
                guard expected == activeBinding, !Task.isCancelled else { return }
                receipt = recovered
                if recovered != nil { cleanupPending = true }
            } catch {}
        }
    }
    private func cleanLocalData() async {
        guard !busy, let receipt, activeBinding == binding else { return }
        let expected = binding
        busy = true; defer { if expected == activeBinding { busy = false } }
        let cleaned = await cleanupLocalData(expected.account, expected.epoch, expected.revision, receipt)
        guard expected == activeBinding, !Task.isCancelled else { return }
        cleanupPending = !cleaned
    }
}

/// Explicit custody/read screen; local cleanup requires a separate confirmation.
@MainActor struct ClosureReadCustodyScreen: View {
    let accountID: UUID
    let scope: ClosureReadScope
    let revision: UUID
    let available: Bool
    let canPrepare: Bool
    let authorize: () async -> String?
    let vault: ClosureReadCredentialVault
    let api: ClosureReadCustodyAPI
    var cleanup: (@MainActor (ClosureReadCustodyFlow) async throws -> AccountDeletionLocalCleanupResult)? = nil
    private enum LocalConfirmation: Equatable { case cleanup, forgetExpired }
    @State private var localConfirmation: LocalConfirmation?
    @State private var forgotten = false
    @State private var lastConfirmedAt: Date?
    @State private var flow: ClosureReadCustodyFlow?
    @State private var saved: ClosureReadCredentialVault.Reference?
    @State private var status: ClosureReadStatus?
    @State private var confirmed = false
    @State private var loaded = false
    @State private var busy = false
    @State private var message: String?
    @State private var operation: Task<Void, Never>?
    private struct Context: Hashable { let account: UUID; let request: UUID; let epoch: UUID; let submission: UUID; let revision: UUID }
    private var context: Context { .init(account: accountID, request: scope.requestID, epoch: scope.epochID, submission: scope.submissionID, revision: revision) }
    @State private var active: Context?
    var body: some View {
        Form {
            Section("退会処理の確認情報") {
                Text("この端末に確認用の鍵を保存すると、ログアウト後も同じ退会依頼の状況を確認できます。鍵はこの端末だけに保存します。")
                Text("確認できる期限は最長の目安です。サーバー側の確認情報が先に削除される場合があります。確認できなくなっても、退会の完了を意味しません。")
                Text("この画面から新しい退会依頼や取消は送信しません。端末内の情報を整理する場合は、別の確認が必要です。")
                if !available { Text("オンラインでの保存・確認は準備中です。") }
            }
            Section("保存した確認情報") {
                if let saved {
                    Text("処理番号：" + String(saved.scope.requestID.uuidString.suffix(8)))
                        .accessibilityIdentifier("closure-custody.saved")
                    Text("確認期限（最長）：" + saved.expiresAt.formatted(date: .numeric, time: .shortened))
                    if saved.expiresAt <= Date() { Text("保存した確認情報の期限が過ぎています。新しい鍵への置き換えや期限の延長は行いません。") }
                } else if loaded { Text("この端末に保存した確認情報はありません。サーバー側の退会状況を示すものではありません。") }
                if canPrepare && !forgotten {
                    Button(saved == nil ? "確認情報をこの端末に保存" : "保存・登録を再確認") { run(preparing: true) }
                        .accessibilityIdentifier("closure-custody.prepare").disabled(!available || !loaded || busy || (saved?.expiresAt ?? .distantFuture) <= Date())
                }
                Button("保存した鍵で状況を確認") { run(preparing: false) }
                    .accessibilityIdentifier("closure-custody.check").disabled(!available || !loaded || saved == nil || busy || (saved?.expiresAt ?? .distantPast) <= Date())
                if let saved, saved.expiresAt <= Date() {
                    Button("期限切れの確認情報をこの端末から消去", role: .destructive) { localConfirmation = .forgetExpired }
                        .accessibilityIdentifier("closure-custody.forget-expired").disabled(busy)
                }
            }
            if confirmed {
                Section {
                    Text("保存した確認用の鍵がサーバーに登録されていることを確認しました。")
                        .accessibilityIdentifier("closure-custody.confirmed")
                }
            }
            if let status {
                Section("処理の状況") {
                    if let lastConfirmedAt { Text("最終確認：" + lastConfirmedAt.formatted(date: .numeric, time: .standard)).accessibilityIdentifier("closure-custody.last-confirmed") }
                    Text(statusMessage(status.state)).accessibilityIdentifier("closure-custody.status")
                }
            }
            if let cleanup, confirmed, status?.state == .complete {
                Section("この端末に残る情報") {
                    Text("アプリ内の保存記録・通知・ログイン情報を整理できます。退会処理の確認情報は残します。自分で共有・保存したファイルや、Appleの定期購入は別に確認してください。")
                    Button("この端末内の情報を整理", role: .destructive) { localConfirmation = .cleanup }
                        .accessibilityIdentifier("closure-custody.cleanup").disabled(busy || !available)
                    Link("Appleの定期購入を確認", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                }

            }
            if let message { Section("確認結果") { Text(message).accessibilityIdentifier("closure-custody.message") } }
            if busy { Section { ProgressView("確認しています") } }
        }
        .navigationTitle("退会処理の確認")
        .navigationBarTitleDisplayMode(.inline)
        .alert(localConfirmation == .forgetExpired ? "期限切れの確認情報を消去しますか？" : "この端末内の情報を整理しますか？",
               isPresented: Binding(get: { localConfirmation != nil }, set: { if !$0 { localConfirmation = nil } }),
               presenting: localConfirmation) { action in
            switch action {
            case .forgetExpired:
                Button("期限切れの確認情報を消去", role: .destructive) { forgetExpired() }
            case .cleanup:
                if let cleanup { Button("端末内の情報を整理", role: .destructive) { runCleanup(cleanup) } }
            }
            Button("戻る", role: .cancel) {}
        } message: { action in
            Text(action == .forgetExpired
                ? "この端末の確認用の鍵だけを消去します。退会処理の完了・取消・やり直しは行いません。消去後、この鍵での確認はできません。"
                : "完了状態を再確認してから、この退会依頼に対応する端末内の情報を整理します。確認情報は消去しません。")
        }
        .task(id: context) {
            operation?.cancel(); operation = nil; active = context; busy = false; loaded = false
            saved = nil; status = nil; confirmed = false; message = nil; localConfirmation = nil; forgotten = false; lastConfirmedAt = nil
            let next = ClosureReadCustodyFlow(api: api, read: { try vault.read($0) }, prepare: { try vault.prepare($0, window: $1) })
            next.bind(.init(accountID: accountID, scope: scope, revision: revision)); flow = next
            reload()
        }
        .onDisappear {
            operation?.cancel(); operation = nil; active = nil; flow?.bind(nil)
            status = nil; confirmed = false; saved = nil; loaded = false; busy = false; message = nil; lastConfirmedAt = nil
        }
    }
    private func forgetExpired() {
        guard loaded, !busy, active == context, let saved, saved.accountID == accountID,
              saved.scope == scope, saved.expiresAt <= Date() else { return }
        do {
            try vault.removeExpired(saved)
            operation?.cancel(); operation = nil; flow?.bind(nil)
            confirmed = false; status = nil; lastConfirmedAt = nil; forgotten = true
            message = "期限切れの確認情報をこの端末から消去しました。サーバー側の退会状況を示すものではありません。"
            reload()
        } catch { message = "確認情報の消去を確認できません。もう一度開いて確認してください。" }
    }
    private func runCleanup(_ cleanup: @escaping @MainActor (ClosureReadCustodyFlow) async throws -> AccountDeletionLocalCleanupResult) {
        guard available, loaded, !busy, confirmed, status?.state == .complete, active == context, let flow else { return }
        let expected = context; busy = true; confirmed = false; status = nil; message = nil; lastConfirmedAt = nil
        operation?.cancel()
        operation = Task {
            defer { if active == expected { busy = false } }
            do {
                let result = try await cleanup(flow)
                guard !Task.isCancelled, active == expected else { return }
                confirmed = flow.confirmed != nil; status = flow.status; lastConfirmedAt = confirmed ? Date() : nil
                message = result == .complete ? "この端末内の整理が完了しました。確認情報は残しています。" : "整理は完了していません。同じ確認情報で状況を再確認してください。"
            } catch {
                guard !Task.isCancelled, active == expected else { return }
                message = "端末内の整理が完了したか確認できません。同じ確認情報で再確認してください。"
            }
            guard !Task.isCancelled, active == expected else { return }; reload()
        }
    }
    private func statusMessage(_ state: AccountClosureProgressReceipt.State) -> String {
        switch state {
        case .pending: return "削除処理の受付を確認しました。完了はまだ確認されていません。"
        case .running: return "削除処理を進めています。完了はまだ確認されていません。"
        case .failed: return "削除処理は完了していません。同じ確認情報で状況を再確認してください。"
        case .complete: return "サーバー側の退会処理の完了を確認しました。端末内の情報は、必要に応じて下の操作で整理できます。"
        }
    }
    private func reload() {
        do { saved = try vault.references(accountID: accountID).first { $0.scope == scope }; loaded = true }
        catch { loaded = false; message = "端末に保存した確認情報を読み込めません。端末のロックを解除し、もう一度開いてください。新しい鍵は作成していません。" }
    }
    private func run(preparing: Bool) {
        guard available, loaded, !busy, active == context, let flow, !preparing || canPrepare else { return }
        let expected = context; busy = true; confirmed = false; status = nil; message = nil; lastConfirmedAt = nil
        operation?.cancel()
        operation = Task {
            defer { if active == expected { busy = false } }
            do {
                if preparing {
                    guard let bearer = await authorize() else { throw CloudError.authenticationRequired }
                    guard !Task.isCancelled, active == expected else { return }
                    try await flow.prepareAndRegister(bearer: bearer)
                } else { _ = try await flow.recover() }
                guard !Task.isCancelled, active == expected else { return }
                confirmed = flow.confirmed != nil; status = flow.status; lastConfirmedAt = confirmed ? Date() : nil
                if !confirmed { message = "最新の状況を確認できません。保存した鍵と依頼番号は保持しています。新しい依頼は送らず、同じ確認情報で再確認してください。" }
            } catch {
                guard !Task.isCancelled, active == expected else { return }
                confirmed = false; status = nil
                message = "結果を確認できません。保存した確認情報は保持しています。通信できる状態で再確認してください。"
            }
            guard !Task.isCancelled, active == expected else { return }
            reload()
        }
    }
}
@MainActor struct BoundClosureReadCustodyScreen: View {
    @EnvironmentObject private var store: NativeStore
    let account: UUID
    let scope: ClosureReadScope
    let revision: UUID
    var canPrepare = false
    private var cleanupAction: (@MainActor (ClosureReadCustodyFlow) async throws -> AccountDeletionLocalCleanupResult)? {
        guard store.closureLocalCleanupConfigured else { return nil }
        return { flow in
            try await store.cleanupClosureReadData(binding: .init(accountID: account, scope: scope, revision: revision), flow: flow)
        }
    }
    var body: some View {
        Group {
            if store.closureReadCustodyConfigured && store.accountBindingRevision == revision {
                ClosureReadCustodyScreen(accountID: account, scope: scope, revision: revision, available: true,
                    canPrepare: canPrepare && store.signedIn,
                    authorize: { try? await store.authorizeSavedClosureProgress(account: account, revision: revision) },
                    vault: store.closureReadVault, api: store.closureReadAPI,
                    cleanup: cleanupAction)
            } else { Text("ログイン状態が変わりました。保存した確認情報を読み込み直してください。").padding() }
        }
    }
}
@MainActor struct SavedClosureReadCredentialsView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var references: [ClosureReadCredentialVault.Reference] = []
    @State private var revision: UUID?
    @State private var message: String?
    @State private var loading = false
    private struct LoadContext: Hashable { let revision: UUID; let busy: Bool }
    private var loadContext: LoadContext { .init(revision: store.accountBindingRevision, busy: store.busy) }
    var body: some View {
        List {
            Section {
                Text("この端末に保存した退会処理の確認情報です。状況の確認にログインは不要です。記録の削除・新しい登録は行いません。")
                if loading { ProgressView("保存した情報を読み込んでいます") }
                if let message { Text(message) }
            }
            if let revision, revision == store.accountBindingRevision {
                ForEach(references, id: \.scope.requestID) { reference in
                    NavigationLink("処理番号：" + String(reference.scope.requestID.uuidString.suffix(8))) {
                        BoundClosureReadCustodyScreen(account: reference.accountID, scope: reference.scope, revision: revision)
                    }.accessibilityIdentifier("closure-reference-" + reference.scope.requestID.uuidString.lowercased())
                }
            }
        }
        .navigationTitle("保存した退会処理")
        .task(id: loadContext) {
            let expectedContext = loadContext
            let expected = expectedContext.revision
            references = []; revision = nil; message = nil; loading = true
            defer { if expectedContext == loadContext { loading = false } }
            guard !expectedContext.busy else { message = "ほかの処理が終わるのを待っています。"; return }
            do {
                let account = try await store.localClosureReadAccount()
                guard !Task.isCancelled, expectedContext == loadContext else { return }
                references = try store.closureReadVault.references(accountID: account); revision = expected
                if references.isEmpty { message = "この端末に保存した確認情報はありません。サーバー側の退会状況を示すものではありません。" }
            } catch {
                guard !Task.isCancelled, expectedContext == loadContext else { return }
                message = "保存した情報を読み込めません。端末を利用できる状態で、もう一度開いてください。"
            }
        }
    }
}

#if DEBUG
import CryptoKit
import Darwin
/// Synthetic backend keeps only a token hash and fixed deadline in its own app
/// sandbox, so a process restart tests protected custody without live network.
private actor ClosureCustodyPreviewServer {
    let file: URL
    private var record: [String: String]
    private var loseRegistration: Bool
    private let failReread: Bool
    private let completePreview: Bool
    private var statusReads = 0
    init(file: URL, loseRegistration: Bool, failReread: Bool, completePreview: Bool = false) throws {
        self.file = file; self.loseRegistration = loseRegistration; self.failReread = failReread; self.completePreview = completePreview
        if FileManager.default.fileExists(atPath: file.path) {
            let data = try Data(contentsOf: file)
            guard data.count <= 4096 else { throw CloudError.invalidInput }
            record = try JSONDecoder().decode([String: String].self, from: data)
        } else { record = [:] }
    }
    private func hash(_ token: String) -> String { SHA256.hash(data: Data(("Ouchi/closure-read/v1\n" + token).utf8)).map { String(format: "%02x", $0) }.joined() }
    func matches(_ saved: ClosureReadCredential) -> Bool {
        record["credentialID"] == saved.credentialID.uuidString.lowercased() && record["tokenHash"] == hash(saved.token)
            && record["requestID"] == saved.scope.requestID.uuidString.lowercased()
    }
    func reply(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        guard let data = request.httpBody, let url = request.url else { throw CloudError.invalidInput }
        let body = try JSONDecoder().decode([String: String].self, from: data), action = url.lastPathComponent
        let keys = ["requestID", "expectedEpochID", "submissionID"]
        guard keys.allSatisfy({ body[$0] != nil }) else { throw CloudError.invalidInput }
        if action == "status" { guard request.value(forHTTPHeaderField: "Authorization") == nil else { throw CloudError.invalidInput } }
        else { guard request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic-custody-preview" else { throw CloudError.authenticationRequired } }
        if record.isEmpty {
            guard action == "window" else { throw CloudError.unavailable }
            let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            record = ["requestID": body["requestID"]!, "epochID": body["expectedEpochID"]!, "submissionID": body["submissionID"]!, "expiresAt": formatter.string(from: Date().addingTimeInterval(3600))]
            try JSONEncoder().encode(record).write(to: file, options: .atomic)
        }
        guard record["requestID"] == body["requestID"], record["epochID"] == body["expectedEpochID"], record["submissionID"] == body["submissionID"] else { throw CloudError.invalidInput }
        var result: [String: Any] = ["requestID": body["requestID"]!, "epochID": body["expectedEpochID"]!, "submissionID": body["submissionID"]!]
        var status = 200
        switch action {
        case "window": result["kind"] = "app-closure-read-window/v1"; result["expiresAt"] = record["expiresAt"]!
        case "register":
            guard body["expiresAt"] == record["expiresAt"], let id = body["credentialID"], let token = request.value(forHTTPHeaderField: "X-Ouchi-Closure-Read") else { throw CloudError.invalidInput }
            guard record["credentialID"] == nil || (record["credentialID"] == id && record["tokenHash"] == hash(token)) else { throw CloudError.invalidInput }
            record["credentialID"] = id; record["tokenHash"] = hash(token)
            try JSONEncoder().encode(record).write(to: file, options: .atomic)
            if loseRegistration { loseRegistration = false; throw URLError(.networkConnectionLost) }
            result["kind"] = "app-closure-read-registration/v1"; result["expiresAt"] = record["expiresAt"]!; result["registered"] = true; result["credentialID"] = id
        case "status":
            statusReads += 1
            result["credentialID"] = body["credentialID"]!
            if let token = request.value(forHTTPHeaderField: "X-Ouchi-Closure-Read"), record["credentialID"] == body["credentialID"], record["tokenHash"] == hash(token), !(failReread && statusReads > 1) {
                result["kind"] = "app-closure-read-status/v1"; result["state"] = completePreview ? "complete" : "running"
            } else { status = 404; result["kind"] = "app-closure-read-unavailable/v1"; result["state"] = "unavailable" }
        default: throw CloudError.invalidInput
        }
        return (try JSONSerialization.data(withJSONObject: result), HTTPURLResponse(url: url, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
    }
}
@MainActor struct ClosureReadCustodyPreview: View {
    private let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private var expiredReview: Bool { ProcessInfo.processInfo.arguments.contains("--ouchi-custody-expired-preview") }
    private var scope: ClosureReadScope {
        ClosureReadScope(requestID: UUID(uuidString: expiredReview ? "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" : "dddddddd-dddd-4ddd-8ddd-dddddddddddd")!,
            epochID: UUID(uuidString: "99999999-9999-4999-8999-999999999999")!, submissionID: UUID(uuidString: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!)
    }
    private let vault = ClosureReadCredentialVault(service: "dev.ouchi.review.closure.ouchi-only-custody")
    @State private var revision = UUID()
    @State private var api: ClosureReadCustodyAPI?
    @State private var message: String?
    @State private var cleanupStore: NativeStore?
    var body: some View {
        NavigationStack {
            if let api, let cleanupStore {
                ClosureCleanupPreviewScreen(store: cleanupStore, account: account, scope: scope, vault: vault, api: api)
            } else if let api {
                ClosureReadCustodyScreen(accountID: account, scope: scope, revision: revision, available: true,
                    canPrepare: !expiredReview, authorize: { "synthetic-custody-preview" }, vault: vault, api: api)
                    .safeAreaInset(edge: .top) {
                        Text("確認用サンプル・通信なし").font(.caption).dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                            .padding(8).frame(maxWidth: .infinity).background(.background).accessibilityIdentifier("closure-custody.sample")
                    }
            } else { Text(message ?? "確認用の画面を準備しています") }
        }
        .task {
            guard Bundle.main.bundleIdentifier == "dev.ouchi.review.closure",
                  Bundle.main.infoDictionary?["OUCHI_REVIEW_SAMPLE_DATA"] as? String == "YES" else { message = "専用の確認版でのみ表示できます"; return }
            do {
                if expiredReview {
                    let seeded = URL.documentsDirectory.appendingPathComponent("OuchiExpiredCustodySyntheticSeeded.txt")
                    if !FileManager.default.fileExists(atPath: seeded.path) {
                        try vault.seedExpiredReviewCredential(.init(accountID: account, scope: scope, revision: revision))
                        try Data("synthetic-v1".utf8).write(to: seeded, options: .atomic)
                    } else { guard try Data(contentsOf: seeded) == Data("synthetic-v1".utf8) else { throw CloudError.unavailable } }
                }
                let file = URL.documentsDirectory.appendingPathComponent("OuchiCustodySyntheticServer.json")
                let server = try ClosureCustodyPreviewServer(file: file,
                    loseRegistration: ProcessInfo.processInfo.arguments.contains("--ouchi-custody-lost-ack-preview"),
                    failReread: ProcessInfo.processInfo.arguments.contains("--ouchi-custody-unavailable-reread-preview"),
                    completePreview: ProcessInfo.processInfo.arguments.contains("--ouchi-custody-cleanup-preview"))
                if ProcessInfo.processInfo.arguments.contains("--ouchi-require-existing-custody-preview") {
                    guard let saved = try vault.read(requestID: scope.requestID), saved.accountID == account, saved.scope == scope,
                          await server.matches(saved), try vault.references(accountID: account).count == 1 else { throw CloudError.unavailable }
                    // read() itself verifies the real iOS Keychain item's
                    // WhenUnlockedThisDeviceOnly and synchronizable=false attributes.
                    print("PASS: original scoped iOS custody restored with protected non-synchronizing attributes; server hash matches original key before any new preparation.")
                    fflush(nil)
                }
                if ProcessInfo.processInfo.arguments.contains("--ouchi-custody-cleanup-preview") {
                    cleanupStore = try await prepareCleanupStore()
                }
                api = ClosureReadCustodyAPI(transport: { try await server.reply($0) })
            } catch { message = "確認用の保存情報を読み込めませんでした。" }
        }
    }
    private func prepareCleanupStore() async throws -> NativeStore {
        let file = URL.documentsDirectory.appendingPathComponent("OuchiCleanupSyntheticSeeded.txt")
        let storage = KeychainSessionStorage(service: "dev.ouchi.review.closure.cleanup-synthetic-auth")
        if !FileManager.default.fileExists(atPath: file.path) {
            try storage.write(NativeReviewFixture.sessionBytes())
            let household = try JSONDecoder().decode(Household.self, from: Data(#"{"homes":[],"products":[],"tasks":[],"history":[]}"#.utf8))
            try HouseholdSnapshotStorage(namespace: "closure-cleanup-preview").write(OfflineSnapshot(account: account, household: household))
            try PendingAttachmentStorage().write(PendingAttachment(account: account, epoch: scope.epochID, product: UUID(), id: UUID(), bytes: Data([137,80,78,71,13,10,26,10]), mime: "image/png"))
            try PendingAttachmentRemovalStorage().write(PendingAttachmentRemoval(account: account, epoch: scope.epochID, product: UUID(), id: UUID()))
            let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
            let exports = ManagedExportStorage(root: caches.appendingPathComponent("OuchiManagedExports", isDirectory: true))
            for owner in [account, UUID(uuidString: "66666666-6666-4666-8666-666666666666")!] {
                _ = try exports.write(Data("Synthetic cleanup export".utf8), account: owner, extension: "json")
            }
            try Data("synthetic-v1".utf8).write(to: file, options: .atomic)
        } else { guard try Data(contentsOf: file) == Data("synthetic-v1".utf8) else { throw CloudError.unavailable } }
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_review_only")
        // Any accidental remote logout, deletion, enrollment or refresh fails
        // the synthetic cleanup instead of reaching the network.
        let client = HouseholdAPI(config: config, transport: { _ in throw CloudError.unavailable })
        let session = SessionController(api: client, storage: storage)
        let restored = try await session.restore()
        return try NativeStore(closureCleanupPreviewAPI: client, session: session, account: account, restored: restored)
    }
}
@MainActor private struct ClosureCleanupPreviewScreen: View {
    @ObservedObject var store: NativeStore
    let account: UUID
    let scope: ClosureReadScope
    let vault: ClosureReadCredentialVault
    let api: ClosureReadCustodyAPI
    @State private var verified = false
    private var cleanupAction: @MainActor (ClosureReadCustodyFlow) async throws -> AccountDeletionLocalCleanupResult {
        let revision = store.accountBindingRevision
        return { flow in try await store.cleanupClosureReadData(binding: .init(accountID: account, scope: scope, revision: revision), flow: flow) }
    }
    var body: some View {
        ClosureReadCustodyScreen(accountID: account, scope: scope, revision: store.accountBindingRevision, available: true,
            canPrepare: store.signedIn, authorize: { "synthetic-custody-preview" }, vault: vault, api: api, cleanup: cleanupAction)
            .safeAreaInset(edge: .top) {
                VStack {
                    Text("確認用サンプル・通信なし").accessibilityIdentifier("closure-custody.sample")
                    if let message = store.message { Text(message).accessibilityIdentifier("closure-custody.store-message") }
                    if verified { Text("端末内の整理と確認情報の保持を検証しました").accessibilityIdentifier("closure-custody.local-cleanup-verified") }
                }.font(.caption).dynamicTypeSize(...DynamicTypeSize.xxxLarge).padding(8).frame(maxWidth: .infinity).background(.background)
            }
            .task(id: store.message) {
                do {
                    let actual = try await store.closureCleanupPreviewProof(account: account, epoch: scope.epochID)
                    guard !Task.isCancelled else { return }
                    let kept = try vault.read(requestID: scope.requestID)
                    verified = actual && kept != nil
                    if verified {
                        print("PASS: actual synthetic local Auth Keychain, owned snapshot/upload/removal/export and pending marker absent; foreign export and protected Ouchi read capability preserved. No network provider used.")
                        fflush(nil)
                    }
                } catch { verified = false }
            }
    }
}
/// Full shipping NativeRoot hierarchy with injected synthetic transport only.
/// No local sign-in state is toggled by the preview; the real form/controller run.
@MainActor private struct ClosureRootNavigationScreen: View {
    @ObservedObject var store: NativeStore
    let verified: Bool
    let interruptionRestored: Bool
    let verify: @MainActor (NativeStore) async -> Void
    var body: some View {
        NativeRootView().environmentObject(store)
            .safeAreaInset(edge: .top) {
                VStack {
                    Text("通常画面の確認用・通信なし").accessibilityIdentifier("closure-root.sample")
                    if store.closureRootReviewAwaitingInterruption { Text("確認用：ログイン情報消去後で停止待ち").accessibilityIdentifier("closure-root.auth-erased-pause") }
                    if interruptionRestored { Text("元の鍵と未完了記録から再開しました").accessibilityIdentifier("closure-root.interruption-restored") }
                    if verified { Text("退会後の確認情報保持とアカウント切替を検証しました").accessibilityIdentifier("closure-root.verified") }
                }.font(.caption).dynamicTypeSize(...DynamicTypeSize.xxxLarge).padding(6).frame(maxWidth: .infinity).background(.background)
            }
            .task { await store.restore() }
            .task(id: store.accountBindingRevision) { await verify(store) }
    }
}
@MainActor struct ClosureRootNavigationPreview: View {
    nonisolated private static let ownerScope = ClosureReadScope(requestID: UUID(uuidString: "dddddddd-dddd-4ddd-8ddd-dddddddddddd")!, epochID: UUID(uuidString: "99999999-9999-4999-8999-999999999999")!, submissionID: UUID(uuidString: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!)
    nonisolated private static let familyScope = ClosureReadScope(requestID: UUID(uuidString: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")!, epochID: UUID(uuidString: "88888888-8888-4888-8888-888888888888")!, submissionID: UUID(uuidString: "cccccccc-cccc-4ccc-8ccc-cccccccccccc")!)
    @State private var store: NativeStore?
    @State private var auth: ClosureRootAuthFixture?
    @State private var ownerServer: ClosureCustodyPreviewServer?
    @State private var familyServer: ClosureCustodyPreviewServer?
    @State private var message: String?
    @State private var verified = false
    @State private var interruptionRestored = false
    var body: some View {
        Group {
            if let store {
                ClosureRootNavigationScreen(store: store, verified: verified, interruptionRestored: interruptionRestored, verify: verifyFinalLocalState)
            } else { Text(message ?? "通常画面の確認環境を準備しています") }
        }
        .task {
            guard store == nil, Bundle.main.bundleIdentifier == "dev.ouchi.review.closure",
                  Bundle.main.infoDictionary?["OUCHI_REVIEW_SAMPLE_DATA"] as? String == "YES" else { return }
            do {
                let directory = URL.documentsDirectory
                let owner = try ClosureCustodyPreviewServer(file: directory.appendingPathComponent("OuchiRootOwnerCapabilityHash.json"), loseRegistration: false, failReread: false, completePreview: true)
                let family = try ClosureCustodyPreviewServer(file: directory.appendingPathComponent("OuchiRootFamilyCapabilityHash.json"), loseRegistration: false, failReread: false)
                let auth = try ClosureRootAuthFixture(file: directory.appendingPathComponent("OuchiRootAuthCounters.json"))
                let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_root_review_only")
                let api = HouseholdAPI(config: config, transport: { try await auth.reply($0) })
                let session = SessionController(api: api, storage: KeychainSessionStorage(service: "dev.ouchi.review.closure.root-synthetic-auth"))
                let custody = ClosureReadCustodyAPI(transport: { request in
                    guard request.url?.lastPathComponent == "status", let bytes = request.httpBody,
                          let body = try JSONSerialization.jsonObject(with: bytes) as? [String: String] else { throw CloudError.invalidInput }
                    switch body["requestID"] {
                    case Self.ownerScope.requestID.uuidString.lowercased(): return try await owner.reply(request)
                    case Self.familyScope.requestID.uuidString.lowercased(): return try await family.reply(request)
                    default: throw CloudError.invalidInput
                    }
                })
                let prepared = try NativeStore(closureRootPreviewAPI: api, session: session, custodyAPI: custody)
                let marker = directory.appendingPathComponent("OuchiRootSyntheticSeeded.txt")
                if !FileManager.default.fileExists(atPath: marker.path) {
                    for (account, scope, server) in [(ClosureRootAuthFixture.owner, Self.ownerScope, owner), (ClosureRootAuthFixture.family, Self.familyScope, family)] {
                        let seedAPI = ClosureReadCustodyAPI(transport: { try await server.reply($0) })
                        guard let window = try await seedAPI.window(scope: scope, bearer: "synthetic-custody-preview") else { throw CloudError.unavailable }
                        let saved = try prepared.closureReadVault.prepare(.init(accountID: account, scope: scope, revision: UUID()), window: window)
                        try await seedAPI.register(scope: scope, credentialID: saved.credentialID, token: saved.token, expiresAt: saved.expiresAt, bearer: "synthetic-custody-preview")
                    }
                    try PendingAttachmentStorage().write(PendingAttachment(account: ClosureRootAuthFixture.owner, epoch: Self.ownerScope.epochID, product: UUID(), id: UUID(), bytes: Data([137,80,78,71,13,10,26,10]), mime: "image/png"))
                    try PendingAttachmentRemovalStorage().write(PendingAttachmentRemoval(account: ClosureRootAuthFixture.owner, epoch: Self.ownerScope.epochID, product: UUID(), id: UUID()))
                    let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
                    let exports = ManagedExportStorage(root: caches.appendingPathComponent("OuchiManagedExports", isDirectory: true))
                    for account in [ClosureRootAuthFixture.owner, ClosureRootAuthFixture.family] {
                        if try exports.files(account: account).isEmpty { _ = try exports.write(Data("Synthetic root navigation export".utf8), account: account, extension: "json") }
                    }
                    try Data("synthetic-v1".utf8).write(to: marker, options: .atomic)
                } else { guard try Data(contentsOf: marker) == Data("synthetic-v1".utf8) else { throw CloudError.unavailable } }
                guard let originalOwner = try prepared.closureReadVault.read(requestID: Self.ownerScope.requestID),
                      let originalFamily = try prepared.closureReadVault.read(requestID: Self.familyScope.requestID),
                      originalOwner.accountID == ClosureRootAuthFixture.owner, originalOwner.scope == Self.ownerScope,
                      originalFamily.accountID == ClosureRootAuthFixture.family, originalFamily.scope == Self.familyScope,
                      try prepared.closureReadVault.references().count == 2,
                      await owner.matches(originalOwner), await family.matches(originalFamily) else { throw CloudError.unavailable }
                if ProcessInfo.processInfo.arguments.contains("--ouchi-root-interrupt-after-auth"),
                   FileManager.default.fileExists(atPath: NativeStore.closureRootInterruptionFile.path) {
                    let trace = try Data(contentsOf: NativeStore.closureRootInterruptionFile)
                    if trace == Data("auth-erased-waiting".utf8) {
                        guard try KeychainSessionStorage(service: "dev.ouchi.review.closure.root-synthetic-auth").read() == nil,
                              let pending = try AppAttestKeyReferenceStorage(namespace: "dev.ouchi.review.closure").pendingClosure(account: ClosureRootAuthFixture.owner),
                              pending.requestID == Self.ownerScope.requestID,
                              pending.retainUntilMilliseconds == Int64(originalOwner.expiresAt.timeIntervalSince1970 * 1000),
                              try PendingAttachmentStorage().read(account: ClosureRootAuthFixture.owner, epoch: Self.ownerScope.epochID) == nil,
                              try PendingAttachmentRemovalStorage().read(account: ClosureRootAuthFixture.owner, epoch: Self.ownerScope.epochID) == nil else { throw CloudError.unavailable }
                        // Only after protected original hashes and actual absent
                        // Auth + matching real pending marker have been checked.
                        try Data("restart-verified".utf8).write(to: NativeStore.closureRootInterruptionFile, options: .atomic)
                    } else { guard trace == Data("restart-verified".utf8) else { throw CloudError.unavailable } }
                    interruptionRestored = true
                }
                self.auth = auth; ownerServer = owner; familyServer = family
                store = prepared
            } catch { message = "通常画面のサンプルを準備できませんでした。実際の通信や新しい登録は行っていません。" }
        }
    }
    private func verifyFinalLocalState(_ store: NativeStore) async {
        let revision = store.accountBindingRevision
        verified = false
        do {
            guard let auth, let ownerServer, let familyServer,
                  await auth.expectedSequenceObserved(), try await store.closureRootPreviewHasNoAuth(),
                  try KeychainSessionStorage(service: "dev.ouchi.review.closure.root-synthetic-auth").read() == nil,
                  let owner = try store.closureReadVault.read(requestID: Self.ownerScope.requestID),
                  let family = try store.closureReadVault.read(requestID: Self.familyScope.requestID),
                  try store.closureReadVault.references().count == 2,
                  await ownerServer.matches(owner), await familyServer.matches(family) else { return }
            guard !Task.isCancelled, store.accountBindingRevision == revision else { return }
            let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
            let exports = ManagedExportStorage(root: caches.appendingPathComponent("OuchiManagedExports", isDirectory: true))
            guard try exports.files(account: ClosureRootAuthFixture.owner).isEmpty,
                  try exports.files(account: ClosureRootAuthFixture.family).count == 1,
                  try HouseholdSnapshotStorage(namespace: "closure-root-preview").read(account: ClosureRootAuthFixture.owner) == nil,
                  try PendingAttachmentStorage().read(account: ClosureRootAuthFixture.owner, epoch: Self.ownerScope.epochID) == nil,
                  try PendingAttachmentRemovalStorage().read(account: ClosureRootAuthFixture.owner, epoch: Self.ownerScope.epochID) == nil,
                  try AppAttestKeyReferenceStorage(namespace: "dev.ouchi.review.closure").pendingClosure(account: ClosureRootAuthFixture.owner) == nil else { return }
            if ProcessInfo.processInfo.arguments.contains("--ouchi-root-interrupt-after-auth") {
                guard interruptionRestored,
                      try Data(contentsOf: NativeStore.closureRootInterruptionFile) == Data("restart-verified".utf8) else { return }
            }
            verified = true
            print("PASS: real root sign-in/retired-enrollment denial/scoped local cleanup and family local-only sign-out; both original protected capabilities and foreign export retained; synthetic transport only.")
            fflush(nil)
        } catch { verified = false }
    }
}
#endif
