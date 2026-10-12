import SwiftUI
import OuchiCore

/// Read-only screen; callers must supply the dedicated vault and a new revision
/// whenever the visible account/session changes. Live navigation remains gated.
@MainActor struct SavedDeletionReceiptsView: View {
    let userID: UUID?
    let revision: UUID
    let available: Bool
    let vault: DeletionReadCredentialVault
    let flow: DeletionReceiptRecoveryFlow
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
                        if reference.expiresAt <= Date() {
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
        guard available, !busy, activeContext == context, activeRevision == revision, reference.expiresAt > Date(),
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
