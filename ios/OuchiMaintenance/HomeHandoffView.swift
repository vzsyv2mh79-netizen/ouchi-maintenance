import SwiftUI
import OuchiCore

/// Prepared screen; not linked from shipping settings until server/Auth/Storage
/// handoff and durable request custody have passed integration review.
@MainActor struct HomeHandoffView: View {
    let binding: HomeHandoffBinding
    let bindingRevision: UUID
    let homeName: String
    let recipientName: String
    let recipientID: UUID?
    let isRecipient: Bool
    let authorize: @MainActor () async throws -> String
    @State private var flow: HomeHandoffFlow
    @State private var status: HomeHandoffStatus?
    @State private var busy = false
    @State private var message: String?
    @State private var confirm: Action?
    @State private var operation: Task<Void, Never>?
    @State private var screenGeneration = UUID()
    private enum Action: String, Identifiable { case request, accept, cancel; var id: String { rawValue } }

    init(binding: HomeHandoffBinding, bindingRevision: UUID, homeName: String, recipientName: String,
         recipientID: UUID?, isRecipient: Bool, api: HomeHandoffAPI = HomeHandoffAPI(),
         intentService: String? = nil,
         authorize: @escaping @MainActor () async throws -> String) {
        self.binding = binding; self.bindingRevision = bindingRevision; self.homeName = homeName
        self.recipientName = recipientName; self.recipientID = recipientID; self.isRecipient = isRecipient; self.authorize = authorize
        let vault = HomeHandoffIntentVault(service: intentService ?? (Bundle.main.bundleIdentifier.map { $0 + ".home-handoff" } ?? ""))
        _flow = State(initialValue: HomeHandoffFlow(api: api, persist: { try vault.prepare(binding: $0, recipientID: $1) }))
    }
    var body: some View {
        Form {
            Section("管理を引き継ぐ住まい") {
                Text(homeName)
                Text("製品・お手入れ・履歴を残したまま、住まいの管理を家族に引き継ぎます。家族が承諾するまでは管理者は変わりません。")
                Text("引き継ぎ後、元の管理者はこの住まいを利用できなくなります。再び共有するには、新しい管理者からの招待が必要です。")
            }
            Section(isRecipient ? "引き継ぎの確認" : "引き継ぐ家族") {
                Text(recipientName)
                if !isRecipient, status == nil, recipientID != nil {
                    Button("この家族に引き継ぎを依頼") { confirm = .request }.disabled(busy)
                }
                if let status {
                    Text(stateText(status.state))
                    if status.state == .pending {
                        Text("有効期限：\(status.expiresAt.formatted(date: .abbreviated, time: .shortened))")
                        if isRecipient { Button("管理を引き受ける") { confirm = .accept }.disabled(busy || status.expiresAt <= Date()) }
                        Button(isRecipient ? "辞退する" : "依頼を取り消す", role: .destructive) { confirm = .cancel }.disabled(busy)
                    }
                }
                Button("結果を確認する") { run(nil) }.disabled(busy)
                if busy { ProgressView("確認しています…") }
                if let message { Text(message).accessibilityLabel(message) }
            }
            Section("確認用の番号") {
                Text(binding.requestID.uuidString.lowercased()).font(.body.monospaced()).textSelection(.enabled)
                Text("通信が切れたときも、この依頼の結果を確認します。番号だけで管理を引き受けることはできません。")
            }
        }
        .navigationTitle("管理の引き継ぎ")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: bindingRevision) { reset() }
        .onChange(of: binding) { _, _ in reset() }
        .onDisappear { operation?.cancel(); flow.bind(nil); screenGeneration = UUID(); busy = false }
        .confirmationDialog(confirmationTitle, isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            if let action = confirm { Button(action == .accept ? "管理を引き受ける" : action == .request ? "引き継ぎを依頼" : "取り消す", role: action == .cancel ? .destructive : nil) { run(action); confirm = nil } }
        }
    }
    private var confirmationTitle: String {
        switch confirm {
        case .request: "\(recipientName)に管理の引き継ぎを依頼しますか？承諾までは変更されません。"
        case .accept: "\(homeName)の管理を引き受けますか？製品・お手入れ・履歴は残ります。"
        case .cancel: "この引き継ぎ依頼を取り消しますか？住まいの管理者は変わりません。"
        case nil: "管理の引き継ぎ"
        }
    }
    private func stateText(_ value: HomeHandoffState) -> String {
        switch value {
        case .pending: "家族の承諾を待っています。"
        case .expired: "有効期限が切れました。この依頼では管理者は変更されません。"
        case .cancelled: "取り消されました。この依頼では管理者は変更されません。"
        case .completed: "管理の引き継ぎが完了しました。"
        }
    }
    private func reset() {
        operation?.cancel(); screenGeneration = UUID(); busy = false; status = nil; message = nil; confirm = nil
        flow.bind(binding, revision: bindingRevision)
    }
    private func run(_ action: Action?) {
        guard !busy else { return }
        let expected = screenGeneration; busy = true; message = nil
        operation = Task { @MainActor in
            defer { if expected == screenGeneration { busy = false } }
            do {
                let token = try await authorize()
                try Task.checkCancellation(); guard expected == screenGeneration else { return }
                let result: HomeHandoffStatus
                switch action {
                case .request:
                    guard let recipientID else { throw CloudError.invalidInput }
                    result = try await flow.request(recipientID: recipientID, token: token)
                case .accept: result = try await flow.decide(accept: true, token: token)
                case .cancel: result = try await flow.decide(accept: false, token: token)
                case nil: result = try await flow.recover(token: token)
                }
                guard expected == screenGeneration, !Task.isCancelled else { return }
                status = result
            } catch HomeHandoffAuthenticationError.additionalVerificationRequired {
                guard expected == screenGeneration, !Task.isCancelled else { return }
                status = nil
                message = "認証アプリによる追加の本人確認が必要です。保存済みの依頼は変更しません。本人確認を完了してから、同じ依頼の結果を確認してください。"
            } catch {
                guard expected == screenGeneration, !Task.isCancelled else { return }
                status = flow.status
                message = "結果を確認できませんでした。「結果を確認する」で再確認してください。確認できるまで、引き継ぎが完了したとは扱いません。"
            }
        }
    }
}

