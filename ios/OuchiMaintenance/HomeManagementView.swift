import SwiftUI
import OuchiCore

/// Prepared member screen. Shipping navigation remains gated until the backend,
/// durable Keychain custody and reviewed retirement dispatcher are integrated.
@MainActor struct HomeManagementView: View {
    @Environment(\.dismiss) private var dismiss
    let accountID: UUID
    let epochID: UUID
    let homeID: UUID
    let revision: UUID
    let homeName: String
    let restored: HomeManagementIntent?
    let authorize: @MainActor () async throws -> String
    let onConfirmed: @MainActor () async -> Void
    let removeConfirmed: (@MainActor (HomeManagementIntent) throws -> Void)?
    let onClose: @MainActor () -> Void
    @State private var flow: HomeManagementFlow
    @State private var status: HomeManagementStatus?
    @State private var receipt: HomeManagementClaim?
    @State private var busy = false
    @State private var message: String?
    @State private var referenceCleaned = false
    @State private var confirmation: Action?
    @State private var operation: Task<Void, Never>?
    @State private var screenGeneration = UUID()
    private enum Action { case refresh, start, retry, removeReference }
    init(accountID: UUID, epochID: UUID, homeID: UUID, revision: UUID, homeName: String,
         restored: HomeManagementIntent? = nil, api: HomeManagementAPI = HomeManagementAPI(),
         persist: @escaping @MainActor (HomeManagementIntent) throws -> HomeManagementIntent,
         authorize: @escaping @MainActor () async throws -> String,
         removeConfirmed: (@MainActor (HomeManagementIntent) throws -> Void)? = nil,
         onClose: @escaping @MainActor () -> Void = {},
         onConfirmed: @escaping @MainActor () async -> Void) {
        self.accountID = accountID; self.epochID = epochID; self.homeID = homeID; self.revision = revision
        self.homeName = homeName; self.restored = restored; self.authorize = authorize; self.onConfirmed = onConfirmed
        self.removeConfirmed = removeConfirmed; self.onClose = onClose
        _flow = State(initialValue: HomeManagementFlow(api: api, persist: persist))
    }
    var body: some View {
        Form {
            Section("住まいの管理") {
                Text(homeName).fixedSize(horizontal: false, vertical: true)
                if let status {
                    if status.state == .awaitingManagement {
                        Text("管理者が不在です。家電とお手入れの記録は、参加している家族で引き続き使えます。")
                        Text("管理を引き受けると、家族の招待や住まいの設定を管理できます。記録は残り、有料プランの契約は変わりません。")
                        if status.canClaim, flow.intent == nil {
                            Button("管理を引き受ける") { confirmation = .start }.disabled(busy).accessibilityIdentifier("home-management.claim")
                        } else if !status.canClaim {
                            Text("管理の引き受けは現在利用できません。時間をおいて状態を確認してください。")
                        }
                    } else { Text("この住まいには管理者がいます。") }
                } else { Text("住まいの管理状態を確認してください。") }
                Button("状態と結果を確認する") { run(.refresh) }.disabled(busy).accessibilityIdentifier("home-management.check")
                if busy { ProgressView("確認しています…") }
            }
            if let receipt {
                Section("操作の結果") {
                    switch receipt.state {
                    case .claimed: Text("この操作で管理を引き受けました。最新の住まいの記録を読み込み直してください。").accessibilityIdentifier("home-management.claimed")
                    case .superseded: Text("この操作の後に管理状態が変わっています。古い操作は再送せず、現在の状態を確認してください。").accessibilityIdentifier("home-management.superseded")
                    case .notRecorded:
                        Text("この受付番号の記録はまだ確認できません。再送する場合も、同じ受付番号を使います。")
                        Button("同じ操作をもう一度送る") { confirmation = .retry }.disabled(busy || status?.canClaim != true)
                    }
                }
            }
            if let intent = flow.intent {
                Section("確認用の受付番号") {
                    Text(intent.requestID.uuidString.lowercased()).font(.body.monospaced()).textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("home-management.request-id")
                    Text("通信が切れたときは、この番号の結果を確認します。確認だけで管理が変更されることはありません。")
                    if receipt?.state == .claimed || receipt?.state == .superseded, removeConfirmed != nil {
                        Button("確認済みの受付番号を整理", role: .destructive) { confirmation = .removeReference }.disabled(busy).accessibilityIdentifier("home-management.remove-reference")
                    }
                }
            }
            if let message { Section { Text(message).fixedSize(horizontal: false, vertical: true).accessibilityIdentifier(referenceCleaned ? "home-management.reference-cleaned" : "home-management.message") } }
        }
        .navigationTitle("住まいの管理").navigationBarTitleDisplayMode(.inline)
        .task(id: revision) { reset(); run(.refresh) }
        .onChange(of: homeID) { _, _ in reset(); run(.refresh) }
        .onChange(of: accountID) { _, _ in reset(); run(.refresh) }
        .onChange(of: epochID) { _, _ in reset(); run(.refresh) }
        .onDisappear { operation?.cancel(); screenGeneration = UUID(); flow.bind(accountID: nil, epochID: nil, homeID: nil, revision: nil); busy = false; onClose() }
        .confirmationDialog(confirmation == .removeReference ? "この端末の受付番号だけ削除しますか？住まいの記録と管理者は変わりません。" : "\(homeName)の管理を引き受けますか？家族の招待と住まいの設定を管理できるようになります。", isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }), titleVisibility: .visible) {
            if let action = confirmation { Button(action == .removeReference ? "この端末の受付番号を削除" : "管理を引き受ける", role: action == .removeReference ? .destructive : nil) { confirmation = nil; run(action) }.accessibilityIdentifier("home-management.confirm") }
        }
    }
    private func reset() {
        operation?.cancel(); screenGeneration = UUID(); busy = false; status = nil; receipt = nil; message = nil; referenceCleaned = false; confirmation = nil
        flow.bind(accountID: accountID, epochID: epochID, homeID: homeID, revision: revision, restored: restored)
    }
    private func run(_ action: Action) {
        guard !busy else { return }
        let expected = screenGeneration; busy = true; message = nil; referenceCleaned = false
        operation = Task { @MainActor in
            defer { if expected == screenGeneration { busy = false } }
            do {
                let token = try await authorize()
                try Task.checkCancellation(); guard expected == screenGeneration else { return }
                let value: HomeManagementClaim?
                switch action {
                case .refresh:
                    value = flow.intent == nil ? nil : try await flow.recover(token: token)
                    let loaded = try await flow.load(token: token)
                    guard expected == screenGeneration, !Task.isCancelled else { return }
                    status = loaded
                case .start: value = try await flow.start(token: token)
                case .retry: value = try await flow.retry(token: token)
                case .removeReference:
                    guard let receipt, receipt.state == .claimed || receipt.state == .superseded,
                          let removeConfirmed else { throw CloudError.unavailable }
                    try flow.forgetConfirmedReference(remove: removeConfirmed)
                    self.receipt = nil; status = nil; referenceCleaned = true
                    message = "この端末の受付番号を削除しました。住まいの記録と管理者は変わりません。"
                    dismiss(); return
                }
                guard expected == screenGeneration, !Task.isCancelled else { return }
                receipt = value
                if value?.state == .claimed { await onConfirmed() }
            } catch HomeManagementAuthenticationError.additionalVerificationRequired {
                guard expected == screenGeneration, !Task.isCancelled else { return }
                message = "最近の本人確認が必要です。ログインまたは認証アプリで確認した後、操作の結果を確認してください。自動では再送しません。"
            } catch {
                guard expected == screenGeneration, !Task.isCancelled else { return }
                receipt = flow.receipt
                if action == .removeReference {
                    message = "端末内の受付番号を整理した結果を確認できませんでした。端末のロックを解除して、もう一度確認してください。整理は完了扱いにしていません。"
                } else if receipt?.state == .claimed {
                    message = "管理を引き受けた受付結果は確認できましたが、最新の住まいの状態を読み込めませんでした。通信を確認してから、もう一度状態を確認してください。"
                } else {
                    message = "結果を確認できませんでした。通信とログイン状態を確認してから「状態と結果を確認する」を押してください。管理を引き受けたものとしては扱っていません。"
                }
            }
        }
    }
}

