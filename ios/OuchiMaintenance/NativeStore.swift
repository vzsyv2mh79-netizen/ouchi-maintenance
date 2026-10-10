import Foundation
import Combine
import StoreKit
import OuchiCore

@MainActor final class NativeStore: ObservableObject {
    @Published private(set) var household: Household? { didSet {
        report = nil; reportGeneration += 1
        if !showingOfflineSnapshot, let household, let snapshotAccount {
            try? snapshotStorage?.write(OfflineSnapshot(account: snapshotAccount, household: household))
        }
    } }
    @Published private(set) var showingOfflineSnapshot = false
    private var snapshotAccount: UUID?
    private var snapshotStorage: HouseholdSnapshotStorage?
    @Published private(set) var signedIn = false
    @Published private(set) var busy = false
    @Published var message: String?
    @Published var homeID = "" { didSet { if oldValue != homeID { report = nil; reportGeneration += 1 } } }
    @Published private(set) var exportURL: URL?
    @Published private(set) var calendarURL: URL?
    @Published private(set) var familyMembers: [FamilyMember] = []
    @Published private(set) var inviteCode: String?
    @Published private(set) var familyHomeID: String?
    private let api: HouseholdAPI?
    private let session: SessionController?
    private let isolatedDevelopmentEnabled: Bool
    private var generation = 0
    private var familyGeneration = 0
    private var reportGeneration = 0
    @Published private(set) var report: MaintenanceReport?
    let purchases = PurchaseManager()
    private var billingAccount: UUID?
    private var purchaseAccount: UUID?
    @Published private(set) var sandboxEntitlement: SandboxEntitlement?
    private let reminders = LocalReminders()
    @Published private(set) var remindersEnabled = false