/// Read-only restart recovery. Not linked from shipping navigation yet.
@MainActor struct SavedHomeHandoffIntentsView: View {
    let accountID: UUID
    let currentEpochID: UUID?
    let revision: UUID
    let intentService: String
    let api: HomeHandoffAPI
    let authorize: @MainActor (HomeHandoffBinding) async throws -> String
    @State private var records: [HomeHandoffIntent] = []
    @State private var failure: String?
    @State private var dismissing: HomeHandoffIntent?
    @Environment(\.dynamicTypeSize) private var textSize
    private var vault: HomeHandoffIntentVault { .init(service: intentService) }

    var body: some View {
        List {
            Section {
                Text("この端末に保存した引き継ぎ依頼です。結果の確認は読み取りだけで、管理者の変更や依頼の再送は行いません。")
                Button("保存した依頼を再読み込み") { load() }
                if let failure { Text(failure) }
            }
            if records.isEmpty, failure == nil { Text("このアカウントの保存された依頼はありません。") }
            ForEach(records, id: \.binding.requestID) { item in
                Section {
                    NavigationLink {
                        SavedHomeHandoffDetail(intent: item, accountID: accountID, currentEpochID: currentEpochID,
                                               revision: revision, api: api, authorize: authorize)
                    } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("引き継ぎの結果を確認")
                            Text(item.createdAt.formatted(date: .abbreviated, time: .shortened))
                            Text(item.binding.requestID.uuidString.lowercased()).font(.body.monospaced()).textSelection(.enabled)
                            if currentEpochID != item.binding.epochID { Text("以前の利用登録の記録です。現在の登録では結果を照会できません。") }
                        }
                    }
                    Button("この端末の確認用記録を削除", role: .destructive) { dismissing = item }
                }
            }
        }
        .navigationTitle("保存した引き継ぎ")
        .navigationBarTitleDisplayMode(textSize.isAccessibilitySize ? .inline : .large)
        .task(id: revision) { load() }
        .onChange(of: accountID) { _, _ in load() }
        .onChange(of: currentEpochID) { _, _ in load() }
        .confirmationDialog("この端末の確認用記録だけを削除しますか？家族への依頼は取り消されず、住まいの記録も削除されません。", isPresented: Binding(get: { dismissing != nil }, set: { if !$0 { dismissing = nil } }), titleVisibility: .visible) {
            if let item = dismissing {
                Button("確認用記録だけを削除", role: .destructive) {
                    defer { dismissing = nil }
                    do {
                        guard item.binding.accountID == accountID else { throw CloudError.authenticationRequired }
                        try vault.remove(binding: item.binding); load()
                    } catch { failure = "確認用記録を削除できませんでした。記録は残したまま、再度確認してください。" }
                }
            }
        }
    }
    private func load() {
        records = []; failure = nil; dismissing = nil
        do { records = try vault.references(accountID: accountID) }
        catch { failure = "保存された依頼を読み込めませんでした。端末のロック状態などを確認して、もう一度読み込んでください。" }
    }
}

