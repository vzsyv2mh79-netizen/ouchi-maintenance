import SwiftUI
import OuchiCore

/// Prepared screen. Not connected to Settings until full server/device erasure,
/// the shared-login boundary and retention disclosure have been finalized.
@MainActor struct AccountDeletionView: View {
    let accountID: UUID
    let bindingRevision: UUID
    let available: Bool
    let deletionExplanation: String
    let token: () -> String?
    let exportAvailable: Bool
    let export: () -> Void
    // The adapter must check this immutable binding before every side effect.
    // A view's post-await check cannot undo cleanup applied to a new account.
    let cleanupLocalNotifications: (_ expectedAccount: UUID, _ expectedRevision: UUID) async -> Bool
    let flow: AccountDeletionFlow
    @State private var operation: Task<Void, Never>?
    @State private var activeRevision: UUID?
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
                    if cleanupPending { Text("この端末の通知を停止できたか確認が必要です。") }
                    Button("状況を確認") { startOperation { await recover() } }.disabled(busy || !ready)
                    if cleanupPending {
                        Button("この端末の通知停止を再確認") { startOperation { await cleanNotifications() } }.disabled(busy)
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
        .task(id: bindingRevision) {
            operation?.cancel(); operation = nil
            activeRevision = bindingRevision
            password = ""; consent = false; receipt = nil; cleanupPending = false; busy = false; message = nil
            flow.bind(accountID: accountID, revision: bindingRevision)
            if ready { await recover() }
        }
        .onDisappear {
            operation?.cancel(); operation = nil
            activeRevision = nil
            password = ""
            flow.bind(accountID: nil)
        }
    }

    private func startOperation(_ action: @escaping @MainActor () async -> Void) {
        guard !busy, activeRevision == bindingRevision else { return }
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
        let expected = bindingRevision
        busy = true; defer { if expected == activeRevision { busy = false } }
        do {
            let recovered = try await flow.recover(token: bearer)
            guard expected == activeRevision, !Task.isCancelled else { return }
            receipt = recovered; message = nil
            if recovered != nil {
                cleanupPending = true
                let cleaned = await cleanupLocalNotifications(accountID, expected)
                guard expected == activeRevision, !Task.isCancelled else { return }
                cleanupPending = !cleaned
            }
        }
        catch { guard expected == activeRevision, !Task.isCancelled else { return }; message = "状況を確認できません。通信できる状態で、もう一度確認してください。" }
    }
    private func submit() async {
        guard ready, !busy, consent, let bearer = token() else { return }
        let entered = password; password = ""
        let expected = bindingRevision
        busy = true; defer { if expected == activeRevision { busy = false } }
        do {
            let accepted = try await flow.submit(password: entered, token: bearer)
            guard expected == activeRevision, !Task.isCancelled else { return }
            receipt = accepted
            message = nil
            if receipt != nil {
                cleanupPending = true
                let cleaned = await cleanupLocalNotifications(accountID, expected)
                guard expected == activeRevision, !Task.isCancelled else { return }
                cleanupPending = !cleaned
            }
        } catch {
            guard expected == activeRevision, !Task.isCancelled else { return }
            message = "申請の結果を確認できません。再申請する前に状況を確認してください。"
            // Recover first after an ambiguous response; never infer completion.
            do {
                let recovered = try await flow.recover(token: bearer)
                guard expected == activeRevision, !Task.isCancelled else { return }
                receipt = recovered
                if recovered != nil { cleanupPending = true }
            } catch {}
        }
    }
    private func cleanNotifications() async {
        guard !busy, receipt != nil, activeRevision == bindingRevision else { return }
        let expected = bindingRevision
        busy = true; defer { if expected == activeRevision { busy = false } }
        let cleaned = await cleanupLocalNotifications(accountID, expected)
        guard expected == activeRevision, !Task.isCancelled else { return }
        cleanupPending = !cleaned
    }
}