    init() {
        let info = Bundle.main.infoDictionary ?? [:]
        #if DEBUG
        let isolatedDevelopment = ProcessInfo.processInfo.environment["OUCHI_ISOLATED_DEVELOPMENT"] == "true"
        let address = isolatedDevelopment ? "http://127.0.0.1:54321" : info["SUPABASE_URL"] as? String
        let key = isolatedDevelopment ? ProcessInfo.processInfo.environment["OUCHI_ISOLATED_PUBLISHABLE_KEY"] : info["SUPABASE_PUBLISHABLE_KEY"] as? String
        #else
        let isolatedDevelopment = false
        let address = info["SUPABASE_URL"] as? String
        let key = info["SUPABASE_PUBLISHABLE_KEY"] as? String
        #endif
        if let address, let url = URL(string: address), let key,
           let config = try? CloudConfiguration(url: url, publishableKey: key, isolatedDevelopment: isolatedDevelopment) {
            isolatedDevelopmentEnabled = isolatedDevelopment
            let client = HouseholdAPI(config: config)
            snapshotStorage = HouseholdSnapshotStorage(namespace: url.host ?? "unconfigured")
            api = client
            session = SessionController(api: client, storage: KeychainSessionStorage(service: (Bundle.main.bundleIdentifier ?? "ouchi") + "." + (url.host ?? "")))
        } else { api = nil; session = nil; isolatedDevelopmentEnabled = false }
    }
    var developmentLifecycleConfigured: Bool {
        #if DEBUG
        return isolatedDevelopmentEnabled
        #else
        return false
        #endif
    }
    func testAccountLifecycle(password: String, reenrolling: Bool, confirmed: Bool) async {
        guard developmentLifecycleConfigured, !busy, let session, confirmed else { return }
        busy = true; message = nil
        let expected = generation
        do {
            let credentials = try await session.credentials()
            let lifecycle = DevelopmentAccountLifecycleAPI()
            if reenrolling {
                _ = try await lifecycle.reenroll(token: credentials.access_token, password: password, confirmed: confirmed)
                guard expected == generation else { return }
                // A confirmed new enrollment must not fall back to the previous
                // enrollment's records if the following network load fails.
                var cleanupFailed = false
                do { try snapshotStorage?.write(nil) } catch { cleanupFailed = true }
                snapshotAccount = nil; household = nil; showingOfflineSnapshot = false; homeID = ""
                if !clearTemporaryExports() { cleanupFailed = true }
                clearFamily(); billingAccount = nil; purchaseAccount = nil; sandboxEntitlement = nil
                purchases.stopObserving(); purchases.persist = nil
                remindersEnabled = false
                await reminders.reset(clearPreference: true)
                guard expected == generation else { return }
                if cleanupFailed {
                    message = "再登録は完了しましたが、以前の端末内記録を消去できませんでした。ログアウトしてからログインし直してください。"
                    busy = false
                    return
                }
                busy = false
                await reload()
            } else {
                try await lifecycle.closeAppAccess(token: credentials.access_token, password: password, confirmed: confirmed)
                guard expected == generation else { return }
                busy = false
                await signOut()
                if message == nil { message = "テスト用アカウントの利用を終了しました。共通のログイン情報は残ります。" }
            }
        } catch {
            if expected == generation { message = "テスト操作の完了を確認できませんでした。再実行する前にサーバーの状態を確認してください。" }
        }
        if expected == generation { busy = false }
    }
    func restore() async {
        let expected = generation
        await reminders.reset(clearPreference: false)
        guard expected == generation else { return }
        guard let session else { message = "クラウド接続の設定が必要です。"; return }
        do {
            let restored = try await session.restore()
            guard expected == generation else { return }
            signedIn = restored
            if signedIn {
                let account = await session.localAccount()
                guard expected == generation else { return }
                snapshotAccount = account
                if let account = snapshotAccount, let copy = try? snapshotStorage?.read(account: account) {
                    showingOfflineSnapshot = true; household = copy.household
                    homeID = copy.household.homes.first?.id ?? ""
                }
                await reload()
            }
        }
        catch { message = "保存したログインを確認できません。ログインし直してください。" }
    }
    func signIn(email: String, password: String) async {
        guard !busy, let session else { message = "クラウド接続の設定が必要です。"; return }
        busy = true; message = nil
        let expected = generation
        do {
            try await session.signIn(email: email, password: password)
            guard generation == expected else { return }
            let account = await session.localAccount()
            guard expected == generation else { return }
            snapshotAccount = account
            showingOfflineSnapshot = false
            signedIn = true
            busy = false
            await reload()
        } catch {
            if expected == generation { message = "ログインできませんでした。メールアドレスとパスワードを確認してください。"; busy = false }
        }
    }
    func signUp(email: String, password: String) async {
        guard !busy else { return }
        guard let session else { message = "クラウド接続の設定が必要です。"; return }
        busy = true; message = nil
        let expected = generation
        do {
            let authenticated = try await session.signUp(email: email, password: password)
            guard expected == generation else { return }
            let account = await session.localAccount()
            guard expected == generation else { return }
            snapshotAccount = account
            showingOfflineSnapshot = false
            signedIn = authenticated; busy = false
            if authenticated { await reload() }
            else { message = "確認メールが必要な場合は、メールのリンクを開いてからログインしてください。迷惑メールフォルダも確認してください。" }
        } catch { if expected == generation { busy = false; message = "登録を完了できませんでした。入力内容を確認し、メール送信の上限の場合は時間をおいてお試しください。" } }
    }
    func requestPasswordReset(email: String) async {
        guard !busy else { return }
        guard let api else { message = "クラウド接続の設定が必要です。"; return }
        busy = true; message = nil
        let expected = generation
        do {
            try await api.requestPasswordReset(email: email)
            if expected == generation { message = "登録済みの場合、再設定メールが届きます。メールのリンクでパスワードを変更し、このアプリでログインしてください。" }
        } catch { if expected == generation { message = "メールを送信できませんでした。入力内容と通信を確認し、時間をおいてお試しください。" } }
        if expected == generation { busy = false }
    }
    func signOut() async {
        guard !busy else { return }
        busy = true; message = nil
        defer { busy = false }
        generation += 1
        var localCleanupFailed = false
        do { try snapshotStorage?.write(nil) }
        catch { localCleanupFailed = true }
        snapshotAccount = nil; showingOfflineSnapshot = false
        remindersEnabled = false
        household = nil; signedIn = false; busy = true
        await reminders.reset(clearPreference: true)
        purchases.stopObserving(); purchases.persist = nil
        billingAccount = nil; purchaseAccount = nil; sandboxEntitlement = nil
        household = nil; homeID = ""; signedIn = false
        clearFamily()
        if !clearTemporaryExports() { localCleanupFailed = true }
        do { try await session?.signOut() }
        catch { message = "この端末のログイン情報を削除できませんでした。もう一度お試しください。" }
        if localCleanupFailed {
            message = (message.map { $0 + "\n" } ?? "") + "端末内の保存記録や一時ファイルを一部削除できませんでした。アプリを開き直して、再度ログアウトしてください。"
        }
    }
    private func clearTemporaryExports() -> Bool {
        var succeeded = true
        for url in [exportURL, calendarURL].compactMap({ $0 }) {
            do {
                if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
            } catch { succeeded = false }
        }
        exportURL = nil; calendarURL = nil
        return succeeded
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
    var sandboxBillingConfigured: Bool {
        #if DEBUG
        return billingAccount != nil && purchaseAccount != nil && purchases.persist != nil
        #else
        return false
        #endif
    }
    func testTip(_ product: Product) async {
        guard !busy, sandboxBillingConfigured, product.type == .consumable,
              ["ouchi.tip.small", "ouchi.tip.medium", "ouchi.tip.large"].contains(product.id), let session else { return }
        busy = true; message = nil
        let expected = generation
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard expected == generation, billingAccount == credentials.user.id, let purchaseAccount else { return }
            let outcome = try await purchases.purchase(product, account: purchaseAccount)
            guard expected == generation else { return }
            switch outcome {
            case .saved: message = "Sandboxのチップを記録しました。実際の請求はありません。"
            case .pending: message = "購入は保留中です。承認後の結果を確認します。"
            case .cancelled: break
            }
        } catch { if expected == generation { message = "テスト購入を完了できませんでした。Sandbox設定と通信を確認してください。保存できていない取引は未完了として残ります。" } }
    }
    func restoreSandboxPurchases() async {
        guard !busy, sandboxBillingConfigured, let session else { return }
        busy = true; message = nil
        let expected = generation
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard expected == generation, billingAccount == credentials.user.id, let purchaseAccount else { return }
            try await purchases.restore(account: purchaseAccount)
            guard expected == generation else { return }
            let rights = try await BillingAPI().entitlement(token: credentials.access_token)
            guard expected == generation else { return }
            guard rights.purchaseAccountToken == purchaseAccount else { throw CloudError.malformedResponse }
            sandboxEntitlement = rights
            message = "Sandbox\u{306e}\u{5229}\u{7528}\u{6a29}\u{3092}\u{78ba}\u{8a8d}\u{3057}\u{307e}\u{3057}\u{305f}\u{3002}"
        } catch {
            if expected == generation { message = "Sandbox\u{306e}\u{8cfc}\u{5165}\u{3092}\u{5fa9}\u{5143}\u{3067}\u{304d}\u{307e}\u{305b}\u{3093}\u{3067}\u{3057}\u{305f}\u{3002}" }
        }
    }
    func loadSandboxReport() async {
        guard !busy, sandboxBillingConfigured, let session,
              household?.homes.contains(where: { $0.id == homeID }) == true else { return }
        busy = true; report = nil; message = nil
        let expected = generation, expectedReport = reportGeneration, home = homeID
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard expected == generation, expectedReport == reportGeneration, billingAccount == credentials.user.id, let purchaseAccount else { return }
            let rights = try await BillingAPI().entitlement(token: credentials.access_token)
            guard expected == generation, expectedReport == reportGeneration else { return }
            guard rights.purchaseAccountToken == purchaseAccount else { throw CloudError.malformedResponse }
            sandboxEntitlement = rights
            guard rights.premiumIsCurrent() else { message = "テスト用の有料利用権を確認できません。"; return }
            let value = try await ReportAPI(sandboxPreview: true).load(home: home, token: credentials.access_token)
            guard expected == generation, expectedReport == reportGeneration, home == homeID else { return }
            report = value
        } catch {
            if expected == generation, expectedReport == reportGeneration {
                message = "レポートを取得できません。テスト用サービスの準備と通信を確認してください。"
            }
        }
    }
    func retrySandboxTransactions() async {
        guard !busy, sandboxBillingConfigured, let session else { return }
        busy = true
        let expected = generation
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard expected == generation, billingAccount == credentials.user.id, let purchaseAccount else { return }
            try await purchases.observeUnfinished(account: purchaseAccount)
            if expected == generation { message = "未完了のSandbox取引を確認しました。" }
        } catch { if expected == generation { purchases.markRetryNeeded(); message = "取引を再確認できませんでした。時間をおいてお試しください。" } }
    }
    private func bindSandboxBilling(account: UUID) async {
        #if DEBUG
        guard Bundle.main.object(forInfoDictionaryKey: "IOS_SANDBOX_BILLING") as? String == "YES",
              let session else { return }
        purchases.stopObserving()
        let expected = generation
        billingAccount = nil; purchaseAccount = nil; sandboxEntitlement = nil; purchases.persist = nil
        let billing = BillingAPI()
        let issued: SandboxEntitlement
        do {
            let credentials = try await session.credentials()
            guard credentials.user.id == account, generation == expected else { return }
            issued = try await billing.entitlement(token: credentials.access_token)
        } catch { return }
        guard generation == expected, let purchaseToken = issued.purchaseAccountToken, purchaseToken != account else { return }
        billingAccount = account; purchaseAccount = purchaseToken; sandboxEntitlement = issued
        purchases.persist = { [weak self] signed in
            guard let self, self.generation == expected else { throw CancellationError() }
            let credentials = try await session.credentials()
            guard credentials.user.id == account, self.generation == expected else { throw CancellationError() }
            try await billing.submit(signedTransaction: signed, token: credentials.access_token)
            guard self.generation == expected else { throw CancellationError() }
            let rights = try await billing.entitlement(token: credentials.access_token)
            guard self.generation == expected else { throw CancellationError() }
            guard rights.purchaseAccountToken == purchaseToken else { throw CloudError.malformedResponse }
            self.sandboxEntitlement = rights
        }
        purchases.startObserving(account: purchaseToken)
        Task { [weak self] in
            guard let self, self.generation == expected else { return }
            do { try await self.purchases.observeUnfinished(account: purchaseToken) }
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
            snapshotAccount = credentials.user.id; showingOfflineSnapshot = false
            household = value
            await bindSandboxBilling(account: credentials.user.id)
            guard expected == generation else { return }
            let notificationState = (try? await reminders.reconcile(data: value, account: credentials.user.id)) ?? false
            guard expected == generation else { return }
            remindersEnabled = notificationState
            if !value.homes.contains(where: { $0.id == homeID }) { homeID = value.homes.first?.id ?? "" }
        } catch {
            if expected == generation {
                let accessDenied = error as? CloudError == .authenticationRequired || error as? CloudError == .rejected(401) || error as? CloudError == .rejected(403)
                var localCleanupFailed = false
                if accessDenied {
                    do { try snapshotStorage?.write(nil) } catch { localCleanupFailed = true }
                    snapshotAccount = nil; household = nil; showingOfflineSnapshot = false; homeID = ""
                    if !clearTemporaryExports() { localCleanupFailed = true }
                    clearFamily(); billingAccount = nil; purchaseAccount = nil; sandboxEntitlement = nil
                    purchases.stopObserving(); purchases.persist = nil
                    remindersEnabled = false
                    await reminders.reset(clearPreference: true)
                    guard expected == generation else { return }
                } else if household != nil { showingOfflineSnapshot = true }
                message = accessDenied ? "このアカウントで記録を利用できません。ログイン状態を確認してください。" : showingOfflineSnapshot ? "保存済みの記録を表示しています。最新の共有内容を確認するには通信を回復して再読み込みしてください。" : "記録を取得できませんでした。通信とログイン状態を確認してください。"
                if localCleanupFailed { message = (message ?? "") + "端末内の保存記録を削除できませんでした。再度ログアウトしてください。" }
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
            showingOfflineSnapshot = false
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
            showingOfflineSnapshot = false
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
    func deleteHome(id: String) async -> Bool {
        guard let data = household, data.homes.count > 1,
              data.homes.first(where: { $0.id == id })?.role == "owner" else { return false }
        let success = await save { api, token in try await api.deleteRecord(.home, id: id, token: token) }
        if success, household?.homes.contains(where: { $0.id == homeID }) != true {
            clearFamily()
            homeID = household?.homes.first?.id ?? ""
        }
        return success
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
