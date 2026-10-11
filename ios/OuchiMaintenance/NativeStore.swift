import Foundation
import Combine
import StoreKit
import OuchiCore

struct FormalNativePushSelection {
    let receipt: NativePushRegistrationReceipt
    let account: UUID
}

enum FormalNativePushChange { case registered(FormalNativePushSelection), disabled, absent }

struct FormalReminderSelection {
    let receipt: ReminderSettingsReceipt
    let epoch: UUID
    let rights: VerifiedEntitlement
    let environment: BillingEnvironment
    var canEdit: Bool { receipt.premiumActive && rights.premiumIsCurrent(expectedEnvironment: environment) }
}

struct FormalChannelSelection {
    let receipt: NotificationChannelReceipt
    let epoch: UUID
    let environment: BillingEnvironment
    let checkedAt: Date
    let deadline: Date
    let clockStart: ContinuousClock.Instant
    var current: Bool { Date() >= checkedAt && Date() < deadline && clockStart.duration(to: .now) >= .zero && clockStart.duration(to: .now) < .seconds(300) }
}

@MainActor final class NativeStore: ObservableObject {
    @Published private(set) var household: Household? { didSet {
        report = nil; reportGeneration += 1
        if !showingOfflineSnapshot, let household, let snapshotAccount {
            try? snapshotStorage?.write(OfflineSnapshot(account: snapshotAccount, household: household))
        }
    } }
    @Published private(set) var showingOfflineSnapshot = false
    private var snapshotAccount: UUID? { didSet {
        if oldValue != snapshotAccount { accountBindingRevision = UUID() }
    } }
    private var snapshotStorage: HouseholdSnapshotStorage?
    private var pendingAttachmentStorage: PendingAttachmentStorage?
    private var pendingRemovalStorage: PendingAttachmentRemovalStorage?
    /// Prepared shared lifecycle coordinator. Remains nil until verified
    /// enrollment/device configuration is wired; no release registration starts.
    private var appAttestRegistrationCoordinator: AppAttestRegistrationCoordinator?
    private var appAttestCoordinatorConfiguration: AppAttestRegistrationConfiguration?
    private func managedExport(_ bytes: Data, account: UUID, suffix: String) throws -> URL {
        let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true)
        return try ManagedExportStorage(root: caches.appendingPathComponent("OuchiManagedExports", isDirectory: true))
            .write(bytes, account: account, extension: suffix)
    }
    @Published private(set) var signedIn = false { didSet {
        if oldValue != signedIn { accountBindingRevision = UUID() }
        if !signedIn { accountEmail = nil }
    } }
    @Published private(set) var accountBindingRevision = UUID() { didSet { reminderSettings = nil; pendingRegistrationMaintenanceNeedsAttention = false } }
    @Published private(set) var reminderSettings: ReminderSettingsReceipt?
    var preparedDeletionAccountID: UUID? { signedIn ? snapshotAccount : nil }
    @Published private(set) var accountEmail: String?
    @Published private(set) var busy = false
    @Published var message: String?
    @Published var homeID = "" { didSet { if oldValue != homeID { report = nil; reportGeneration += 1 } } }
    @Published private(set) var exportURL: URL?
    @Published private(set) var calendarURL: URL?
    @Published private(set) var attachmentExportURL: URL?
    @Published private(set) var familyMembers: [FamilyMember] = []
    @Published private(set) var inviteCode: String?
    @Published private(set) var familyHomeID: String?
    private let api: HouseholdAPI?
    private let session: SessionController?
    private let isolatedDevelopmentEnabled: Bool
    private(set) var isUIReviewSample = false
    #if DEBUG
    private var isClosureUIReviewSample = false
    private var reviewClosureRecords: [AppAttestAccountClosure] = []
    private var reviewClosureFailure = true
    #endif
    private var generation = 0 { didSet { accountBindingRevision = UUID() } }
    private var familyGeneration = 0
    private var reportGeneration = 0
    private var attachmentExportGeneration = 0
    @Published private(set) var report: MaintenanceReport?
    let purchases = PurchaseManager()
    private var billingAccount: UUID?
    private var purchaseAccount: UUID?
    @Published private(set) var sandboxEntitlement: SandboxEntitlement?
    @Published private(set) var billingRecoveryStatus: BillingRecoveryStatus?
    private let reminders = LocalReminders()
    /// Prepared adapter only. Caller must first obtain a durable deletion receipt.
    /// The release deletion screen is not enabled by this local operation.
    func stopLocalNotificationsForDeletion(account: UUID, epoch: UUID, revision: UUID) async -> Bool {
        let stillBound: @MainActor @Sendable () -> Bool = { [self] in
            signedIn && !busy && snapshotAccount == account && purchaseAccount == epoch && accountBindingRevision == revision
        }
        guard stillBound(), !Task.isCancelled else { return false }
        let stopped = await reminders.eraseForAccountDeletion(account: account, stillBound: stillBound)
        guard stillBound(), !Task.isCancelled else { return false }
        if stopped { remindersEnabled = false }
        return stopped
    }
    /// Prepared receipt-bound cleanup; not enabled by the release UI.
    /// Keeps the session and deletion binding so the authenticated receipt can be recovered.
    func cleanupLocalDataForDeletion(receipt: AccountDeletionStatus, account: UUID, epoch: UUID, revision: UUID) async -> Bool {
        let stillBound = { [self] in
            signedIn && !busy && snapshotAccount == account && purchaseAccount == epoch && accountBindingRevision == revision
        }
        let result = await cleanAccountDeletionLocalData(
            receipt: receipt, account: account, epoch: epoch, revision: revision,
            stillBound: stillBound,
            stopNotifications: { [self] in await stopLocalNotificationsForDeletion(account: account, epoch: epoch, revision: revision) },
            erasePendingRegistration: {
                if let coordinator = self.appAttestRegistrationCoordinator {
                    do {
                        try await coordinator.closeAccount(account: account)
                        return stillBound() ? .complete : .staleBinding
                    } catch { return stillBound() ? .pending : .staleBinding }
                }
                guard let bundle = Bundle.main.bundleIdentifier,
                      let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return .pending }
                let pending = AppAttestPendingRegistrationStorage(
                    root: support.appendingPathComponent("OuchiAppAttestPendingRegistration", isDirectory: true),
                    keyProvider: { _, _ in throw CloudError.unavailable })
                let lease: AppAttestMutationLease
                do { lease = try await pending.acquireMutationLease() }
                catch { return stillBound() ? .pending : .staleBinding }
                defer { lease.release() }
                return await eraseAppAttestLocalRegistration(account: account, stillBound: stillBound,
                    prepareClosure: {
                        let now = Int64(Date().timeIntervalSince1970 * 1000)
                        let retention: Int64 = 7_776_000_000
                        guard now > 0, now <= 9_007_199_254_740_991 - retention else { throw CloudError.invalidInput }
                        try AppAttestKeyReferenceStorage(namespace: bundle).beginClosure(
                            AppAttestAccountClosure(accountID: account, requestID: UUID(),
                                createdAtMilliseconds: now, retainUntilMilliseconds: now + retention))
                    },
                    erasePendingProofs: { try await pending.eraseAccount(account) },
                    eraseEncryptionKeys: {
                        try AppAttestKeyReferenceStorage(namespace: bundle).erase(account: account)
                        try AppAttestEncryptionKeyStorage(namespace: bundle).erase(account: account)
                    })
            },
            eraseSnapshot: { [self] in
                guard let snapshotStorage else { throw CloudError.unavailable }
                try snapshotStorage.remove(account: account)
            },
            erasePendingUpload: { try PendingAttachmentStorage().remove(account: account, epoch: epoch) },
            erasePendingRemoval: { try PendingAttachmentRemovalStorage().remove(account: account, epoch: epoch) },
            eraseManagedExports: {
                let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
                try ManagedExportStorage(root: caches.appendingPathComponent("OuchiManagedExports", isDirectory: true)).removeFiles(account: account)
            },
            clearVisibleData: { [self] in
                attachmentExportGeneration += 1; reportGeneration += 1
                household = nil; showingOfflineSnapshot = false; homeID = ""; report = nil
                exportURL = nil; calendarURL = nil; attachmentExportURL = nil; clearFamily()
                sandboxEntitlement = nil; billingRecoveryStatus = nil; reminderSettings = nil
                purchases.stopObserving(); purchases.persist = nil
            }
        )
        guard result == .complete, stillBound(), !Task.isCancelled else { return false }
        // Pending/running receipts retain credentials for authenticated recovery.
        guard receipt.state == .complete else { return true }
        guard let session else { return false }
        // Reserve the store during the final actor hop. Login/logout/restore must
        // not replace this binding while its current local session is erased.
        busy = true
        defer { busy = false }
        let matches = { [self] in
            signedIn && snapshotAccount == account && purchaseAccount == epoch && accountBindingRevision == revision
        }
        do {
            let permit = try await session.prepareCompletedDeletionErasure(receipt: receipt, account: account, epoch: epoch)
            guard matches(), !Task.isCancelled else { return false }
            let confirmation = try await session.eraseCompletedDeletionSession(permit)
            var registrationCleanupFailed = false
            if let coordinator = appAttestRegistrationCoordinator {
                do { try await coordinator.completeLocalClosure(confirmation: confirmation, session: session) }
                catch { registrationCleanupFailed = true }
            } else {
                do {
                    guard let bundle = Bundle.main.bundleIdentifier,
                          let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { throw CloudError.unavailable }
                    let pending = AppAttestPendingRegistrationStorage(
                        root: support.appendingPathComponent("OuchiAppAttestPendingRegistration", isDirectory: true),
                        keyProvider: { _, _ in throw CloudError.unavailable })
                    try await AppAttestKeyReferenceStorage(namespace: bundle).completeLocalClosure(
                        confirmation: confirmation, session: session, pending: pending,
                        encryptionKeys: AppAttestEncryptionKeyStorage(namespace: bundle))
                } catch { registrationCleanupFailed = true }
            }
            // Once credentials are erased, finish the same binding even if the view was cancelled.
            guard matches() else { return false }
            generation += 1
            appAttestRegistrationCoordinator = nil
            appAttestCoordinatorConfiguration = nil
            snapshotAccount = nil; signedIn = false
            billingAccount = nil; purchaseAccount = nil
            developmentRemoteRegistration = nil; developmentRemoteNotificationsRegistered = false
            message = registrationCleanupFailed
                ? "ログイン情報は消去しました。端末登録の終了記録が残っているため、再登録前に終了処理の再確認が必要です。"
                : "サーバー側の削除と、この端末のデータ・ログイン情報の消去を確認しました。"
            return true
        } catch {
            if matches() { message = "この端末のログイン情報を消去できませんでした。状況を確認して再度お試しください。" }
            return false
        }
    }
    @Published private(set) var pendingLocalRegistrationClosures: [AppAttestAccountClosure] = []
    var localClosureRecoveryConfigured: Bool {
        #if DEBUG
        if isClosureUIReviewSample { return true }
        #endif
        return Bundle.main.infoDictionary?["OUCHI_LOCAL_CLOSURE_RECOVERY_ENABLED"] as? Bool == true
    }
    func loadLocalRegistrationClosures() async {
        #if DEBUG
        if isClosureUIReviewSample {
            guard !busy, !signedIn else { return }
            pendingLocalRegistrationClosures = reviewClosureRecords
            return
        }
        #endif
        guard localClosureRecoveryConfigured, !busy, !signedIn, let session,
              let bundle = Bundle.main.bundleIdentifier else { return }
        busy = true
        defer { busy = false }
        pendingLocalRegistrationClosures = []
        do {
            // Refuse discovery while any durable login remains, even if this
            // view is still showing the sign-in screen after a failed restore.
            _ = try await session.prepareLocalClosureRecovery(accountID: UUID())
            let references = try AppAttestKeyReferenceStorage(namespace: bundle)
            pendingLocalRegistrationClosures = try await Task.detached {
                try references.pendingClosures()
            }.value
        } catch {
            message = "終了記録を確認できませんでした。ログイン状態と端末のロックを確認して、再度お試しください。"
        }
    }
    /// Prepared explicit recovery after restart. It finishes only registration
    /// cleanup from an existing local intent, never server/account deletion.
    /// Login/restore/logout are reserved by busy throughout the actor hops.
    func recoverAbandonedRegistrationClosure(_ expected: AppAttestAccountClosure) async -> Bool {
        #if DEBUG
        if isClosureUIReviewSample {
            guard !busy, !signedIn, reviewClosureRecords.contains(expected) else { return false }
            if reviewClosureFailure {
                reviewClosureFailure = false
                message = "サンプル：確認失敗を再現しました。終了記録を保持しています。再度お試しください。"
                return false
            }
            reviewClosureRecords.removeAll { $0 == expected }
            message = "サンプル：選んだ終了記録の処理を確認しました。本物の記録やサーバーには変更していません。"
            return true
        }
        #endif
        guard localClosureRecoveryConfigured, !busy, !signedIn, appAttestRegistrationCoordinator == nil, let session,
              let bundle = Bundle.main.bundleIdentifier,
              let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return false }
        busy = true
        defer { busy = false }
        do {
            let pending = AppAttestPendingRegistrationStorage(
                root: support.appendingPathComponent("OuchiAppAttestPendingRegistration", isDirectory: true),
                keyProvider: { _, _ in throw CloudError.unavailable })
            try await AppAttestKeyReferenceStorage(namespace: bundle).recoverAbandonedLocalClosure(
                expected: expected, session: session, pending: pending,
                encryptionKeys: AppAttestEncryptionKeyStorage(namespace: bundle))
            message = "この端末の登録情報の終了処理を確認しました。サーバー側の退会状況は、別途確認が必要です。"
            return true
        } catch {
            message = "終了処理を確認できませんでした。記録を保持しています。再度お試しください。"
            return false
        }
    }
    @Published private(set) var remindersEnabled = false
    @Published private(set) var developmentRemoteNotificationsRegistered = false
    private var developmentRemoteRegistration: (id: UUID, account: UUID)?

    var formalNativePushConfiguration: (push: NativePushEnvironment, purchase: BillingEnvironment)? {
        guard api != nil, Bundle.main.infoDictionary?["OUCHI_NATIVE_PUSH_ENABLED"] as? Bool == true,
              let push = Bundle.main.infoDictionary?["OUCHI_APNS_ENVIRONMENT"] as? String,
              let purchase = Bundle.main.infoDictionary?["OUCHI_NATIVE_PUSH_PURCHASE_ENVIRONMENT"] as? String,
              let pushEnvironment = NativePushEnvironment(rawValue: push), let purchaseEnvironment = BillingEnvironment(rawValue: purchase) else { return nil }
        return (pushEnvironment, purchaseEnvironment)
    }
    /// Free registration; scoped ledger enrollment is checked, never a local paid flag.
    func changeFormalNativePush(prior: FormalNativePushSelection? = nil, lookup: Bool = false, requestToken: (@MainActor () async throws -> Data)? = nil) async -> FormalNativePushChange? {
        guard !busy, signedIn, !(lookup && prior != nil), let config = formalNativePushConfiguration, let session else { return nil }
        busy = true; message = nil
        let expected = generation, revision = accountBindingRevision, home = homeID
        defer { if expected == generation { busy = false } }
        let stillBound = { [self] in !Task.isCancelled && signedIn && expected == generation && revision == accountBindingRevision && home == homeID }
        do {
            let credentials = try await session.credentials()
            guard stillBound(), snapshotAccount == credentials.user.id else { return nil }
            let billing = BillingAPI(environment: config.purchase)
            let rights = try await billing.entitlement(token: credentials.access_token)
            guard stillBound(), rights.environment == config.purchase.rawValue, let epoch = rights.purchaseAccountToken else { return nil }
            let service = FormalNativePushAPI(notificationEnvironment: config.push, purchaseEnvironment: config.purchase)
            var result = FormalNativePushChange.disabled
            if let prior {
                guard prior.account == credentials.user.id, prior.receipt.epoch == epoch,
                      prior.receipt.notificationEnvironment == config.push, prior.receipt.purchaseEnvironment == config.purchase else { throw CloudError.invalidInput }
                guard try await service.disable(prior.receipt, token: credentials.access_token) else { throw CloudError.unavailable }
            } else {
                guard let requestToken else { throw CloudError.invalidInput }
                let token = try await requestToken()
                guard stillBound() else { return nil }
                if lookup {
                    let status = try await service.lookup(deviceToken: token, epoch: epoch, token: credentials.access_token)
                    guard stillBound() else { return nil }
                    if status.enabled, let receipt = status.receipt { result = .registered(FormalNativePushSelection(receipt: receipt, account: credentials.user.id)) }
                    else { result = status.receipt == nil ? .absent : .disabled }
                } else {
                    let receipt = try await service.register(deviceToken: token, epoch: epoch, token: credentials.access_token)
                    guard stillBound() else { return nil }
                    result = .registered(FormalNativePushSelection(receipt: receipt, account: credentials.user.id))
                }
            }
            guard stillBound() else { return nil }
            let current = try await billing.entitlement(token: credentials.access_token)
            guard stillBound(), current.environment == config.purchase.rawValue, current.purchaseAccountToken == epoch else { return nil }
            switch result {
            case .registered: message = "この端末の通知先の登録を確認しました。配信は準備中です。"
            case .disabled: message = "この端末の通知先の停止を確認しました。"
            case .absent: message = "現在のログインで登録された通知先は見つかりませんでした。"
            }
            return result
        } catch {
            if stillBound() { message = "通知先の変更結果を確認できません。通知の許可と通信を確認し、再度お試しください。" }
            return nil
        }
    }

    func registerDevelopmentRemoteNotifications(requestToken: @MainActor () async throws -> Data) async {
        guard developmentLifecycleConfigured, signedIn, !busy, let session else { return }
        busy = true; message = nil
        let expected = generation
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard expected == generation else { return }
            let token = try await requestToken()
            guard expected == generation else { return }
            let transport = DevelopmentAPNsAPI()
            let id = try await transport.register(deviceToken: token, token: credentials.access_token, confirmed: true)
            guard expected == generation else {
                _ = try? await transport.disable(registration: id, token: credentials.access_token)
                return
            }
            developmentRemoteRegistration = (id, credentials.user.id)
            developmentRemoteNotificationsRegistered = true
            message = "通知先を登録しました。予定に基づく配信はまだ開始していません。"
        } catch {
            if expected == generation { message = "通知先を登録できませんでした。通知の許可、Appleの署名設定、テスト用サーバーへの接続を確認してください。" }
        }
    }
    func disableDevelopmentRemoteNotifications() async {
        guard developmentLifecycleConfigured, !busy, let session, let registration = developmentRemoteRegistration else { return }
        busy = true; message = nil
        let expected = generation
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard expected == generation, credentials.user.id == registration.account else { return }
            let disabled = try await DevelopmentAPNsAPI().disable(registration: registration.id, token: credentials.access_token)
            guard expected == generation else { return }
            guard disabled else { throw CloudError.unavailable }
            developmentRemoteRegistration = nil; developmentRemoteNotificationsRegistered = false
            message = "この端末の通知先を停止しました。"
        } catch { if expected == generation { message = "停止結果を確認できませんでした。通信を確認して再度お試しください。" } }
    }

    init() {
        let info = Bundle.main.infoDictionary ?? [:]
        #if DEBUG
        if Bundle.main.bundleIdentifier?.hasPrefix("dev.ouchi.review.") == true,
           info["OUCHI_REVIEW_SAMPLE_CLOSURE_DATA"] as? String == "YES",
           let stamp = info["OUCHI_REVIEW_BUILD_ID"] as? String,
           stamp.range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil {
            api = nil; session = nil; isolatedDevelopmentEnabled = false
            isUIReviewSample = true; isClosureUIReviewSample = true
            let now = Int64(Date().timeIntervalSince1970 * 1000)
            reviewClosureRecords = [
                try! AppAttestAccountClosure(accountID: UUID(), requestID: UUID(), createdAtMilliseconds: now - 86400000, retainUntilMilliseconds: now + 3600000),
                try! AppAttestAccountClosure(accountID: UUID(), requestID: UUID(), createdAtMilliseconds: now, retainUntilMilliseconds: now + 3600000)
            ]
            return
        }
        if Bundle.main.bundleIdentifier?.hasPrefix("dev.ouchi.review.")==true,
           info["OUCHI_REVIEW_SAMPLE_DATA"] as? String == "YES",
           let stamp=info["OUCHI_REVIEW_BUILD_ID"] as? String,
           stamp.range(of:"^[a-f0-9]{40}$",options:.regularExpression) != nil,
           let config=try? CloudConfiguration(url:URL(string:"https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!,publishableKey:"sb_publishable_synthetic_review_only"),
           let bytes=try? NativeReviewFixture.sessionBytes() {
            let fixture=NativeReviewFixture()
            let client=HouseholdAPI(config:config,transport:{ try await fixture.reply($0) })
            api=client;session=SessionController(api:client,storage:NativeReviewSessionStorage(bytes))
            isolatedDevelopmentEnabled=false;isUIReviewSample=true
            return
        }
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
            if isolatedDevelopment || info["OUCHI_ATTACHMENTS_ENABLED"] as? Bool == true { pendingAttachmentStorage = PendingAttachmentStorage(); pendingRemovalStorage = PendingAttachmentRemovalStorage() }
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
    /// Build-time availability only. It never grants paid access; server ledger checks every new upload.
    var attachmentServiceConfigured: Bool {
        developmentLifecycleConfigured || (api != nil && Bundle.main.infoDictionary?["OUCHI_ATTACHMENTS_ENABLED"] as? Bool == true)
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
                clearFamily(); billingAccount = nil; purchaseAccount = nil; sandboxEntitlement = nil; billingRecoveryStatus = nil
                developmentRemoteRegistration = nil; developmentRemoteNotificationsRegistered = false
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
    func uploadDevelopmentAttachment(product: UUID, attachment: UUID, bytes: Data, mime: String, confirmed: Bool) async -> Bool {
        guard attachmentServiceConfigured, !busy, let session, confirmed,
              household?.products(in: homeID).contains(where: { $0.id.lowercased() == product.uuidString.lowercased() }) == true else { return false }
        busy = true; message = nil
        let expected = generation, home = homeID
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard !Task.isCancelled, expected == generation, home == homeID else { return false }
            let binding = try await AttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).binding(token: credentials.access_token)
            guard !Task.isCancelled, expected == generation, home == homeID, binding.account == credentials.user.id, let storage = pendingAttachmentStorage else { return false }
            let pending = try PendingAttachment(account: binding.account, epoch: binding.epoch, product: product, id: attachment, bytes: bytes, mime: mime)
            if let existing = try storage.read(account: binding.account, epoch: binding.epoch) {
                guard existing.id == attachment, existing.product == product, existing.bytes == bytes, existing.mime == mime else { throw CloudError.invalidInput }
            }
            try Task.checkCancellation()
            try storage.write(pending)
            try await AttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).upload(product: product, attachment: attachment, bytes: bytes, mime: mime, token: credentials.access_token, confirmed: confirmed, expectedEpoch: binding.epoch)
            guard !Task.isCancelled, expected == generation, home == homeID else { return false }
            try pendingAttachmentStorage?.write(nil)
            message = "ファイルの保存をサーバーで確認しました。"
            return true
        } catch {
            if !Task.isCancelled, expected == generation, home == homeID { message = "保存完了を確認できません。ファイルを選び直さず、同じ添付IDで再確認してください。" }
            return false
        }
    }
    func resumeDevelopmentAttachment() async -> PendingAttachment? {
        guard attachmentServiceConfigured, let session, let storage = pendingAttachmentStorage else { return nil }
        let expected = generation
        do {
            let credentials = try await session.credentials()
            let binding = try await AttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).binding(token: credentials.access_token)
            guard !Task.isCancelled, expected == generation, binding.account == credentials.user.id else { return nil }
            let pending = try storage.read(account: binding.account, epoch: binding.epoch)
            guard !Task.isCancelled, expected == generation else { return nil }
            return pending
        } catch {
            if !Task.isCancelled, expected == generation { message = "再送用ファイルを確認できません。通信と現在の登録を確認してください。" }
            return nil
        }
    }
    func developmentAttachmentUsage() async -> DevelopmentAttachmentAPI.Usage? {
        guard attachmentServiceConfigured, let session else { return nil }
        let expected = generation
        do {
            let credentials = try await session.credentials()
            let usage = try await AttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).usage(token: credentials.access_token)
            guard expected == generation else { return nil }
            return usage
        } catch {
            if expected == generation { message = "保存容量を確認できませんでした。" }
            return nil
        }
    }
    func pageDevelopmentAttachments(product: UUID, after: UUID? = nil) async -> DevelopmentAttachmentAPI.AttachmentPage? {
        guard attachmentServiceConfigured, let session,
              household?.products(in: homeID).contains(where: { $0.id == product.uuidString.lowercased() || $0.id == product.uuidString }) == true else { return nil }
        let expected = generation, home = homeID
        do {
            let credentials = try await session.credentials()
            let items = try await AttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).page(product: product, after: after, token: credentials.access_token)
            guard expected == generation, home == homeID else { return nil }
            return items
        } catch {
            if expected == generation, home == homeID { message = "添付一覧を取得できませんでした。通信と住まいへのアクセスを確認してください。" }
            return nil
        }
    }
    func exportDevelopmentAttachment(_ attachment: UUID) async {
        guard attachmentServiceConfigured, !busy, let session else { return }
        attachmentExportGeneration += 1
        let exportGeneration = attachmentExportGeneration
        busy = true; message = nil
        let expected = generation
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            let file = try await AttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).download(attachment: attachment, token: credentials.access_token)
            guard expected == generation, exportGeneration == attachmentExportGeneration else { return }
            if let old = attachmentExportURL {
                if FileManager.default.fileExists(atPath: old.path) { try FileManager.default.removeItem(at: old) }
                attachmentExportURL = nil
            }
            let url = try managedExport(file.bytes, account: credentials.user.id, suffix: file.fileExtension)
            attachmentExportURL = url
        } catch { if expected == generation, exportGeneration == attachmentExportGeneration { message = "添付を取得できませんでした。登録状態と住まいへのアクセスを確認してください。" } }
    }
    func resumeDevelopmentAttachmentRemoval() async -> PendingAttachmentRemoval? {
        guard attachmentServiceConfigured, let session, let storage = pendingRemovalStorage else { return nil }
        let expected = generation
        do {
            let credentials = try await session.credentials()
            let binding = try await AttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).binding(token: credentials.access_token)
            guard !Task.isCancelled, expected == generation, binding.account == credentials.user.id else { return nil }
            return try storage.read(account: binding.account, epoch: binding.epoch)
        } catch {
            if expected == generation { message = "確認待ちの削除を読み込めませんでした。アカウントと通信状態を確認してください。" }
            return nil
        }
    }
    func removeDevelopmentAttachment(_ attachment: UUID, product: UUID, confirmed: Bool) async -> Bool {
        guard attachmentServiceConfigured, confirmed, !busy, let session else { return false }
        let expected = generation, home = homeID
        busy = true; message = nil
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard !Task.isCancelled, expected == generation, home == homeID else { return false }
            let binding = try await AttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).binding(token: credentials.access_token)
            guard !Task.isCancelled, expected == generation, home == homeID, binding.account == credentials.user.id,
                  let storage = pendingRemovalStorage else { return false }
            let pending = try PendingAttachmentRemoval(account: binding.account, epoch: binding.epoch, product: product, id: attachment)
            if let existing = try storage.read(account: binding.account, epoch: binding.epoch) {
                guard existing.id == attachment, existing.product == product else { throw CloudError.invalidInput }
            } else {
                guard household?.products(in: homeID).contains(where: { $0.id.lowercased() == product.uuidString.lowercased() }) == true else { throw CloudError.invalidInput }
            }
            try storage.write(pending)
            try await AttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).remove(attachment: attachment, token: credentials.access_token, confirmed: true, expectedEpoch: binding.epoch)
            guard !Task.isCancelled, expected == generation, home == homeID else { return false }
            try pendingRemovalStorage?.write(nil)
            clearDevelopmentAttachmentExport()
            message = "ファイルの消去と容量の解放を確認しました。"
            return true
        } catch {
            if expected == generation, home == homeID { message = "削除完了を確認できません。同じファイルで再確認してください。保存した人か住まいの所有者が操作できます。" }
            return false
        }
    }
    func clearDevelopmentAttachmentExport() {
        attachmentExportGeneration += 1
        guard let url = attachmentExportURL else { return }
        do { if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }; attachmentExportURL = nil }
        catch { message = "端末内の添付ファイルを消去できませんでした。ログアウトから再確認してください。" }
    }
    func restore() async {
        #if DEBUG
        if isClosureUIReviewSample { return }
        #endif
        guard !busy else { return }
        accountBindingRevision = UUID()
        let expected = generation
        await reminders.reset(clearPreference: false)
        guard expected == generation else { return }
        guard let session else { message = "クラウド接続の設定が必要です。"; return }
        do {
            let restored = try await session.restore()
            guard expected == generation else { return }
            signedIn = restored
            accountEmail = nil
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
        accountBindingRevision = UUID()
        busy = true; message = nil
        let expected = generation
        do {
            try await session.signIn(email: email, password: password)
            guard generation == expected else { return }
            accountEmail = nil
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
        accountBindingRevision = UUID()
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
        if let coordinator = appAttestRegistrationCoordinator, let account = snapshotAccount {
            do { try await coordinator.closeAccount(account: account) }
            catch {
                message = "端末登録の終了処理が完了していません。通信と端末のロックを確認して、再度ログアウトしてください。"
                return
            }
        }
        if let session, await session.localAccount() != nil {
            do { try await session.revokeRemoteSession() }
            catch {
                message = "この端末のサーバー側ログアウトを確認できませんでした。通信を確認して再度お試しください。"
                return
            }
        }
        var registrationCleanupFailed = false
        do {
            if let session, let account = await session.localAccount() {
                let confirmation = try await session.signOutConfirmed(expectedAccount: account)
                if let coordinator = appAttestRegistrationCoordinator {
                    do { try await coordinator.completeLocalClosure(confirmation: confirmation, session: session) }
                    catch { registrationCleanupFailed = true }
                }
            } else { try await session?.signOut() }
        }
        catch {
            message = "この端末のログイン情報を削除できませんでした。端末のロックを確認して、再度ログアウトしてください。"
            return
        }
        generation += 1
        appAttestRegistrationCoordinator = nil
        appAttestCoordinatorConfiguration = nil
        developmentRemoteRegistration = nil; developmentRemoteNotificationsRegistered = false
        var localCleanupFailed = registrationCleanupFailed
        do { try snapshotStorage?.write(nil) }
        catch { localCleanupFailed = true }
        snapshotAccount = nil; showingOfflineSnapshot = false
        remindersEnabled = false
        household = nil; signedIn = false; busy = true
        await reminders.reset(clearPreference: true)
        purchases.stopObserving(); purchases.persist = nil
        billingAccount = nil; purchaseAccount = nil; sandboxEntitlement = nil; billingRecoveryStatus = nil
        household = nil; homeID = ""; signedIn = false
        clearFamily()
        if !clearTemporaryExports() { localCleanupFailed = true }
        if localCleanupFailed {
            message = (message.map { $0 + "\n" } ?? "") + "端末内の保存記録や一時ファイルを一部削除できませんでした。アプリを開き直して、再度ログアウトしてください。"
        }
    }
    private func clearTemporaryExports() -> Bool {
        attachmentExportGeneration += 1
        // Keep failed paths so a later logout can retry their removal.
        func remove(_ url: URL?) -> Bool {
            guard let url else { return true }
            do {
                if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
                return true
            } catch { return false }
        }
        var pendingRemoved = true
        do { try pendingAttachmentStorage?.write(nil) } catch { pendingRemoved = false }
        do { try pendingRemovalStorage?.write(nil) } catch { pendingRemoved = false }
        let backupRemoved = remove(exportURL)
        let calendarRemoved = remove(calendarURL)
        let attachmentRemoved = remove(attachmentExportURL)
        if backupRemoved { exportURL = nil }
        if calendarRemoved { calendarURL = nil }
        if attachmentRemoved { attachmentExportURL = nil }
        return pendingRemoved && backupRemoved && calendarRemoved && attachmentRemoved
    }
    func prepareExport() {
        guard !busy, let household, let account = snapshotAccount else { return }
        do {
            let url = try managedExport(Backup.encode(household), account: account, suffix: "json")
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
    func testTip(_ product: Product) async { await testSandboxPurchase(product, subscription: false) }
    func testSubscription(_ product: Product) async { await testSandboxPurchase(product, subscription: true) }
    private func testSandboxPurchase(_ product: Product, subscription: Bool) async {
        guard !busy, sandboxBillingConfigured, let session else { return }
        if subscription {
            guard product.type == .autoRenewable,
                  ["ouchi.premium.monthly", "ouchi.premium.annual"].contains(product.id),
                  let period = product.subscription?.subscriptionPeriod,
                  period.value == 1,
                  (product.id == "ouchi.premium.monthly" && period.unit == .month) ||
                  (product.id == "ouchi.premium.annual" && period.unit == .year) else { return }
        } else {
            guard product.type == .consumable,
                  ["ouchi.tip.small", "ouchi.tip.medium", "ouchi.tip.large"].contains(product.id) else { return }
        }
        busy = true; message = nil
        let expected = generation
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard expected == generation, billingAccount == credentials.user.id, let purchaseAccount else { return }
            if subscription {
                let rights = try await BillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
                guard expected == generation, rights.purchaseAccountToken == purchaseAccount else { throw CloudError.malformedResponse }
                sandboxEntitlement = rights
                guard !rights.premiumIsCurrent() else {
                    message = "有効なテスト用契約があります。新しく購入せず、購入の復元から確認してください。"
                    return
                }
            }
            let outcome = try await purchases.purchase(product, account: purchaseAccount)
            guard expected == generation else { return }
            switch outcome {
            case .saved: message = subscription ? "Sandboxの契約を確認しました。実際の請求はありません。" : "Sandboxのチップを記録しました。実際の請求はありません。"
            case .pending: message = "購入は保留中です。承認後の結果を確認します。"
            case .cancelled: break
            }
        } catch PurchaseManager.PurchaseError.subscriptionAlreadyActive {
            if expected == generation { message = "Appleで有効な契約が見つかりました。新しく購入せず、購入の復元から確認してください。" }
        } catch PurchaseManager.PurchaseError.subscriptionBoundElsewhere {
            if expected == generation { message = "Appleで有効な契約が見つかりましたが、別のおうちメンテアカウントに紐づいています。新しく購入せず、購入時のアカウントを確認してください。" }
        } catch PurchaseManager.PurchaseError.purchaseInProgress {
            if expected == generation { message = "購入処理が進行中です。結果が出るまでお待ちください。" }
        } catch PurchaseManager.PurchaseError.purchaseNotActive {
            if expected == generation { message = "Appleから返された購入は、返金済みか期限切れです。有効な契約としては扱っていません。購入の復元から状態を確認してください。" }
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
            let restored = try await purchases.restore(account: purchaseAccount)
            guard expected == generation else { return }
            let rights = try await BillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
            guard expected == generation else { return }
            guard rights.purchaseAccountToken == purchaseAccount else { throw CloudError.malformedResponse }
            sandboxEntitlement = rights
            do {
                let accepted = try await BillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).requestRecovery(token: credentials.access_token)
                guard expected == generation else { return }
                if accepted == .accepted {
                    let progress = try await BillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).recoveryStatus(token: credentials.access_token)
                    guard expected == generation else { return }
                    billingRecoveryStatus = progress
                    message = "\u{5c65}\u{6b74}\u{306e}\u{7167}\u{5408}\u{3092}\u{53d7}\u{3051}\u{4ed8}\u{3051}\u{307e}\u{3057}\u{305f}\u{3002}"
                } else {
                    billingRecoveryStatus = nil
                    message = "\u{73fe}\u{5728}\u{306e}\u{5229}\u{7528}\u{6a29}\u{3092}\u{78ba}\u{8a8d}\u{3057}\u{307e}\u{3057}\u{305f}\u{3002}\u{8ffd}\u{52a0}\u{3067}\u{7167}\u{5408}\u{3067}\u{304d}\u{308b}\u{4fdd}\u{5b58}\u{6e08}\u{307f}\u{5c65}\u{6b74}\u{306f}\u{3042}\u{308a}\u{307e}\u{305b}\u{3093}\u{3002}"
                }
            } catch {
                if expected == generation { billingRecoveryStatus = nil; message = "\u{73fe}\u{5728}\u{306e}\u{5229}\u{7528}\u{6a29}\u{306f}\u{78ba}\u{8a8d}\u{3067}\u{304d}\u{307e}\u{3057}\u{305f}\u{304c}\u{3001}\u{5c65}\u{6b74}\u{306e}\u{8ffd}\u{52a0}\u{7167}\u{5408}\u{306f}\u{78ba}\u{8a8d}\u{3067}\u{304d}\u{307e}\u{305b}\u{3093}\u{3067}\u{3057}\u{305f}\u{3002}" }
            }
            if expected == generation, restored.otherAccountSubscriptionFound {
                message = (message ?? "") + " 別のおうちメンテアカウントに紐づく購入が見つかりました。このアカウントには移していません。購入時のアカウントを確認してください。退会後に作り直したアカウントでは、この画面から復元できません。"
            }
        } catch {
            if expected == generation { message = "Sandbox\u{306e}\u{8cfc}\u{5165}\u{3092}\u{5fa9}\u{5143}\u{3067}\u{304d}\u{307e}\u{305b}\u{3093}\u{3067}\u{3057}\u{305f}\u{3002}" }
        }
    }
    func refreshBillingRecoveryStatus() async {
        guard !busy, sandboxBillingConfigured, let session else { return }
        busy = true; message = nil
        let expected = generation
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard expected == generation, billingAccount == credentials.user.id, let purchaseAccount else { return }
            let progress = try await BillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).recoveryStatus(token: credentials.access_token)
            guard expected == generation else { return }
            if progress.state == .complete {
                let rights = try await BillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
                guard expected == generation else { return }
                guard rights.purchaseAccountToken == purchaseAccount else { throw CloudError.malformedResponse }
                sandboxEntitlement = rights
            }
            billingRecoveryStatus = progress
        } catch {
            if expected == generation { billingRecoveryStatus = nil; message = "\u{5fa9}\u{5143}\u{306e}\u{72b6}\u{6cc1}\u{3092}\u{78ba}\u{8a8d}\u{3067}\u{304d}\u{307e}\u{305b}\u{3093}\u{3067}\u{3057}\u{305f}\u{3002}" }
        }
    }
    func loadSandboxReminderSettings() async {
        await changeSandboxReminderSettings(schedule: nil)
    }
    /// Refresh rights/settings only when this account opted into local reminders.
    /// Failed verification uses free defaults; cached premium flags never schedule.
    private func reconcileReminders(data: Household, credentials: Session) async throws -> Bool {
        guard reminders.enabled(account: credentials.user.id) else { return false }
        let expected = generation, binding = accountBindingRevision
        var schedule = ReminderSchedule.free
        var expiry: Date?
        if sandboxBillingConfigured, billingAccount == credentials.user.id, let purchaseAccount {
            do {
                let receipt = try await ReminderSettingsAPI(isolatedDevelopment: isolatedDevelopmentEnabled).load(token: credentials.access_token)
                let rights = try await BillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
                guard !Task.isCancelled, expected == generation, binding == accountBindingRevision,
                      snapshotAccount == credentials.user.id, billingAccount == credentials.user.id else { return false }
                guard rights.purchaseAccountToken == purchaseAccount else { throw CloudError.malformedResponse }
                if receipt.premiumActive, rights.premiumIsCurrent() {
                    schedule = receipt.effective
                    expiry = rights.expiresAt.map { Date(timeIntervalSince1970: $0 / 1000) }
                }
                reminderSettings = receipt; sandboxEntitlement = rights
            } catch {
                guard !Task.isCancelled, expected == generation, binding == accountBindingRevision else { return false }
                reminderSettings = nil
            }
        }
        guard !Task.isCancelled, expected == generation, binding == accountBindingRevision,
              snapshotAccount == credentials.user.id else { return false }
        return try await reminders.reconcile(data: data, account: credentials.user.id,
            schedule: schedule, premiumValidUntil: expiry)
    }
    /// Explicit confirmation only; fetch both the authoritative settings and
    /// verified purchase expiry before scheduling any custom notification.
    func applySandboxReminderSettings() async {
        guard !busy, sandboxBillingConfigured, let session, let data = household else { return }
        let expected = generation, binding = accountBindingRevision
        busy = true; message = nil
        defer { if expected == generation, binding == accountBindingRevision { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard !Task.isCancelled, expected == generation, binding == accountBindingRevision,
                  signedIn, billingAccount == credentials.user.id, snapshotAccount == credentials.user.id,
                  let purchaseAccount else { return }
            let receipt = try await ReminderSettingsAPI(isolatedDevelopment: isolatedDevelopmentEnabled).load(token: credentials.access_token)
            let rights = try await BillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
            guard !Task.isCancelled, expected == generation, binding == accountBindingRevision,
                  billingAccount == credentials.user.id, snapshotAccount == credentials.user.id else { return }
            guard rights.purchaseAccountToken == purchaseAccount else { throw CloudError.malformedResponse }
            let useCustom = receipt.premiumActive && rights.premiumIsCurrent()
            let expiry = useCustom ? rights.expiresAt.map { Date(timeIntervalSince1970: $0 / 1000) } : nil
            let accepted = try await reminders.enable(data: data, account: credentials.user.id,
                schedule: useCustom ? receipt.effective : .free, premiumValidUntil: expiry)
            guard !Task.isCancelled, expected == generation, binding == accountBindingRevision else { return }
            reminderSettings = receipt; sandboxEntitlement = rights; remindersEnabled = accepted
            message = accepted ? "この端末にテスト用の通知を設定しました。有料期間が終わった後は無料の設定を使用します。" : "通知が許可されていません。iPhoneの通知設定を確認してください。"
        } catch {
            guard !Task.isCancelled, expected == generation, binding == accountBindingRevision else { return }
            reminderSettings = nil
            message = "通知を適用できません。テスト用サービスと最新の設定を確認してください。"
        }
    }
    func saveSandboxReminderSettings(_ schedule: ReminderSchedule) async {
        await changeSandboxReminderSettings(schedule: schedule)
    }
    private func changeSandboxReminderSettings(schedule: ReminderSchedule?) async {
        guard !busy, sandboxBillingConfigured, let session else { return }
        let receipt = reminderSettings
        if schedule != nil, receipt?.premiumActive != true { return }
        let expected = generation, binding = accountBindingRevision
        busy = true; message = nil
        defer { if expected == generation, binding == accountBindingRevision { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard !Task.isCancelled, expected == generation, binding == accountBindingRevision,
                  signedIn, billingAccount == credentials.user.id, snapshotAccount == credentials.user.id else { return }
            let service = ReminderSettingsAPI(isolatedDevelopment: isolatedDevelopmentEnabled)
            let result: ReminderSettingsReceipt
            if let schedule, let receipt {
                result = try await service.save(schedule, revision: receipt.revision, token: credentials.access_token)
            } else {
                result = try await service.load(token: credentials.access_token)
            }
            guard !Task.isCancelled, expected == generation, binding == accountBindingRevision,
                  billingAccount == credentials.user.id, snapshotAccount == credentials.user.id else { return }
            reminderSettings = result
            message = schedule == nil ? nil : "テスト用の設定をサーバーで確認しました。この端末で受け取るには通知への適用を押してください。"
        } catch {
            guard !Task.isCancelled, expected == generation, binding == accountBindingRevision else { return }
            // A lost acknowledgement can follow a successful write. Require a
            // fresh read before another edit; never infer a committed revision.
            reminderSettings = nil
            message = "通知設定は準備中、または結果を確認できません。最新の設定を読み込んでください。"
        }
    }
    var formalReminderEnvironment: BillingEnvironment? {
        guard api != nil, Bundle.main.infoDictionary?["OUCHI_REMINDER_SETTINGS_ENABLED"] as? Bool == true,
              let value = Bundle.main.infoDictionary?["OUCHI_REMINDER_SETTINGS_ENVIRONMENT"] as? String else { return nil }
        return BillingEnvironment(rawValue: value)
    }
    /// Preferences only; never registers or dispatches a notification.
    var explicitEnrollmentConfigured: Bool {
        api != nil && Bundle.main.infoDictionary?["OUCHI_EXPLICIT_ENROLLMENT_ENABLED"] as? Bool == true
    }
    /// Prepared entry only; the shipped plist has registration disabled.
    /// This result never turns on a subscription or substitutes for rights API.
    var appAttestRegistrationConfigured: Bool {
        api != nil && (try? AppAttestRegistrationConfiguration.parse(info: Bundle.main.infoDictionary ?? [:], bundleIdentifier: Bundle.main.bundleIdentifier)) != nil
    }
    private func makeAppAttestCoordinator(configuration: AppAttestRegistrationConfiguration, bundle: String,
                                         current: @escaping AppAttestRegistrationCoordinator.CurrentContext) throws -> AppAttestRegistrationCoordinator {
        if let existing = appAttestRegistrationCoordinator {
            guard appAttestCoordinatorConfiguration == configuration else { throw CloudError.unavailable }
            return existing
        }
        let keys = try AppAttestEncryptionKeyStorage(namespace: bundle)
        let references = try AppAttestKeyReferenceStorage(namespace: bundle)
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let pending = AppAttestPendingRegistrationStorage(root: support.appendingPathComponent("OuchiAppAttestPendingRegistration", isDirectory: true), keyProvider: { account, epoch in
            guard let key = try keys.read(account: account, epoch: epoch) else { throw CloudError.unavailable }
            return key
        }, expiryAuthorization: { scope, now in
            guard try references.pendingClosure(account: scope.userID) == nil else { return false }
            if let generated = try references.generated(account: scope.userID, epoch: scope.epochID, nowMilliseconds: now) {
                return generated.scope == scope
            }
            if let confirmed = try references.confirmed(account: scope.userID, epoch: scope.epochID, nowMilliseconds: now) {
                return confirmed.scope == scope
            }
            return false
        })
        let coordinator = try AppAttestRegistrationCoordinator(currentContext: current, device: AppAttestDeviceService(), encryptionKeys: keys,
            references: references, pending: pending, retentionMilliseconds: configuration.referenceRetentionMilliseconds)
        appAttestRegistrationCoordinator = coordinator; appAttestCoordinatorConfiguration = configuration
        return coordinator
    }
    @Published private(set) var pendingRegistrationMaintenanceNeedsAttention = false
    /// Runs only for explicitly configured registration and a current enrolled account.
    /// No DeviceCheck generation, attestation, purchase or notification registration.
    func maintainExpiredPendingRegistration() async {
        guard !busy, signedIn, appAttestRegistrationConfigured, let session, let account = snapshotAccount else { return }
        let expected = generation, revision = accountBindingRevision
        busy = true
        defer { if expected == generation, revision == accountBindingRevision { busy = false } }
        do {
            guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { throw CloudError.unavailable }
            let probe = AppAttestPendingRegistrationStorage(root: support.appendingPathComponent("OuchiAppAttestPendingRegistration", isDirectory: true), keyProvider: { _, _ in throw CloudError.unavailable })
            guard try await probe.hasPendingRecords(account: account) else {
                if expected == generation, revision == accountBindingRevision { pendingRegistrationMaintenanceNeedsAttention = false }
                return
            }
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                  signedIn, snapshotAccount == account else { return }
            guard let configuration = try AppAttestRegistrationConfiguration.parse(info: Bundle.main.infoDictionary ?? [:], bundleIdentifier: Bundle.main.bundleIdentifier),
                  let bundle = Bundle.main.bundleIdentifier else { return }
            let provider = AppAttestEnrollmentContextProvider(session: session, configuration: configuration)
            let current: AppAttestRegistrationCoordinator.CurrentContext = { [weak self] in
                guard let self, await self.signedIn, await self.snapshotAccount == account else { return nil }
                guard let context = try? await provider.load(expectedAccount: account),
                      await self.signedIn, await self.snapshotAccount == account else { return nil }
                return context
            }
            let captured = try await provider.load(expectedAccount: account)
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                  signedIn, snapshotAccount == account else { return }
            let coordinator = try makeAppAttestCoordinator(configuration: configuration, bundle: bundle, current: current)
            _ = try await coordinator.pruneExpiredPending(captured: captured)
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                  signedIn, snapshotAccount == account else { return }
            pendingRegistrationMaintenanceNeedsAttention = false
        } catch {
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                  signedIn, snapshotAccount == account else { return }
            pendingRegistrationMaintenanceNeedsAttention = true
        }
    }
    func prepareAppAttestRegistration() async -> AppAttestRegistrationPreparation? {
        guard !busy, signedIn, api != nil, let session, let account = snapshotAccount else { return nil }
        let expected = generation, revision = accountBindingRevision
        do {
            guard let configuration = try AppAttestRegistrationConfiguration.parse(info: Bundle.main.infoDictionary ?? [:], bundleIdentifier: Bundle.main.bundleIdentifier),
                  let bundle = Bundle.main.bundleIdentifier else { return nil }
            busy = true
            defer { if expected == generation { busy = false } }
            let provider = AppAttestEnrollmentContextProvider(session: session, configuration: configuration)
            let current: AppAttestRegistrationCoordinator.CurrentContext = { [weak self] in
                guard let self, await self.signedIn, await self.snapshotAccount == account else { return nil }
                guard let context = try? await provider.load(expectedAccount: account),
                      await self.signedIn, await self.snapshotAccount == account else { return nil }
                return context
            }
            let captured = try await provider.load(expectedAccount: account)
            guard expected == generation, revision == accountBindingRevision, signedIn, snapshotAccount == account else { return nil }
            if let existing = appAttestRegistrationCoordinator {
                guard appAttestCoordinatorConfiguration == configuration else { throw CloudError.unavailable }
                let result = try await existing.register(captured: captured)
                guard expected == generation, revision == accountBindingRevision, signedIn else { return nil }
                return result
            }
            let coordinator = try makeAppAttestCoordinator(configuration: configuration, bundle: bundle, current: current)
            let result = try await coordinator.register(captured: captured)
            guard expected == generation, revision == accountBindingRevision, signedIn else { return nil }
            return result
        } catch is CancellationError { return nil }
        catch {
            if expected == generation, revision == accountBindingRevision, signedIn {
                message = "端末の確認を完了できませんでした。通信状態を確認してください。改善しない場合はサポートへお問い合わせください。"
            }
            return nil
        }
    }
    func confirmExplicitEnrollment(password: String? = nil) async -> EnrollmentState? {
        guard !busy, signedIn, explicitEnrollmentConfigured, let session else { return nil }
        busy = true; message = nil
        let expected = generation, revision = accountBindingRevision
        defer { if expected == generation { busy = false } }
        let stillBound = { [self] in !Task.isCancelled && signedIn && expected == generation && revision == accountBindingRevision }
        do {
            let credentials = try await session.credentials()
            guard stillBound(), snapshotAccount == credentials.user.id else { return nil }
            let service = AccountEnrollmentAPI()
            var granted: UUID?
            if let password {
                granted = try await service.register(account: credentials.user.id, token: credentials.access_token, password: password, requestID: UUID())
            }
            let afterWrite = try await session.credentials()
            guard stillBound(), afterWrite.user.id == credentials.user.id, afterWrite.access_token == credentials.access_token else { return nil }
            let state = try await service.load(account: credentials.user.id, token: credentials.access_token)
            let current = try await session.credentials()
            guard stillBound(), current.user.id == credentials.user.id, current.access_token == credentials.access_token,
                  granted == nil || state.epochID == granted else { return nil }
            return state
        } catch {
            if stillBound() { message = "登録結果を確認できません。パスワードと通信状態を確認し、まず登録状態を読み直してください。退会処理中は登録できません。" }
            return nil
        }
    }

    var formalChannelEnvironment: BillingEnvironment? {
        guard api != nil, Bundle.main.infoDictionary?["OUCHI_NOTIFICATION_CHANNELS_ENABLED"] as? Bool == true,
              let value = Bundle.main.infoDictionary?["OUCHI_NOTIFICATION_CHANNEL_ENVIRONMENT"] as? String else { return nil }
        return BillingEnvironment(rawValue: value)
    }
    func stopLocalPendingForRemoteDelivery() async {
        guard !busy, signedIn, let account = snapshotAccount else { return }
        busy = true; message = nil
        let expected = generation, revision = accountBindingRevision
        defer { if expected == generation { busy = false } }
        let stillBound: @MainActor () -> Bool = { [self] in !Task.isCancelled && signedIn && expected == generation && revision == accountBindingRevision && snapshotAccount == account }
        let stopped = await reminders.stopPendingForRemoteDelivery(account: account, stillBound: stillBound)
        guard stillBound() else { return }
        if stopped { remindersEnabled = false; message = "この端末内の予約通知を停止しました。遠隔配信の有効化は別の設定です。" }
        else { message = "予約通知の停止を確認できません。通知設定を確認して、もう一度お試しください。" }
    }
    func changeFormalChannel(_ channel: NotificationChannel? = nil, prior: FormalChannelSelection? = nil) async -> FormalChannelSelection? {
        guard !busy, signedIn, let environment = formalChannelEnvironment, let session else { return nil }
        busy = true; message = nil
        let expected = generation, revision = accountBindingRevision, home = homeID
        defer { if expected == generation { busy = false } }
        let stillBound = { [self] in !Task.isCancelled && signedIn && expected == generation && revision == accountBindingRevision && home == homeID }
        do {
            let credentials = try await session.credentials()
            guard stillBound(), snapshotAccount == credentials.user.id else { return nil }
            let billing = BillingAPI(environment: environment)
            let rights = try await billing.entitlement(token: credentials.access_token)
            guard stillBound(), rights.environment == environment.rawValue, let epoch = rights.purchaseAccountToken else { return nil }
            let service = FormalNotificationChannelAPI(environment: environment)
            let receipt: NotificationChannelReceipt
            if let channel {
                guard let prior, prior.current, prior.epoch == epoch, prior.environment == environment else { throw CloudError.invalidInput }
                receipt = try await service.save(channel, revision: prior.receipt.revision, epoch: epoch, token: credentials.access_token)
            } else { receipt = try await service.load(epoch: epoch, token: credentials.access_token) }
            guard stillBound() else { return nil }
            let current = try await billing.entitlement(token: credentials.access_token)
            let currentCredentials = try await session.credentials()
            guard stillBound(), current.purchaseAccountToken == epoch, current.environment == environment.rawValue,
                  currentCredentials.user.id == credentials.user.id, currentCredentials.access_token == credentials.access_token else { return nil }
            if channel != nil { message = "受け取り先の保存を確認しました。実際の配信は準備中です。" }
            let now = Date()
            return FormalChannelSelection(receipt: receipt, epoch: epoch, environment: environment, checkedAt: now,
                                          deadline: now.addingTimeInterval(300), clockStart: .now)
        } catch {
            if stillBound() { message = "保存結果を確認できません。最新の受け取り先を読み込んでください。" }
            return nil
        }
    }

    func changeFormalReminderSettings(schedule: ReminderSchedule? = nil, prior: FormalReminderSelection? = nil) async -> FormalReminderSelection? {
        guard !busy, signedIn, let environment = formalReminderEnvironment, let session else { return nil }
        busy = true; message = nil
        let expected = generation, revision = accountBindingRevision, home = homeID
        defer { if expected == generation { busy = false } }
        let stillBound = { [self] in !Task.isCancelled && signedIn && expected == generation && revision == accountBindingRevision && home == homeID }
        do {
            let credentials = try await session.credentials()
            guard stillBound(), snapshotAccount == credentials.user.id else { return nil }
            let billing = BillingAPI(environment: environment)
            let rights = try await billing.entitlement(token: credentials.access_token)
            guard stillBound(), let epoch = rights.purchaseAccountToken else { return nil }
            let service = FormalReminderSettingsAPI(environment: environment)
            let receipt: ReminderSettingsReceipt
            if let schedule {
                guard let prior, prior.epoch == epoch, prior.environment == environment,
                      rights.premiumIsCurrent(expectedEnvironment: environment) else {
                    if stillBound() { message = "現在の利用権を確認して、最新の設定を読み込んでください。" }; return nil
                }
                receipt = try await service.save(schedule, revision: prior.receipt.revision, epoch: epoch, token: credentials.access_token)
            } else {
                receipt = try await service.load(epoch: epoch, token: credentials.access_token)
            }
            guard stillBound() else { return nil }
            let current = try await billing.entitlement(token: credentials.access_token)
            guard stillBound(), current.purchaseAccountToken == epoch,
                  receipt.premiumActive == current.premiumIsCurrent(expectedEnvironment: environment) else {
                if stillBound() { message = "利用状態が変わりました。最新の設定を読み込んでください。" }; return nil
            }
            if schedule != nil { message = "設定の保存を確認しました。通知の配信は準備中です。" }
            return FormalReminderSelection(receipt: receipt, epoch: epoch, rights: current, environment: environment)
        } catch {
            if stillBound() { message = "保存結果を確認できません。最新の設定を読み込んでから、もう一度お試しください。" }
            return nil
        }
    }
    /// Availability only. This flag never grants premium rights.
    var formalReportEnvironment: BillingEnvironment? {
        guard api != nil, Bundle.main.infoDictionary?["OUCHI_REPORTS_ENABLED"] as? Bool == true,
              let value = Bundle.main.infoDictionary?["OUCHI_REPORT_ENVIRONMENT"] as? String else { return nil }
        return BillingEnvironment(rawValue: value)
    }
    func loadFormalReport() async -> ReportDisplayLease? {
        guard !busy, signedIn, let environment = formalReportEnvironment, let session,
              household?.homes.contains(where: { $0.id == homeID }) == true else { return nil }
        busy = true; message = nil
        let expected = generation, expectedReport = reportGeneration, revision = accountBindingRevision, home = homeID
        defer { if expected == generation { busy = false } }
        let stillBound = { [self] in
            !Task.isCancelled && signedIn && expected == generation && expectedReport == reportGeneration && revision == accountBindingRevision && home == homeID
        }
        do {
            let credentials = try await session.credentials()
            guard stillBound(), snapshotAccount == credentials.user.id else { return nil }
            let billing = BillingAPI(environment: environment)
            let rights = try await billing.entitlement(token: credentials.access_token)
            guard stillBound(), let epoch = rights.purchaseAccountToken,
                  rights.premiumIsCurrent(expectedEnvironment: environment) else {
                if stillBound() { message = "有料プランの利用権を確認できません。" }; return nil
            }
            let result = try await FormalReportAPI(environment: environment).load(home: home, epoch: epoch, token: credentials.access_token)
            guard stillBound() else { return nil }
            let current = try await billing.entitlement(token: credentials.access_token)
            guard stillBound(), current.purchaseAccountToken == epoch, current.premiumIsCurrent(expectedEnvironment: environment) else { return nil }
            return try ReportDisplayLease(report: result, rights: current, environment: environment)
        } catch {
            if stillBound() { message = "レポートを取得できません。ログイン状態と通信を確認してお試しください。" }
            return nil
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
            guard !Task.isCancelled, expected == generation, expectedReport == reportGeneration, billingAccount == credentials.user.id, let purchaseAccount else { return }
            let rights = try await BillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
            guard !Task.isCancelled, expected == generation, expectedReport == reportGeneration else { return }
            guard rights.purchaseAccountToken == purchaseAccount else { throw CloudError.malformedResponse }
            sandboxEntitlement = rights
            guard rights.premiumIsCurrent() else { message = "テスト用の有料利用権を確認できません。"; return }
            let value = try await ReportAPI(sandboxPreview: true, isolatedDevelopment: isolatedDevelopmentEnabled).load(home: home, token: credentials.access_token)
            guard !Task.isCancelled, expected == generation, expectedReport == reportGeneration, home == homeID else { return }
            report = value
        } catch {
            if !Task.isCancelled, expected == generation, expectedReport == reportGeneration {
                message = "レポートを取得できません。テスト用サービスの準備と通信を確認してください。"
            }
        }
    }
    // Approval can arrive while the app is suspended. Replay without opening a
    // purchase prompt, only after the current authenticated binding is checked.
    func recoverPurchasesOnForeground() async {
        #if DEBUG
        guard sandboxBillingConfigured, let session else { return }
        let expected = generation
        do {
            let credentials = try await session.credentials()
            guard !Task.isCancelled, expected == generation,
                  billingAccount == credentials.user.id, let purchaseAccount else { return }
            try await purchases.observeUnfinished(account: purchaseAccount)
        } catch {
            if !Task.isCancelled, expected == generation { purchases.markRetryNeeded() }
        }
        #endif
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
        guard !isUIReviewSample else { return }
        guard Bundle.main.object(forInfoDictionaryKey: "IOS_SANDBOX_BILLING") as? String == "YES",
              let session else { return }
        purchases.stopObserving()
        let expected = generation
        billingAccount = nil; purchaseAccount = nil; sandboxEntitlement = nil; billingRecoveryStatus = nil; purchases.persist = nil
        let billing = BillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled)
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
        guard !busy, let household, let account = snapshotAccount else { return }
        do {
            let url = try managedExport(CalendarExport.encode(household), account: account, suffix: "ics")
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
            var email = credentials.user.email
            if email == nil {
                email = (try? await api.currentUser(token: credentials.access_token, expectedUser: credentials.user.id))?.email
            }
            guard expected == generation else { return }
            snapshotAccount = credentials.user.id; showingOfflineSnapshot = false
            accountEmail = email
            household = value
            await bindSandboxBilling(account: credentials.user.id)
            guard expected == generation else { return }
            let notificationState = (try? await reconcileReminders(data: value, credentials: credentials)) ?? false
            guard expected == generation else { return }
            remindersEnabled = notificationState
            if !value.homes.contains(where: { $0.id == homeID }) { homeID = value.homes.first?.id ?? "" }
        } catch {
            if expected == generation {
                let accessDenied = error as? CloudError == .authenticationRequired || error as? CloudError == .rejected(401) || error as? CloudError == .rejected(403)
                var localCleanupFailed = false
                if accessDenied {
                    accountEmail = nil
                    do { try snapshotStorage?.write(nil) } catch { localCleanupFailed = true }
                    snapshotAccount = nil; household = nil; showingOfflineSnapshot = false; homeID = ""
                    if !clearTemporaryExports() { localCleanupFailed = true }
                    clearFamily(); billingAccount = nil; purchaseAccount = nil; sandboxEntitlement = nil; billingRecoveryStatus = nil
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
            let notificationState = (try? await reconcileReminders(data: fresh, credentials: credentials)) ?? false
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
            let notificationState = (try? await reconcileReminders(data: fresh, credentials: credentials)) ?? false
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