@MainActor private struct SavedHomeHandoffDetail: View {
    let intent: HomeHandoffIntent
    let accountID: UUID
    let currentEpochID: UUID?
    let revision: UUID
    let api: HomeHandoffAPI
    let authorize: @MainActor (HomeHandoffBinding) async throws -> String
    @State private var status: HomeHandoffStatus?
    @State private var busy = false
    @State private var message: String?
    @State private var operation: Task<Void, Never>?
    @State private var generation = UUID()
    private var available: Bool { intent.binding.accountID == accountID && intent.binding.epochID == currentEpochID }
    var body: some View {
        Form {
            Section("引き継ぎの依頼") {
                Text(intent.binding.requestID.uuidString.lowercased()).font(.body.monospaced()).textSelection(.enabled)
                Text("依頼の結果だけを確認します。承諾・取り消し・新しい依頼の送信は、この画面では行いません。")
                if !available { Text("現在の利用登録では、この依頼を照会できません。保存した番号や相手は変更しません。") }
            }
            Section("確認結果") {
                if let status {
                    Text(description(status.state))
                    Text("依頼の有効期限：\(status.expiresAt.formatted(date: .abbreviated, time: .shortened))")
                } else { Text("まだ最新の結果を確認していません。") }
                Button("結果を確認する") { read() }.disabled(busy || !available)
                if busy { ProgressView("確認しています…") }
                if let message { Text(message) }
            }
        }
        .navigationTitle("引き継ぎの結果").navigationBarTitleDisplayMode(.inline)
        .onChange(of: revision) { _, _ in reset() }
        .onChange(of: accountID) { _, _ in reset() }
        .onChange(of: currentEpochID) { _, _ in reset() }
        .onDisappear { reset() }
    }
    private func reset() { operation?.cancel(); generation = UUID(); status = nil; message = nil; busy = false }
    private func description(_ state: HomeHandoffState) -> String {
        switch state {
        case .pending: "依頼は承諾待ちです。"
        case .completed: "管理の引き継ぎが完了しました。"
        case .expired: "有効期限が切れました。この依頼では管理者は変更されません。"
        case .cancelled: "依頼は取り消されています。"
        }
    }
    private func read() {
        guard available, !busy else { return }
        let expected = generation; busy = true; message = nil
        operation = Task { @MainActor in
            defer { if expected == generation { busy = false } }
            do {
                let token = try await authorize(intent.binding)
                try Task.checkCancellation(); guard expected == generation, available else { return }
                let value = try await api.read(requestID: intent.binding.requestID, homeID: intent.binding.homeID,
                                               epochID: intent.binding.epochID, token: token)
                try Task.checkCancellation(); guard expected == generation, available else { return }
                status = value
            } catch HomeHandoffAuthenticationError.additionalVerificationRequired {
                guard expected == generation, !Task.isCancelled else { return }
                status = nil
                message = "追加の本人確認が必要です。保存された依頼は変更しません。本人確認を完了してから、もう一度結果を確認してください。"
            } catch {
                guard expected == generation, !Task.isCancelled else { return }
                status = nil; message = "結果を確認できませんでした。保存された依頼は変更せず残しています。通信状態やログインを確認して、再度確認してください。"
            }
        }
    }
}

