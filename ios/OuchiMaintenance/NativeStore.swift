import Foundation
import Combine
import OuchiCore

@MainActor final class NativeStore: ObservableObject {
    @Published private(set) var household: Household?
    @Published private(set) var signedIn = false
    @Published private(set) var busy = false
    @Published var message: String?
    @Published var homeID = ""
    @Published private(set) var exportURL: URL?
    private let api: HouseholdAPI?
    private let session: SessionController?
    private var generation = 0
    let purchases = PurchaseManager()

    init() {
        let info = Bundle.main.infoDictionary ?? [:]
        if let address = info["SUPABASE_URL"] as? String, let url = URL(string: address),
           let key = info["SUPABASE_PUBLISHABLE_KEY"] as? String,
           let config = try? CloudConfiguration(url: url, publishableKey: key) {
            let client = HouseholdAPI(config: config)
            api = client
            session = SessionController(api: client, storage: KeychainSessionStorage(service: (Bundle.main.bundleIdentifier ?? "ouchi") + "." + (url.host ?? "")))
        } else { api = nil; session = nil }
    }
    func restore() async {
        guard let session else { message = "クラウド接続の設定が必要です。"; return }
        do { signedIn = try await session.restore(); if signedIn { await reload() } }
        catch { message = "保存したログインを確認できません。ログインし直してください。" }
    }
    func signIn(email: String, password: String) async {
        guard !busy, let session else { message = "クラウド接続の設定が必要です。"; return }
        busy = true; message = nil
        let expected = generation
        do {
            try await session.signIn(email: email, password: password)
            guard generation == expected else { return }
            signedIn = true
            busy = false
            await reload()
        } catch {
            if expected == generation { message = "ログインできませんでした。メールアドレスとパスワードを確認してください。"; busy = false }
        }
    }
    func signOut() async {
        generation += 1
        purchases.stopObserving(); purchases.persist = nil
        household = nil; homeID = ""; signedIn = false; busy = false
        if let exportURL { try? FileManager.default.removeItem(at: exportURL) }
        exportURL = nil
        do { try await session?.signOut() }
        catch { message = "この端末のログイン情報を削除できませんでした。もう一度お試しください。" }
    }
    func prepareExport() {
        guard !busy, let household else { return }
        do {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-maintenance-\(UUID().uuidString).json")
            try household.export().write(to: url, options: [.atomic, .completeFileProtection])
            if let old = exportURL { try? FileManager.default.removeItem(at: old) }
            exportURL = url
        } catch { message = "書き出しできませんでした。" }
    }
    func reload() async {
        guard !busy, let api, let session else { return }
        busy = true; message = nil
        let expected = generation
        do {
            let credentials = try await session.credentials()
            let value = try await api.load(token: credentials.access_token)
            guard expected == generation else { return }
            household = value
            if !value.homes.contains(where: { $0.id == homeID }) { homeID = value.homes.first?.id ?? "" }
        } catch {
            if expected == generation {
                message = "記録を取得できませんでした。通信とログイン状態を確認してください。"
            }
        }
        if expected == generation { busy = false }
    }
    func complete(_ task: CareTask) async {
        guard !busy, let api, let session,
              household?.tasks(in: homeID).contains(where: { $0.id == task.id }) == true else { return }
        busy = true; message = nil
        let expected = generation
        do {
            let credentials = try await session.credentials()
            try await api.complete(task: task.id, token: credentials.access_token)
            let fresh = try await api.load(token: credentials.access_token)
            guard expected == generation else { return }
            household = fresh
        } catch {
            if expected == generation { message = "保存結果を確認できません。再読み込みして履歴を確認してください。" }
        }
        if expected == generation { busy = false }
    }
}
