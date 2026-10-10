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
    @Published private(set) var calendarURL: URL?
    @Published private(set) var familyMembers: [FamilyMember] = []
    @Published private(set) var inviteCode: String?
    @Published private(set) var familyHomeID: String?
    private let api: HouseholdAPI?
    private let session: SessionController?
    private var generation = 0
    private var familyGeneration = 0
    let purchases = PurchaseManager()
    private var billingAccount: UUID?
    @Published private(set) var sandboxEntitlement: SandboxEntitlement?
    private let reminders = LocalReminders()
    @Published private(set) var remindersEnabled = false

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
        await reminders.reset(clearPreference: false)
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
    func signUp(email: String, password: String) async {
        guard !busy, let session else { return }
        busy = true; message = nil
        let expected = generation
        do {
            let authenticated = try await session.signUp(email: email, password: password)
            guard expected == generation else { return }
            signedIn = authenticated; busy = false
            if authenticated { await reload() }
            else { message = "確認メールが必要な場合は、メールのリンクを開いてからログインしてください。迷惑メールフォルダも確認してください。" }
        } catch { if expected == generation { busy = false; message = "登録を完了できませんでした。入力内容を確認し、メール送信の上限の場合は時間をおいてお試しください。" } }
    }
    func requestPasswordReset(email: String) async {
        guard !busy, let api else { return }
        busy = true; message = nil
        let expected = generation
        do {
            try await api.requestPasswordReset(email: email)
            if expected == generation { message = "登録済みの場合、再設定メールが届きます。メールのリンクでパスワードを変更し、このアプリでログインしてください。" }
        } catch { if expected == generation { message = "メールを送信できませんでした。入力内容と通信を確認し、時間をおいてお試しください。" } }
        if expected == generation { busy = false }
    }
    func signOut() async {
        generation += 1
        remindersEnabled = false
        household = nil; signedIn = false; busy = true
        await reminders.reset(clearPreference: true)
        purchases.stopObserving(); purchases.persist = nil
        billingAccount = nil; sandboxEntitlement = nil
        household = nil; homeID = ""; signedIn = false; busy = false
        clearFamily()
        if let exportURL { try? FileManager.default.removeItem(at: exportURL) }
        exportURL = nil
        if let calendarURL { try? FileManager.default.removeItem(at: calendarURL) }
        calendarURL = nil
        do { try await session?.signOut() }
        catch { message = "この端末のログイン情報を削除できませんでした。もう一度お試しください。" }
    }
    func prepareExport() {
        guard !busy, let household else { return }
        do {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-maintenance-\(UUID().uuidString).json")
            try Backup.encode(household).write(to: url, options: [.atomic, .completeFileProtection])
            if let old = exportURL { try? FileManager.default.removeItem(at: old) }
            exportURL = url
        } catch { message = "書き出しできませんでした。" }
    }
    private func bindSandboxBilling(account: UUID) {
        #if DEBUG
        guard Bundle.main.object(forInfoDictionaryKey: "IOS_SANDBOX_BILLING") as? String == "YES",
              billingAccount != account, let session else { return }
        purchases.stopObserving()
        let expected = generation
        billingAccount = account
        let billing = BillingAPI()
        purchases.persist = { [weak self] signed in
            guard let self, self.generation == expected else { throw CancellationError() }
            let credentials = try await session.credentials()
            guard credentials.user.id == account, self.generation == expected else { throw CancellationError() }
            try await billing.submit(signedTransaction: signed, token: credentials.access_token)
            guard self.generation == expected else { throw CancellationError() }
            let rights = try await billing.entitlement(token: credentials.access_token)
            guard self.generation == expected else { throw CancellationError() }
            self.sandboxEntitlement = rights
        }
        purchases.startObserving(account: account)
        Task { [weak self] in
            guard let self, self.generation == expected else { return }
            do { try await self.purchases.observeUnfinished(account: account) }
            catch { if self.generation == expected { self.purchases.markRetryNeeded() } }
        }
        #endif
    }
    func setReminders(_ enabled: Bool) async {
        guard !busy else { return }
        busy = true
        let expected = generation
        do {
            if enabled, let data = household, let session {
                let credentials = try await session.credentials()
                guard expected == generation else { return }
                let accepted = try await reminders.enable(data: data, account: credentials.user.id)
                guard expected == generation else { return }
                remindersEnabled = accepted
                if !accepted { message = "通知は許可されていません。iPhoneの設定で通知を確認してください。" }
            } else { await reminders.reset(clearPreference: true); if expected == generation { remindersEnabled = false } }
        } catch { if expected == generation { remindersEnabled = false; message = "通知を設定できませんでした。もう一度お試しください。" } }
        if expected == generation { busy = false }
    }
    func prepareCalendar() {
        guard !busy, let household else { return }
        do {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-maintenance-\(UUID().uuidString).ics")
            try CalendarExport.encode(household).write(to: url, options: [.atomic, .completeFileProtection])
            if let old = calendarURL { try? FileManager.default.removeItem(at: old) }
            calendarURL = url
        } catch { message = "予定を書き出せませんでした。記録と日付を確認してください。" }
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
            bindSandboxBilling(account: credentials.user.id)
            let notificationState = (try? await reminders.reconcile(data: value, account: credentials.user.id)) ?? false
            guard expected == generation else { return }
            remindersEnabled = notificationState
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
            let notificationState = (try? await reminders.reconcile(data: fresh, account: credentials.user.id)) ?? false
            guard expected == generation else { return }
            remindersEnabled = notificationState
        } catch {
            if expected == generation { message = "保存結果を確認できません。再読み込みして履歴を確認してください。" }
        }
        if expected == generation { busy = false }
    }

    func saveProduct(_ value: Appliance, creating: Bool, tasks: [CareTask] = []) async -> Bool {
        guard let data = household, value.homeId == homeID,
              data.homes.contains(where: { $0.id == value.homeId }),
              creating ? !data.products.contains(where: { $0.id == value.id }) : data.products.contains(where: { $0.id == value.id && $0.homeId == value.homeId }) else { return false }
        return await save { api, token in try await api.saveProduct(value, creating: creating, tasks: tasks, token: token) }
    }
    func saveTask(_ value: CareTask, creating: Bool) async -> Bool {
        guard let data = household, data.products(in: homeID).contains(where: { $0.id == value.productId }),
              creating ? !data.tasks.contains(where: { $0.id == value.id }) : data.tasks.contains(where: { $0.id == value.id && $0.productId == value.productId }) else { return false }
        return await save { api, token in try await api.saveTask(value, creating: creating, token: token) }
    }
    private func save(_ mutation: (HouseholdAPI, String) async throws -> Void) async -> Bool {
        guard !busy, let api, let session else { return false }
        busy = true; message = nil
        let expected = generation
        do {
            let credentials = try await session.credentials()
            guard expected == generation else { return false }
            try await mutation(api, credentials.access_token)
            let fresh = try await api.load(token: credentials.access_token)
            guard expected == generation else { return false }
            household = fresh
            let notificationState = (try? await reminders.reconcile(data: fresh, account: credentials.user.id)) ?? false
            guard expected == generation else { return false }
            remindersEnabled = notificationState
            busy = false
            return true
        } catch {
            if expected == generation {
                message = error as? CloudError == .invalidInput ? "入力内容を確認してください。周期は1〜3650日、日付はYYYY-MM-DDで入力してください。" : "保存結果を確認できません。再読み込みして記録を確認してください。"
                busy = false
            }
            return false
        }
    }

    func deleteProduct(_ product: Appliance) async -> Bool {
        guard product.homeId == homeID,
              household?.products(in: homeID).contains(where: { $0.id == product.id }) == true else { return false }
        return await save { api, token in try await api.deleteRecord(.product, id: product.id, token: token) }
    }
    func deleteTask(_ task: CareTask) async -> Bool {
        guard household?.tasks(in: homeID).contains(where: { $0.id == task.id && $0.productId == task.productId }) == true else { return false }
        return await save { api, token in try await api.deleteRecord(.task, id: task.id, token: token) }
    }
    func createHome(name: String, kind: String) async -> Bool {
        await save { api, token in try await api.createHome(name: name, kind: kind, token: token) }
    }
    func updateHome(id: String, name: String, kind: String) async -> Bool {
        guard household?.homes.first(where: { $0.id == id })?.role == "owner" else { return false }
        return await save { api, token in try await api.updateHome(id: id, name: name, kind: kind, token: token) }
    }
    func restoreBackup(_ value: Household) async -> Bool {
        do {
            let prepared = try Backup.prepareRestore(value)
            return await save { api, token in try await api.restoreBackup(prepared, token: token) }
        } catch { message = "バックアップの内容を確認できません。対応するファイルを選んでください。"; return false }
    }
    func clearFamily() { familyGeneration += 1; familyMembers = []; inviteCode = nil; familyHomeID = nil }
    func loadMembers(home: String) async {
        guard !busy, home == homeID, let api, let session else { return }
        clearFamily(); busy = true
        let expectedFamily = familyGeneration
        let expected = generation
        do {
            let credentials = try await session.credentials()
            let members = try await api.members(home: home, token: credentials.access_token)
            guard expected == generation, expectedFamily == familyGeneration, home == homeID else { if expected == generation { busy = false }; return }
            familyMembers = members; familyHomeID = home
        } catch { if expected == generation { message = "家族一覧を取得できませんでした。" } }
        if expected == generation { busy = false }
    }
    func createInvite(home: String) async {
        guard !busy, home == homeID, household?.homes.first(where: { $0.id == home })?.role == "owner",
              let api, let session else { return }
        inviteCode = nil; busy = true
        let expectedFamily = familyGeneration
        let expected = generation
        do {
            let credentials = try await session.credentials()
            guard expected == generation else { return }
            let code = try await api.createInvite(home: home, token: credentials.access_token)
            if expected == generation, expectedFamily == familyGeneration, home == homeID { inviteCode = code; familyHomeID = home }
        } catch { if expected == generation { message = "招待の作成結果を確認できません。必要なら未使用の招待を取り消してください。" } }
        if expected == generation { busy = false }
    }
    func joinFamily(code: String, name: String) async -> Bool {
        let success = await save { api, token in try await api.acceptInvite(code: code, name: name, token: token) }
        if success { clearFamily() }
        return success
    }
    func revokeInvites(home: String) async {
        guard home == homeID, household?.homes.first(where: { $0.id == home })?.role == "owner" else { return }
        if await save({ api, token in try await api.revokeInvites(home: home, token: token) }) { inviteCode = nil }
    }
    func removeMember(home: String, user: UUID?) async {
        guard !busy, home == homeID, let session,
              let role = household?.homes.first(where: { $0.id == home })?.role else { return }
        if user != nil && role != "owner" { return }
        if user == nil && role != "member" { return }
        let expected = generation
        let success = await save { api, token in
            let own = try await session.credentials()
            guard expected == self.generation else { throw CancellationError() }
            try await api.removeMember(home: home, user: user ?? own.user.id, token: token)
        }
        if success { clearFamily(); await loadMembers(home: homeID) }
    }
}