/// Prepared TOTP challenge UI for an existing factor. Never enrolls or removes
/// factors, and completion does not automatically resume a handoff mutation.
@MainActor struct TOTPVerificationView: View {
    let accountID: UUID
    let revision: UUID
    let api: TOTPVerificationAPI
    let controller: SessionController
    let onVerified: @MainActor () async -> Void
    @FocusState private var codeFocused: Bool
    @State private var factors: [TOTPFactor] = []
    @State private var selected: UUID?
    @State private var challenge: TOTPChallenge?
    @State private var code = ""
    @State private var busy = false
    @State private var message: String?
    @State private var reloginRequired = false
    @State private var generation = UUID()
    @State private var operation: Task<Void, Never>?
    var body: some View {
        Form {
            Section("追加の本人確認") {
                Text("登録済みの認証アプリに表示される6桁のコードで確認します。コードはチャットに書かず、この画面に入力してください。")
                Button("登録済みの認証アプリを確認") { run(.load) }.disabled(busy).accessibilityIdentifier("totp.load")
                if !factors.isEmpty {
                    Picker("使う認証アプリ", selection: $selected) {
                        Text("選んでください").tag(Optional<UUID>.none)
                        ForEach(Array(factors.enumerated()), id: \.element.id) { index, factor in
                            Text("認証アプリ \(index + 1)").tag(Optional(factor.id))
                        }
                    }.disabled(busy)
                    Button("確認コードの入力へ") { run(.challenge) }.disabled(busy || selected == nil).accessibilityIdentifier("totp.challenge")
                }
            }
            if let challenge {
                Section("認証アプリのコード") {
                    SecureField("6桁のコード", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode).focused($codeFocused).accessibilityIdentifier("totp.code")
                    Text("有効期限：\(challenge.expiresAt.formatted(date: .omitted, time: .standard))")
                    Button("本人確認する") { run(.verify) }.disabled(busy || code.utf8.count != 6).accessibilityIdentifier("totp.verify")
                    Text("本人確認が終わっても引き継ぎは自動で送信しません。元の依頼の結果を確認してください。")
                }
            }
            if busy { ProgressView("確認しています…") }
            if let message { Text(message).accessibilityIdentifier("totp.message") }
        }
        .navigationTitle("本人確認").navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge:.bottom) {
            if challenge != nil {
                VStack(alignment:.leading,spacing:8) {
                    if message != nil {
                        Text(reloginRequired ? "同じアカウントでログインし直してください。" : "コードと有効期限を確認してください。")
                            .font(.callout).accessibilityIdentifier("totp.inlineError")
                    }
                    HStack {
                    Button("コードで確認") { run(.verify) }
                        .disabled(busy || code.utf8.count != 6)
                        .accessibilityLabel("入力したコードで本人確認")
                        .accessibilityIdentifier("totp.keyboardVerify")
                    Spacer()
                    Button("入力を終える") { codeFocused=false }
                        .accessibilityIdentifier("totp.keyboardDone")
                    }
                }.padding().background(.regularMaterial)
            }
        }
        .onChange(of: accountID) { _, _ in reset() }
        .onChange(of: revision) { _, _ in reset() }
        .onChange(of: selected) { _, _ in challenge = nil; code = "" }
        .onDisappear { reset() }
    }
    private enum Action { case load, challenge, verify }
    private func reset() { codeFocused=false;operation?.cancel(); generation = UUID(); code = ""; challenge = nil; factors = []; selected = nil; busy = false; message = nil; reloginRequired=false }
    private func run(_ action: Action) {
        guard !busy else { return }
        let expected = generation; busy = true; message = nil; reloginRequired=false
        let submittedCode = code
        if action == .verify { code = "";codeFocused=false }
        if action == .load { challenge=nil;code="";factors=[];selected=nil;codeFocused=false }
        operation = Task { @MainActor in
            defer { if expected == generation { busy = false } }
            do {
                try Task.checkCancellation()
                guard expected == generation else { return }
                switch action {
                case .load:
                    let values = try await controller.totpFactors(api: api, expectedAccount: accountID)
                    try Task.checkCancellation(); guard expected == generation else { return }
                    factors = values; selected = values.count == 1 ? values[0].id : nil
                    if values.isEmpty { message = "利用できる登録済みの認証アプリが見つかりませんでした。認証設定を確認してください。設定を自動で変更することはありません。" }
                case .challenge:
                    guard let selected else { throw CloudError.invalidInput }
                    let value = try await controller.totpChallenge(api: api, factorID: selected, expectedAccount: accountID)
                    try Task.checkCancellation(); guard expected == generation else { return }
                    challenge = value; code = ""
                case .verify:
                    guard let challenge else { throw CloudError.invalidInput }
                    try await controller.verifyTOTP(api: api, challenge: challenge, code: submittedCode, expectedAccount: accountID)
                    try Task.checkCancellation(); guard expected == generation else { return }
                    self.challenge = nil; code = ""; message = "本人確認が完了しました。引き継ぎは送信していません。元の依頼の結果を確認してください。"
                    await onVerified()
                }
            } catch {
                guard expected == generation, !Task.isCancelled else { return }
                code = ""
                let expired = error as? CloudError == .authenticationRequired || error as? CloudError == .rejected(403)
                reloginRequired=expired
                message = expired ? "ログインが切れたか、追加の確認が必要です。設定から同じアカウントでログインし直し、認証アプリで確認してください。保存済みの依頼は変更しません。" : "本人確認を完了できませんでした。コードの有効期限やログイン状態を確認してください。保存済みの引き継ぎ依頼は変更しません。"
            }
        }
    }
}