#if DEBUG
/// The only persistent simulated backend is in an isolated review bundle, using
/// synthetic request IDs. Production app identity, Auth and networking are absent.
private actor HomeManagementPreviewServer {
    private let defaults = UserDefaults.standard
    func reply(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        guard Bundle.main.bundleIdentifier == "dev.ouchi.review.closure",
              request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic-management-preview",
              let epoch = request.value(forHTTPHeaderField: "X-Ouchi-App-Epoch"),
              let url = request.url else { throw CloudError.unavailable }
        let home = url.lastPathComponent
        let generation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        var claimed = defaults.stringArray(forKey: "management-preview-claimed") ?? []
        var posts = defaults.integer(forKey: "management-preview-posts")
        var value: [String: Any]
        if request.httpMethod == "POST" {
            guard let data = request.httpBody, let body = try JSONSerialization.jsonObject(with: data) as? [String: String],
                  body["confirmation"] == "CLAIM_HOME_MANAGEMENT", body["generation"] == generation,
                  let id = body["requestID"] else { throw CloudError.invalidInput }
            posts += 1; defaults.set(posts, forKey: "management-preview-posts")
            if !claimed.contains(id) { claimed.append(id); defaults.set(claimed, forKey: "management-preview-claimed") }
            if posts == 1 && ProcessInfo.processInfo.arguments.contains("--ouchi-management-lost-ack-preview") { throw URLError(.networkConnectionLost) }
            value = ["kind": "ownerless-home-claim/v1", "requestID": id, "homeID": home, "epochID": epoch, "generation": generation, "state": "claimed"]
        } else if let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems, !query.isEmpty {
            guard let id = query.first(where: { $0.name == "requestID" })?.value else { throw CloudError.invalidInput }
            value = ["kind": "ownerless-home-claim/v1", "requestID": id, "homeID": home, "epochID": epoch, "generation": generation, "state": claimed.contains(id) ? "claimed" : "not_recorded"]
        } else {
            value = ["kind": "ownerless-home-status/v1", "homeID": home, "epochID": epoch, "state": claimed.isEmpty ? "awaiting_management" : "managed", "generation": claimed.isEmpty ? generation as Any : NSNull(), "canClaim": claimed.isEmpty]
        }
        return (try JSONSerialization.data(withJSONObject: value), HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
    }
}
@MainActor struct HomeManagementPreview: View {
    private let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let epoch = UUID(uuidString: "99999999-9999-4999-8999-999999999999")!
    private let home = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    private let vault = HomeManagementIntentVault(service: "dev.ouchi.review.management.sample.references")
    @State private var restored: HomeManagementIntent?
    @State private var api: HomeManagementAPI?
    @State private var revision = UUID()
    @State private var previewMessage: String?
    var body: some View {
        NavigationStack {
            if let api {
                HomeManagementView(accountID: account, epochID: epoch, homeID: home, revision: revision,
                    homeName: "サンプルの住まい", restored: restored, api: api,
                    persist: { try vault.prepare($0) }, authorize: { "synthetic-management-preview" },
                    removeConfirmed: { try vault.removeConfirmed($0) }, onConfirmed: {})
                    .safeAreaInset(edge: .top) {
                        Text("確認用サンプル・通信なし").font(.caption)
                            .dynamicTypeSize(...DynamicTypeSize.xxxLarge).padding(8).frame(maxWidth: .infinity).background(.background)
                            .accessibilityIdentifier("home-management.sample")
                    }
            } else { Text(previewMessage ?? "確認用の画面を準備しています") }
        }.task {
            guard Bundle.main.bundleIdentifier == "dev.ouchi.review.closure" else { previewMessage = "専用の確認アプリで表示してください。"; return }
            do {
                restored = try vault.references(accountID: account, epochID: epoch, homeID: home).first
                let server = HomeManagementPreviewServer()
                api = HomeManagementAPI(transport: { try await server.reply($0) })
            } catch { previewMessage = "確認用の受付番号を読み込めませんでした。" }
        }
    }
}
#endif

/// Live settings wiring stays hidden behind the false-by-default app flag.
/// Restart selection lists exact local requests instead of silently generating
/// a replacement ID. Opening or returning here performs no management POST.
@MainActor struct HomeManagementSettingsView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var selection: HomeManagementSelection?
    @State private var references: [HomeManagementIntent] = []
    @State private var loaded = false
    @State private var loading = false
    @State private var message: String?
    @State private var generation = UUID()
    private var context: String { store.accountBindingRevision.uuidString + ":" + store.homeID }
    var body: some View {
        Form {
            if let selection, store.homeManagementSelectionIsCurrent(selection), loaded {
                if references.isEmpty {
                    Section("住まいの管理") {
                        NavigationLink("管理状態を確認する") { screen(selection, restored: nil) }
                        Text("状態の確認だけでは、管理者は変わりません。")
                    }
                } else {
                    Section("保存した操作の結果を確認") {
                        Text("保存済みの操作があります。先にその結果を確認してください。確認しても操作は再送されません。")
                        ForEach(references, id: \.requestID) { intent in
                            NavigationLink {
                                screen(selection, restored: intent)
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("保存した操作を開く")
                                    Text(intent.requestID.uuidString.lowercased()).font(.caption.monospaced())
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                }
            } else {
                Section {
                    if loading { ProgressView("登録と保存した操作を確認中") }
                    else { Text(message ?? "住まいの管理状態を準備できませんでした。通信とログイン状態を確認してください。") }
                    Button("もう一度確認") { Task { await load() } }.disabled(loading || store.busy)
                }
            }
        }
        .navigationTitle("住まいの管理").navigationBarTitleDisplayMode(.inline)
        .task(id: context) { await load() }
        .onDisappear { generation = UUID(); loading = false }
    }
    private func screen(_ selection: HomeManagementSelection, restored: HomeManagementIntent?) -> some View {
        HomeManagementView(accountID: selection.accountID, epochID: selection.epochID, homeID: selection.homeID,
            revision: selection.revision, homeName: store.household?.homes.first(where: { UUID(uuidString: $0.id) == selection.homeID })?.name ?? "住まい",
            restored: restored, persist: { intent in
                guard store.homeManagementSelectionIsCurrent(selection), intent.accountID == selection.accountID,
                      intent.epochID == selection.epochID, intent.homeID == selection.homeID else { throw CloudError.authenticationRequired }
                return try store.homeManagementVault.prepare(intent)
            }, authorize: { try await store.authorizeHomeManagement(selection) }, removeConfirmed: { intent in
                guard store.homeManagementSelectionIsCurrent(selection), intent.accountID == selection.accountID,
                      intent.epochID == selection.epochID, intent.homeID == selection.homeID else { throw CloudError.authenticationRequired }
                try store.homeManagementVault.removeConfirmed(intent)
            }, onClose: { refreshReferences(selection) }, onConfirmed: {
                guard store.homeManagementSelectionIsCurrent(selection) else { return }
                await store.reload()
            })
    }
    private func load() async {
        let expected = UUID(); generation = expected; loading = true; loaded = false; references = []; selection = nil; message = nil
        let prepared = await store.prepareHomeManagement()
        guard !Task.isCancelled, expected == generation else { return }
        loading = false
        guard let prepared, store.homeManagementSelectionIsCurrent(prepared) else { return }
        selection = prepared; refreshReferences(prepared)
    }
    private func refreshReferences(_ selection: HomeManagementSelection) {
        guard store.homeManagementSelectionIsCurrent(selection) else { return }
        do {
            references = try store.homeManagementVault.references(accountID: selection.accountID, epochID: selection.epochID, homeID: selection.homeID)
            loaded = true; message = nil
        } catch {
            loaded = false; message = "保存した操作を読み込めませんでした。端末のロックを解除して、もう一度確認してください。新しい操作は送信していません。"
        }
    }
}
