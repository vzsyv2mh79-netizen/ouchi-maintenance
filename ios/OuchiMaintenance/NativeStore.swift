import Foundation
import Combine
import StoreKit
import OuchiCore
#if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
import AppKit
#endif

struct NativeTOTPVerificationContext: Identifiable {
    let id: UUID
    let account: UUID
    let api: TOTPVerificationAPI
    let controller: SessionController
}

struct FormalNativePushSelection {
    let receipt: NativePushRegistrationReceipt
    let account: UUID
}

/// Ephemeral authenticated context; bearer is never stored in reference custody.
struct AccountClosureReviewSelection {
    let accountID: UUID
    let epochID: UUID
    let revision: UUID
    let processingExplanation: String
}

struct HomeManagementSelection {
    let accountID: UUID
    let epochID: UUID
    let homeID: UUID
    let revision: UUID
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
    @Published private(set) var accountBindingRevision = UUID() { didSet {
        reminderSettings = nil; pendingRegistrationMaintenanceNeedsAttention = false
        sandboxRestoreOutcome = nil; sandboxRestoreNeedsAttention = false
        clearReleaseBilling()
    } }
    @Published private(set) var reminderSettings: ReminderSettingsReceipt?
    var preparedDeletionAccountID: UUID? { signedIn ? snapshotAccount : nil }
    let closureReviewVault = AccountClosureReviewVault(
        service: (Bundle.main.bundleIdentifier ?? "ouchi") + ".closure-review-references")
    let homeManagementVault = HomeManagementIntentVault(
        service: (Bundle.main.bundleIdentifier ?? "ouchi") + ".home-management-references")
    var homeManagementConfigured: Bool {
        api != nil && Bundle.main.infoDictionary?["OUCHI_HOME_MANAGEMENT_ENABLED"] as? Bool == true
    }
    func homeManagementSelectionIsCurrent(_ selection: HomeManagementSelection) -> Bool {
        signedIn && !showingOfflineSnapshot && homeManagementConfigured && snapshotAccount == selection.accountID
            && accountBindingRevision == selection.revision && UUID(uuidString: homeID) == selection.homeID
    }
    /// Existing enrollment only: opening this screen never creates an epoch or
    /// changes management. Bearers stay ephemeral in SessionController.
    func prepareHomeManagement() async -> HomeManagementSelection? {
        guard !busy, signedIn, !showingOfflineSnapshot, homeManagementConfigured,
              let session, let account = snapshotAccount, let home = UUID(uuidString: homeID) else { return nil }
        let expected = generation, revision = accountBindingRevision
        let selectionIsCurrent = { [self] in !Task.isCancelled && generation == expected && signedIn
            && !showingOfflineSnapshot && snapshotAccount == account && accountBindingRevision == revision
            && UUID(uuidString: homeID) == home && homeManagementConfigured }
        busy = true; message = nil
        defer { if generation == expected && accountBindingRevision == revision { busy = false } }
        do {
            let before = try await session.credentials()
            guard selectionIsCurrent(), before.user.id == account else { return nil }
            let enrolled = try await configuredEnrollmentAPI().load(account: account, token: before.access_token)
            let after = try await session.credentials()
            guard selectionIsCurrent(), after.user.id == account, after.access_token == before.access_token,
                  enrolled.userID == account, let epoch = enrolled.epochID else { return nil }
            return .init(accountID: account, epochID: epoch, homeID: home, revision: revision)
        } catch {
            if selectionIsCurrent() { message = "住まいの管理状態を準備できませんでした。通信とログイン状態を確認してください。管理の変更は送信していません。" }
            return nil
        }
    }
    func authorizeHomeManagement(_ selection: HomeManagementSelection) async throws -> String {
        guard !busy, homeManagementSelectionIsCurrent(selection), let session else { throw CloudError.authenticationRequired }
        let credentials = try await session.credentials()
        guard !Task.isCancelled, homeManagementSelectionIsCurrent(selection), credentials.user.id == selection.accountID else { throw CloudError.authenticationRequired }
        return credentials.access_token
    }
    var closureReviewConfigured: Bool {
        closureProgressConfigured && Bundle.main.infoDictionary?["OUCHI_CLOSURE_REVIEW_ENABLED"] as? Bool == true
            && closureReviewProcessingExplanation != nil
    }
    private var closureReviewProcessingExplanation: String? {
        guard let value = Bundle.main.infoDictionary?["OUCHI_CLOSURE_REVIEW_PROCESSING_EXPLANATION"] as? String else { return nil }
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return !text.isEmpty && text.utf8.count <= 2048 ? text : nil
    }
    /// Read an existing enrollment only. Viewing settings never enrolls, purchases,
    /// starts deletion or invents an epoch from the user's ID/household.
    func prepareClosureReview() async -> AccountClosureReviewSelection? {
        guard !busy, signedIn, closureReviewConfigured, let session,
              let account = snapshotAccount, let explanation = closureReviewProcessingExplanation else { return nil }
        let expected = generation, revision = accountBindingRevision
        busy = true; message = nil
        defer { if expected == generation && revision == accountBindingRevision { busy = false } }
        let current = { [self] in !Task.isCancelled && signedIn && snapshotAccount == account
            && generation == expected && accountBindingRevision == revision }
        do {
            let before = try await session.credentials()
            guard current(), before.user.id == account else { return nil }
            let enrolled = try await configuredEnrollmentAPI().load(account: account, token: before.access_token)
            let after = try await session.credentials()
            guard current(), after.user.id == account, after.access_token == before.access_token,
                  enrolled.userID == account, let epoch = enrolled.epochID else { return nil }
            return .init(accountID: account, epochID: epoch, revision: revision,
                         processingExplanation: explanation)
        } catch {
            if current() { message = "退会依頼の準備を確認できません。通信とログイン状態を確認してください。依頼は送信していません。" }
            return nil
        }
    }
    let closureReadVault = ClosureReadCredentialVault(service: (Bundle.main.bundleIdentifier ?? "ouchi") + ".closure-read-custody")
    #if DEBUG
    private var closureRootReviewAPI: ClosureReadCustodyAPI?
    @Published private(set) var closureRootReviewAwaitingInterruption = false
    static var closureRootInterruptionFile: URL { URL.documentsDirectory.appendingPathComponent("OuchiRootAuthErasurePause.txt") }
    #endif
    var closureReadAPI: ClosureReadCustodyAPI {
        #if DEBUG
        if let closureRootReviewAPI { return closureRootReviewAPI }
        #endif
        return ClosureReadCustodyAPI(server: configuredServiceServer, environment: configuredReviewEnvironment)
    }
    var closureReadCustodyConfigured: Bool {
        #if DEBUG
        if closureRootReviewAPI != nil { return true }
        #endif
        return api != nil && Bundle.main.infoDictionary?["OUCHI_CLOSURE_READ_CUSTODY_ENABLED"] as? Bool == true
    }
    /// Local filtering only; the server authenticates the scoped read capability.
    /// Never interpret an unknown signed-in identity as permission to show every account.
    func localClosureReadAccount() async throws -> UUID? {
        guard !busy else { throw CloudError.unavailable }
        guard signedIn else { return nil }
        guard let session else { throw CloudError.authenticationRequired }
        let expected = generation, revision = accountBindingRevision
        let account = await session.localAccount()
        guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
              signedIn, let account else { throw CloudError.authenticationRequired }
        return account
    }
    var closureProgressConfigured: Bool {
        api != nil && Bundle.main.infoDictionary?["OUCHI_CLOSURE_PROGRESS_ENABLED"] as? Bool == true
    }
    /// Authenticated read-only recovery is independent of active Ouchi enrollment.
    /// The server re-verifies the session and exact saved epoch/submission.
    func savedClosureProgressReferences() async throws -> (UUID, UUID, [AccountClosureReviewBinding]) {
        guard signedIn, closureProgressConfigured, let session else { throw CloudError.authenticationRequired }
        let expected = generation, revision = accountBindingRevision
        let credentials = try await session.credentials()
        guard !Task.isCancelled, signedIn, expected == generation, revision == accountBindingRevision else { throw CloudError.authenticationRequired }
        let account = credentials.user.id
        let references = try closureReviewVault.references(accountID: account)
        return (account, revision, references)
    }
    func authorizeSavedClosureProgress(account: UUID, revision: UUID) async throws -> String {
        guard signedIn, revision == accountBindingRevision, let session else { throw CloudError.authenticationRequired }
        let expected = generation
        let credentials = try await session.credentials()
        guard !Task.isCancelled, signedIn, expected == generation, revision == accountBindingRevision,
              credentials.user.id == account else { throw CloudError.authenticationRequired }
        return credentials.access_token
    }
    /// Dedicated receipt custody is independent of login storage. Logging out
    /// does not remove credentials needed to read an already accepted request.
    let deletionReceiptVault = DeletionReadCredentialVault(
        service: (Bundle.main.bundleIdentifier ?? "ouchi") + ".deletion-receipts")
    lazy var deletionReceiptRecoveryFlow = DeletionReceiptRecoveryFlow(api: DeletionReceiptAPI(
        server: configuredServiceServer, environment: configuredReviewEnvironment)) { [deletionReceiptVault] binding in
        try deletionReceiptVault.recoveryReceipt(binding)
    }
    @Published private(set) var accountEmail: String?
    @Published private(set) var busy = false
    @Published var message: String? { didSet { messageRevision = UUID() } }
    @Published private(set) var messageRevision = UUID()
    func dismissMessage(ifCurrent revision: UUID) {
        guard messageRevision == revision else { return }
        message = nil
    }
    @Published var homeID = "" { didSet { if oldValue != homeID { report = nil; reportGeneration += 1 } } }
    @Published private(set) var exportURL: URL?
    @Published private(set) var calendarURL: URL?
    @Published private(set) var attachmentExportURL: URL?
    @Published private(set) var familyMembers: [FamilyMember] = []
    @Published private(set) var inviteCode: String?
    @Published private(set) var familyHomeID: String?
    private let api: HouseholdAPI?
    private let session: SessionController?
    private var totpVerificationAPI: TOTPVerificationAPI?
    private let isolatedDevelopmentEnabled: Bool
    private(set) var isUIReviewSample = false
    #if DEBUG
    private(set) var isPurchaseRecoveryUIReviewSample = false
    private var isClosureUIReviewSample = false
    private var closureCleanupReviewFixture = false
    private var reviewClosureRecords: [AppAttestAccountClosure] = []
    private var reviewClosureFailure = true
    #endif
    private var generation = 0 { didSet { accountBindingRevision = UUID() } }
    private var familyGeneration = 0
    private var reportGeneration = 0
    private var attachmentExportGeneration = 0
    @Published private(set) var report: MaintenanceReport?
    let purchases = PurchaseManager()
    lazy var releasePurchases: PurchaseManager = {
        #if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
        if let releaseFixturePurchases { return releaseFixturePurchases }
        #endif
        return PurchaseManager(environment: releasePurchaseEnvironment ?? .production)
    }()
    #if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
    private var releaseFixturePurchases: PurchaseManager?
    private var releaseFixtureBilling: BillingAPI?
    private var releaseFixtureAttachments: AttachmentAPI?
    private var releaseFixtureOffer: SubscriptionOfferDisclosure?
    private var releaseFixturePurchasesEnabled = false
    init(localStoreKitWindow: NSWindow, household: HouseholdAPI, session: SessionController, billing: BillingAPI, account: UUID, allowPurchases: Bool = false,
         attachments: AttachmentAPI? = nil, offer: SubscriptionOfferDisclosure? = nil) throws {
        guard Bundle.main.bundleIdentifier == "dev.ouchi.review.storekit.catalog",
              Bundle(for: NativeStore.self).bundleIdentifier == "dev.ouchi.review.storekit.catalog.tests",
              billing.environment == .sandbox, account == NativeReviewFixture.account,
              (attachments == nil) == (offer == nil) else { throw CloudError.unavailable }
        api = household; self.session = session; isolatedDevelopmentEnabled = false
        releaseFixturePurchases = try PurchaseManager(localStoreKitFixtureWindow: localStoreKitWindow)
        releaseFixtureBilling = billing
        releaseFixtureAttachments = attachments; releaseFixtureOffer = offer
        releaseFixturePurchasesEnabled = allowPurchases
        isUIReviewSample = true; snapshotAccount = account; signedIn = true
    }
    func replaceReleaseFixtureBinding() throws {
        guard releaseFixtureBilling != nil else { throw CloudError.unavailable }
        accountBindingRevision = UUID()
    }
    #endif
    @Published private(set) var releaseEntitlement: VerifiedEntitlement?
    @Published private(set) var releaseAttachmentCapacity: AttachmentAPI.Usage?
    private var releasePurchaseEpoch: UUID?
    private var releaseBillingAccount: UUID?
    private var billingAccount: UUID?
    private var purchaseAccount: UUID?
    @Published private(set) var sandboxEntitlement: SandboxEntitlement?
    @Published private(set) var billingRecoveryStatus: BillingRecoveryStatus?
    private var reminders = LocalReminders()
    private struct ClosureCleanupReservation {
        let id: UUID
        let binding: ClosureReadCustodyFlow.Binding
        let generation: Int
        let signedIn: Bool
        var started = false
        var authErased = false
    }
    private var closureCleanupReservation: ClosureCleanupReservation?
    var closureLocalCleanupConfigured: Bool {
        #if DEBUG
        if closureCleanupReviewFixture { return true }
        #endif
        return closureReadCustodyConfigured && Bundle.main.infoDictionary?["OUCHI_CLOSURE_LOCAL_CLEANUP_ENABLED"] as? Bool == true
    }
    /// Holds the login UI reservation across fresh server verification, every
    /// local eraser and the flow's final protected-key readback. Never revokes
    /// a shared Auth session or calls a remote deletion/enrollment API.
    func cleanupClosureReadData(binding: ClosureReadCustodyFlow.Binding, flow: ClosureReadCustodyFlow) async throws -> AccountDeletionLocalCleanupResult {
        guard closureLocalCleanupConfigured, !busy, binding.revision == accountBindingRevision, let session else { throw CloudError.unavailable }
        let reservation = ClosureCleanupReservation(id: UUID(), binding: binding, generation: generation, signedIn: signedIn)
        closureCleanupReservation = reservation; busy = true
        var result = AccountDeletionLocalCleanupResult.pending
        defer { finishClosureCleanup(reservation.id, result: result) }
        guard closureCleanupIsCurrent(reservation.id) else { throw CloudError.authenticationRequired }
        let local = await session.localAccount()
        guard closureCleanupIsCurrent(reservation.id), !Task.isCancelled else { throw CloudError.authenticationRequired }
        if let local {
            guard local == binding.accountID else { throw CloudError.authenticationRequired }
        } else {
            guard !signedIn else { throw CloudError.authenticationRequired }
            _ = try await session.prepareLocalClosureRecovery(accountID: binding.accountID)
            guard closureCleanupIsCurrent(reservation.id), !Task.isCancelled else { throw CloudError.authenticationRequired }
        }
        result = try await flow.cleanupLocalData { confirmation, receipt, retained in
            guard confirmation.binding == binding else { return .staleBinding }
            return await self.applyClosureCleanup(reservation.id, confirmation: confirmation, receipt: receipt, retained: retained)
        }
        return result
    }
    private func closureCleanupIsCurrent(_ id: UUID) -> Bool {
        guard let active = closureCleanupReservation, active.id == id else { return false }
        let binding = active.binding
        return busy && generation == active.generation && accountBindingRevision == binding.revision && signedIn == active.signedIn
            && (snapshotAccount == nil || snapshotAccount == binding.accountID)
            && (household == nil || snapshotAccount == binding.accountID)
            && (purchaseAccount == nil || purchaseAccount == binding.scope.epochID)
    }
    private func finishClosureCleanup(_ id: UUID, result: AccountDeletionLocalCleanupResult) {
        guard let active = closureCleanupReservation, active.id == id else { return }
        let current = closureCleanupIsCurrent(id)
        closureCleanupReservation = nil
        defer { busy = false }
        guard current, active.started, active.authErased else { return }
        // Credential erasure cannot be undone by view cancellation. Reflect its
        // durable absence, but never call a partial registration cleanup complete.
        appAttestRegistrationCoordinator = nil; appAttestCoordinatorConfiguration = nil
        snapshotAccount = nil; signedIn = false; accountEmail = nil
        billingAccount = nil; purchaseAccount = nil
        developmentRemoteRegistration = nil; developmentRemoteNotificationsRegistered = false
        generation += 1
        message = result == .complete
            ? "この端末内の整理が完了しました。退会処理の確認情報は残しています。"
            : "ログイン情報は消去しました。端末内の整理は一部未完了です。保存した退会処理から再確認してください。"
    }
    private func clearClosureCleanupVisibleData() {
        attachmentExportGeneration += 1; reportGeneration += 1
        household = nil; showingOfflineSnapshot = false; homeID = ""; report = nil
        exportURL = nil; calendarURL = nil; attachmentExportURL = nil; clearFamily()
        sandboxEntitlement = nil; billingRecoveryStatus = nil; reminderSettings = nil
        purchases.stopObserving(); purchases.persist = nil; clearReleaseBilling()
    }
    private func applyClosureCleanup(_ id: UUID, confirmation: ClosureReadCustodyFlow.Confirmation, receipt: AccountDeletionStatus,
                                     retained: ClosureReadCustodyFlow.CleanupAuthorization) async -> AccountDeletionLocalCleanupResult {
        let binding = confirmation.binding, account = binding.accountID, epoch = binding.scope.epochID
        let current: @MainActor @Sendable () -> Bool = { self.closureCleanupIsCurrent(id) && retained.isCurrent() }
        guard current(), !Task.isCancelled, receipt.state == .complete,
              receipt.requestID == binding.scope.requestID, receipt.epochID == epoch,
              let session, let bundle = Bundle.main.bundleIdentifier,
              let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return .staleBinding }
        closureCleanupReservation?.started = true
        let pending = AppAttestPendingRegistrationStorage(root: support.appendingPathComponent("OuchiAppAttestPendingRegistration", isDirectory: true), keyProvider: { _, _ in throw CloudError.unavailable })
        let references: AppAttestKeyReferenceStorage
        let keys: AppAttestEncryptionKeyStorage
        do { references = try AppAttestKeyReferenceStorage(namespace: bundle); keys = try AppAttestEncryptionKeyStorage(namespace: bundle) }
        catch { return .pending }
        guard current(), !Task.isCancelled else { return .staleBinding }
        // Once fresh server completion and the exact local account are checked,
        // never keep showing a stale in-memory household after partial cleanup.
        clearClosureCleanupVisibleData()
        let result = await cleanAccountDeletionLocalData(receipt: receipt, account: account, epoch: epoch, revision: binding.revision,
            stillBound: current,
            stopNotifications: {
                let stopped = await self.reminders.eraseForAccountDeletion(account: account, stillBound: current)
                if stopped && current() { self.remindersEnabled = false }; return stopped
            },
            erasePendingRegistration: {
                do {
                    if let coordinator = self.appAttestRegistrationCoordinator { try await coordinator.stopAcceptingRegistration(account: account) }
                    guard current(), !Task.isCancelled else { return .staleBinding }
                    let lease = try await pending.acquireMutationLease()
                    defer { lease.release() }
                    guard current(), !Task.isCancelled else { return .staleBinding }
                    return await eraseAppAttestLocalRegistration(account: account, stillBound: current,
                        prepareClosure: {
                            let now = Date().timeIntervalSince1970 * 1000, expiry = confirmation.expiresAt.timeIntervalSince1970 * 1000
                            guard now.isFinite, expiry.isFinite, now > 0, expiry > now, expiry <= 9_007_199_254_740_991 else { throw CloudError.invalidInput }
                            // Use the original server read-window upper bound,
                            // never invent or extend a separate marker lifetime.
                            _ = try references.beginClosure(AppAttestAccountClosure(accountID: account, requestID: binding.scope.requestID,
                                createdAtMilliseconds: Int64(now), retainUntilMilliseconds: Int64(expiry)))
                        },
                        erasePendingProofs: { try await pending.eraseAccount(account); try await Self.erasePendingRestore(account: account) },
                        eraseEncryptionKeys: { try references.erase(account: account); try keys.erase(account: account) })
                } catch { return current() && !Task.isCancelled ? .pending : .staleBinding }
            },
            eraseSnapshot: {
                guard let storage = self.snapshotStorage else { throw CloudError.unavailable }
                try storage.remove(account: account)
            },
            erasePendingUpload: { try PendingAttachmentStorage().remove(account: account, epoch: epoch) },
            erasePendingRemoval: { try PendingAttachmentRemovalStorage().remove(account: account, epoch: epoch) },
            eraseManagedExports: {
                let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
                try ManagedExportStorage(root: caches.appendingPathComponent("OuchiManagedExports", isDirectory: true)).removeFiles(account: account)
                try self.homeManagementVault.eraseForCompletedAccount(accountID: account, epochID: epoch, receipt: receipt)
            },
            clearVisibleData: { self.clearClosureCleanupVisibleData() })
        guard result == .complete, current(), !Task.isCancelled else { return result == .complete ? .staleBinding : result }
        do {
            let local = await session.localAccount()
            guard current(), !Task.isCancelled else { return .staleBinding }
            if let local {
                guard local == account else { return .staleBinding }
                let permit = try await session.prepareCompletedDeletionErasure(receipt: receipt, account: account, epoch: epoch)
                guard current(), !Task.isCancelled else { return .staleBinding }
                let erased = try await session.eraseCompletedDeletionSession(permit)
                // Preserve this fact even if cancellation follows the actor hop.
                closureCleanupReservation?.authErased = true
                #if DEBUG
                try await pauseRootReviewAfterAuthErasureIfRequested(account: account, stillBound: current)
                #endif
                try await references.completeLocalClosure(confirmation: erased, session: session, pending: pending, encryptionKeys: keys,
                    eraseAdditionalPending: { try await Self.erasePendingRestore(account: $0) })
            } else {
                _ = try await session.prepareLocalClosureRecovery(accountID: account)
                guard current(), !Task.isCancelled else { return .staleBinding }
                closureCleanupReservation?.authErased = true
                guard let marker = try references.pendingClosure(account: account) else { return .pending }
                try await references.recoverAbandonedLocalClosure(expected: marker, session: session, pending: pending, encryptionKeys: keys,
                    eraseAdditionalPending: { try await Self.erasePendingRestore(account: $0) })
            }
            guard current(), !Task.isCancelled else { return .staleBinding }
            return .complete
        } catch { return closureCleanupIsCurrent(id) ? .pending : .staleBinding }
    }
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
                    erasePendingProofs: {
                        try await pending.eraseAccount(account)
                        try await Self.erasePendingRestore(account: account)
                    },
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
                if receipt.state == .complete {
                    try self.homeManagementVault.eraseForCompletedAccount(accountID: account, epochID: epoch, receipt: receipt)
                }
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
                        encryptionKeys: AppAttestEncryptionKeyStorage(namespace: bundle),
                        eraseAdditionalPending: { try await Self.erasePendingRestore(account: $0) })
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
                encryptionKeys: AppAttestEncryptionKeyStorage(namespace: bundle),
                        eraseAdditionalPending: { try await Self.erasePendingRestore(account: $0) })
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
            let billing = configuredBillingAPI(environment: config.purchase)
            let rights = try await billing.entitlement(token: credentials.access_token)
            guard stillBound(), rights.environment == config.purchase.rawValue, let epoch = rights.purchaseAccountToken else { return nil }
            let service = FormalNativePushAPI(notificationEnvironment: config.push, purchaseEnvironment: config.purchase, server: configuredServiceServer)
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

    #if DEBUG
    /// Bounded test barrier at the exact durable-erasure/marker-finalization
    /// boundary. XCTest terminates the app; no erasure callback is simulated.
    /// Release does not compile this hook, and other bundles cannot enter it.
    private func pauseRootReviewAfterAuthErasureIfRequested(account: UUID, stillBound: @MainActor @Sendable () -> Bool) async throws {
        guard closureRootReviewAPI != nil, Bundle.main.bundleIdentifier == "dev.ouchi.review.closure",
              Bundle.main.infoDictionary?["OUCHI_REVIEW_SAMPLE_DATA"] as? String == "YES",
              ProcessInfo.processInfo.arguments.contains("--ouchi-root-interrupt-after-auth"),
              account == UUID(uuidString: "11111111-1111-4111-8111-111111111111") else { return }
        let file = Self.closureRootInterruptionFile
        if FileManager.default.fileExists(atPath: file.path) {
            let bytes = try Data(contentsOf: file)
            guard [Data("auth-erased-waiting".utf8), Data("restart-verified".utf8)].contains(bytes) else { throw CloudError.unavailable }
            return
        }
        guard stillBound(), !Task.isCancelled,
              try KeychainSessionStorage(service: "dev.ouchi.review.closure.root-synthetic-auth").read() == nil,
              let pending = try AppAttestKeyReferenceStorage(namespace: "dev.ouchi.review.closure").pendingClosure(account: account),
              pending.requestID == UUID(uuidString: "dddddddd-dddd-4ddd-8ddd-dddddddddddd") else { throw CloudError.unavailable }
        try Data("auth-erased-waiting".utf8).write(to: file, options: .atomic)
        closureRootReviewAwaitingInterruption = true
        defer { closureRootReviewAwaitingInterruption = false }
        for _ in 0..<600 {
            try await Task.sleep(for: .milliseconds(100))
            guard stillBound(), !Task.isCancelled else { throw CancellationError() }
        }
        // A missed test interruption stays pending; never silently falls through
        // and creates a false successful crash-recovery result.
        throw CloudError.unavailable
    }
    /// Full NativeRoot composition; only transport/configuration are synthetic.
    /// Real restore/sign-in/sign-out, account revisions and Keychain paths run.
    init(closureRootPreviewAPI: HouseholdAPI, session: SessionController, custodyAPI: ClosureReadCustodyAPI) throws {
        guard Bundle.main.bundleIdentifier == "dev.ouchi.review.closure",
              Bundle.main.infoDictionary?["OUCHI_REVIEW_SAMPLE_DATA"] as? String == "YES" else { throw CloudError.unavailable }
        api = closureRootPreviewAPI; self.session = session; isolatedDevelopmentEnabled = false
        snapshotStorage = HouseholdSnapshotStorage(namespace: "closure-root-preview")
        isUIReviewSample = true; closureCleanupReviewFixture = true
        closureRootReviewAPI = custodyAPI
        // This test covers real Auth/files/capability custody, not the host
        // simulator's notification daemon. Never await that unrelated service.
        reminders = LocalReminders(backend: ClosureRootNotificationFixture(), preferences: ClosureRootReminderPreferences())
    }
    func closureRootPreviewHasNoAuth() async throws -> Bool {
        guard closureRootReviewAPI != nil, Bundle.main.bundleIdentifier == "dev.ouchi.review.closure", let session else { throw CloudError.unavailable }
        return await session.localAccount() == nil && !signedIn
    }
    /// Dedicated simulator-only cleanup composition with protected synthetic
    /// Auth storage. Production bundle/configuration cannot enter this path.
    init(closureCleanupPreviewAPI: HouseholdAPI, session: SessionController, account: UUID, restored: Bool) throws {
        guard Bundle.main.bundleIdentifier == "dev.ouchi.review.closure",
              Bundle.main.infoDictionary?["OUCHI_REVIEW_SAMPLE_DATA"] as? String == "YES" else { throw CloudError.unavailable }
        api = closureCleanupPreviewAPI; self.session = session; isolatedDevelopmentEnabled = false
        snapshotStorage = HouseholdSnapshotStorage(namespace: "closure-cleanup-preview")
        isUIReviewSample = true; isClosureUIReviewSample = true; closureCleanupReviewFixture = true
        snapshotAccount = restored ? account : nil; signedIn = restored
    }
    func closureCleanupPreviewProof(account: UUID, epoch: UUID) async throws -> Bool {
        guard closureCleanupReviewFixture, Bundle.main.bundleIdentifier == "dev.ouchi.review.closure", let session else { throw CloudError.unavailable }
        guard await session.localAccount() == nil, !signedIn,
              try KeychainSessionStorage(service: "dev.ouchi.review.closure.cleanup-synthetic-auth").read() == nil,
              try snapshotStorage?.read(account: account) == nil,
              try PendingAttachmentStorage().read(account: account, epoch: epoch) == nil,
              try PendingAttachmentRemovalStorage().read(account: account, epoch: epoch) == nil,
              try AppAttestKeyReferenceStorage(namespace: "dev.ouchi.review.closure").pendingClosure(account: account) == nil else { return false }
        let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
        let exports = ManagedExportStorage(root: caches.appendingPathComponent("OuchiManagedExports", isDirectory: true))
        return try exports.files(account: account).isEmpty && exports.files(account: UUID(uuidString: "66666666-6666-4666-8666-666666666666")!).count == 1
    }
    #endif
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
            let fixture=NativeReviewFixture(includeSecondHome:
                Bundle.main.bundleIdentifier == "dev.ouchi.review.storecaptures" &&
                ProcessInfo.processInfo.environment["OUCHI_REVIEW_TWO_HOMES"] == "1",
                simulateOfflineRetry: Bundle.main.bundleIdentifier == "dev.ouchi.review.storecaptures" &&
                ProcessInfo.processInfo.environment["OUCHI_REVIEW_OFFLINE_RETRY"] == "1")
            let client=HouseholdAPI(config:config,transport:{ try await fixture.reply($0) })
            api=client;session=SessionController(api:client,storage:NativeReviewSessionStorage(bytes))
            totpVerificationAPI=TOTPVerificationAPI(config:config,transport:{ try await fixture.reply($0) })
            isolatedDevelopmentEnabled=false;isUIReviewSample=true
            isPurchaseRecoveryUIReviewSample = info["OUCHI_REVIEW_PURCHASE_RECOVERY_UI"] as? String == "YES"
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
            totpVerificationAPI = TOTPVerificationAPI(config: config)
            session = SessionController(api: client, storage: KeychainSessionStorage(service: (Bundle.main.bundleIdentifier ?? "ouchi") + "." + (url.host ?? "")))
        } else { api = nil; session = nil; isolatedDevelopmentEnabled = false }
    }
    /// Explicitly off unless a future reviewed release configuration enables it.
    /// Sample-only entry requires both the DEBUG sample bundle and opt-in.
    var totpVerificationConfigured: Bool {
        #if DEBUG
        if isUIReviewSample, Bundle.main.bundleIdentifier?.hasPrefix("dev.ouchi.review.") == true,
           ProcessInfo.processInfo.environment["OUCHI_REVIEW_MFA_UI"] == "1" { return totpVerificationAPI != nil }
        #endif
        return Bundle.main.infoDictionary?["OUCHI_TOTP_VERIFICATION_ENABLED"] as? Bool == true && totpVerificationAPI != nil
    }
    func prepareTOTPVerification() async -> NativeTOTPVerificationContext? {
        guard totpVerificationConfigured, signedIn, !busy, let controller=session, let api=totpVerificationAPI else { return nil }
        let revision=accountBindingRevision
        guard let account=await controller.localAccount(), signedIn, revision==accountBindingRevision else { return nil }
        return .init(id:revision,account:account,api:api,controller:controller)
    }
    func finishTOTPVerification(_ context: NativeTOTPVerificationContext) {
        guard signedIn, context.id==accountBindingRevision else { return }
        accountBindingRevision=UUID()
        message="本人確認が完了しました。引き継ぎ・退会は送信していません。記録や元の依頼の結果を確認してください。"
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
            let binding = try await configuredAttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).binding(token: credentials.access_token)
            guard !Task.isCancelled, expected == generation, home == homeID, binding.account == credentials.user.id, let storage = pendingAttachmentStorage else { return false }
            let pending = try PendingAttachment(account: binding.account, epoch: binding.epoch, product: product, id: attachment, bytes: bytes, mime: mime)
            if let existing = try storage.read(account: binding.account, epoch: binding.epoch) {
                guard existing.id == attachment, existing.product == product, existing.bytes == bytes, existing.mime == mime else { throw CloudError.invalidInput }
            }
            try Task.checkCancellation()
            try storage.write(pending)
            try await configuredAttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).upload(product: product, attachment: attachment, bytes: bytes, mime: mime, token: credentials.access_token, confirmed: confirmed, expectedEpoch: binding.epoch)
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
            let binding = try await configuredAttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).binding(token: credentials.access_token)
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
            let usage = try await configuredAttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).usage(token: credentials.access_token)
            guard expected == generation else { return nil }
            return usage
        } catch {
            if expected == generation { message = "保存容量を確認できませんでした。" }
            return nil
        }
    }
    func pageDevelopmentAttachments(product: UUID, after: UUID? = nil, scope: AttachmentAPI.Scope = .personal, pending: Bool = false) async -> DevelopmentAttachmentAPI.AttachmentPage? {
        guard attachmentServiceConfigured, let session,
              household?.products(in: homeID).contains(where: { $0.id == product.uuidString.lowercased() || $0.id == product.uuidString }) == true else { return nil }
        let expected = generation, home = homeID
        do {
            let credentials = try await session.credentials()
            let items = try await configuredAttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).page(product: product, after: after, token: credentials.access_token, scope: scope, pending: pending)
            guard expected == generation, home == homeID else { return nil }
            return items
        } catch {
            if expected == generation, home == homeID { message = "添付一覧を取得できませんでした。通信と住まいへのアクセスを確認してください。" }
            return nil
        }
    }
    func exportDevelopmentAttachment(_ attachment: UUID, scope: AttachmentAPI.Scope = .personal) async {
        guard attachmentServiceConfigured, !busy, let session else { return }
        attachmentExportGeneration += 1
        let exportGeneration = attachmentExportGeneration
        busy = true; message = nil
        let expected = generation
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            let file = try await configuredAttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).download(attachment: attachment, token: credentials.access_token, scope: scope)
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
            let binding = try await configuredAttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).binding(token: credentials.access_token)
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
            let binding = try await configuredAttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).binding(token: credentials.access_token)
            guard !Task.isCancelled, expected == generation, home == homeID, binding.account == credentials.user.id,
                  let storage = pendingRemovalStorage else { return false }
            let pending = try PendingAttachmentRemoval(account: binding.account, epoch: binding.epoch, product: product, id: attachment)
            if let existing = try storage.read(account: binding.account, epoch: binding.epoch) {
                guard existing.id == attachment, existing.product == product else { throw CloudError.invalidInput }
            } else {
                guard household?.products(in: homeID).contains(where: { $0.id.lowercased() == product.uuidString.lowercased() }) == true else { throw CloudError.invalidInput }
            }
            try storage.write(pending)
            try await configuredAttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured).remove(attachment: attachment, token: credentials.access_token, confirmed: true, expectedEpoch: binding.epoch)
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
    func removeHouseholdAttachment(_ attachment: UUID, product: UUID, confirmed: Bool) async -> Bool {
        guard attachmentServiceConfigured, confirmed, !busy, let session,
              household?.products(in: homeID).contains(where: { $0.id.lowercased() == product.uuidString.lowercased() }) == true else { return false }
        let expected = generation, home = homeID, revision = accountBindingRevision
        busy = true; message = nil
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            let api = configuredAttachmentAPI(isolatedDevelopment: developmentLifecycleConfigured)
            let binding = try await api.binding(token: credentials.access_token)
            guard !Task.isCancelled, expected == generation, home == homeID, revision == accountBindingRevision,
                  binding.account == credentials.user.id else { return false }
            try await api.remove(attachment: attachment, token: credentials.access_token, confirmed: true, expectedEpoch: binding.epoch, scope: .household)
            let latest = try await api.binding(token: credentials.access_token)
            guard !Task.isCancelled, expected == generation, home == homeID, revision == accountBindingRevision,
                  latest.account == binding.account, latest.epoch == binding.epoch else { return false }
            clearDevelopmentAttachmentExport(); message = "家族で引き継いだファイルの削除を確認しました。"
            return true
        } catch {
            if expected == generation, home == homeID, revision == accountBindingRevision { message = "削除完了を確認できません。家族共有の削除確認待ちから、同じファイルを再確認してください。" }
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
        if isUIReviewSample, Bundle.main.bundleIdentifier == "dev.ouchi.review.storecaptures" || (Bundle.main.bundleIdentifier == "dev.ouchi.review.closure" && ProcessInfo.processInfo.environment["OUCHI_REVIEW_MFA_UI"] == "1") {
            // Capture-only fixture loading does not depend on simulator notification daemons.
            // api/session here are the in-memory sample objects, never live credentials.
            guard !busy, let session, let api else { return }
            busy = true
            defer { busy = false }
            do {
                guard try await session.restore() else { throw CloudError.authenticationRequired }
                let credentials = try await session.credentials()
                let value = try await api.load(token: credentials.access_token)
                try Task.checkCancellation()
                snapshotAccount = credentials.user.id
                accountEmail = credentials.user.email
                household = value
                homeID = value.homes.first?.id ?? ""
                signedIn = true
                let directory = URL.documentsDirectory
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let tab = ProcessInfo.processInfo.environment["OUCHI_REVIEW_CAPTURE_TAB"] ?? "0"
                try Data(tab.utf8).write(to: directory.appendingPathComponent("OuchiCaptureReady.txt"), options: .atomic)
            } catch { message = "撮影用のサンプルを読み込めませんでした。" }
            return
        }
        #endif
        guard !busy else { return }
        busy = true
        accountBindingRevision = UUID()
        let expected = generation
        var ownsBusy = true
        defer { if ownsBusy, expected == generation { busy = false } }
        let notificationsReset = await reminders.reset(clearPreference: false)
        guard expected == generation else { return }
        if !notificationsReset {
            message = "端末の通知を確認できませんでした。ログインは続けられます。通知の設定は後で確認してください。"
        }
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
                // Hand the reservation to reload synchronously before its first
                // suspension; this restore must not later clear another task's busy.
                ownsBusy = false; busy = false
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
    /// Restart fallback: no coordinator may exist when a retained restore is
    /// present. Only a pending proof or an existing closure enters this path.
    private func closeRestartedRestoreForLogout(account: UUID) async throws -> Bool {
        guard let bundle = Bundle.main.bundleIdentifier,
              let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { throw CloudError.unavailable }
        let restore = PendingRestoreStorage(root: support.appendingPathComponent("OuchiPendingRestore", isDirectory: true), keyProvider: { _, _ in throw CloudError.unavailable })
        let references = try AppAttestKeyReferenceStorage(namespace: bundle)
        let present = try await restore.hasPendingRecords(account: account)
        if !present {
            let folder = support.appendingPathComponent("OuchiPendingRestore",isDirectory:true).appendingPathComponent(account.uuidString.lowercased(),isDirectory:true)
            guard FileManager.default.fileExists(atPath:folder.path), try references.pendingClosure(account:account) != nil else { return false }
        }
        let pending = AppAttestPendingRegistrationStorage(root: support.appendingPathComponent("OuchiAppAttestPendingRegistration", isDirectory: true), keyProvider: { _, _ in throw CloudError.unavailable })
        let lease = try await pending.acquireMutationLease(); defer { lease.release() }
        let revision = accountBindingRevision
        let stillBound = { [self] in signedIn && busy && snapshotAccount == account && accountBindingRevision == revision }
        let result = await eraseAppAttestLocalRegistration(account:account,stillBound:stillBound,
            prepareClosure:{
                let now = Int64(Date().timeIntervalSince1970 * 1000), retention:Int64 = 7_776_000_000
                guard now > 0, now <= 9_007_199_254_740_991 - retention else { throw CloudError.invalidInput }
                try references.beginClosure(AppAttestAccountClosure(accountID:account,requestID:UUID(),createdAtMilliseconds:now,retainUntilMilliseconds:now+retention))
            },
            erasePendingProofs:{ try await pending.eraseAccount(account); try await restore.eraseAccount(account) },
            eraseEncryptionKeys:{ try references.erase(account:account); try AppAttestEncryptionKeyStorage(namespace:bundle).erase(account:account) })
        guard result == .complete, stillBound() else { throw CloudError.unavailable }
        return true
    }
    func signOut() async {
        guard !busy else { return }
        busy = true; message = nil
        defer { busy = false }
        var restoreClosurePrepared = false
        if let coordinator = appAttestRegistrationCoordinator, let account = snapshotAccount {
            do { try await coordinator.closeAccount(account: account) }
            catch {
                message = "端末登録の終了処理が完了していません。通信と端末のロックを確認して、再度ログアウトしてください。"
                return
            }
        }
        if appAttestRegistrationCoordinator == nil, let account = snapshotAccount {
            do { restoreClosurePrepared = try await closeRestartedRestoreForLogout(account:account) }
            catch { message = "復元情報の終了処理を確認できませんでした。再度ログアウトしてください。"; return }
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
                } else if restoreClosurePrepared {
                    do {
                        guard let bundle = Bundle.main.bundleIdentifier,
                              let support = FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask).first else { throw CloudError.unavailable }
                        let pending = AppAttestPendingRegistrationStorage(root:support.appendingPathComponent("OuchiAppAttestPendingRegistration",isDirectory:true),keyProvider:{ _,_ in throw CloudError.unavailable })
                        try await AppAttestKeyReferenceStorage(namespace:bundle).completeLocalClosure(confirmation:confirmation,session:session,pending:pending,
                            encryptionKeys:AppAttestEncryptionKeyStorage(namespace:bundle),eraseAdditionalPending:{ try await Self.erasePendingRestore(account:$0) })
                    } catch { registrationCleanupFailed = true }
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
    // Prepared read/restore entry. This flag never enables new sales or rights.
    var releasePurchaseRecoveryConfigured: Bool {
        releasePurchaseEnvironment != nil
    }
    var releasePurchaseEnvironment: BillingEnvironment? {
        #if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
        if let releaseFixtureBilling { return releaseFixtureBilling.environment }
        #endif
        guard api != nil, !isUIReviewSample,
              Bundle.main.infoDictionary?["OUCHI_RELEASE_PURCHASE_RECOVERY_ENABLED"] as? Bool == true,
              let value = Bundle.main.infoDictionary?["OUCHI_RELEASE_PURCHASE_ENVIRONMENT"] as? String else { return nil }
        return BillingEnvironment(rawValue: value)
    }
    // Explicit rollout gates, separate from read/restore and verified paid rights.
    var releasePurchaseDisclosureLinks: PurchaseDisclosureLinks? {
        let info = Bundle.main.infoDictionary ?? [:]
        return PurchaseDisclosureLinks(
            reviewed: info["OUCHI_PURCHASE_DISCLOSURES_REVIEWED"] as? Bool == true,
            terms: info["OUCHI_TERMS_URL"] as? String ?? "",
            privacy: info["OUCHI_PRIVACY_URL"] as? String ?? "",
            support: info["OUCHI_SUPPORT_URL"] as? String ?? "")
    }
    var releaseSubscriptionDisclosure: SubscriptionOfferDisclosure? {
        #if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
        if releaseFixtureBilling != nil { return releaseFixtureOffer }
        #endif
        guard let environment = releasePurchaseEnvironment,
              formalReportEnvironment == environment, formalReminderEnvironment == environment,
              !developmentLifecycleConfigured,
              Bundle.main.infoDictionary?["OUCHI_ATTACHMENTS_ENABLED"] as? Bool == true else { return nil }
        let info = Bundle.main.infoDictionary ?? [:]
        return SubscriptionOfferDisclosure(
            reviewed: info["OUCHI_SUBSCRIPTION_OFFER_REVIEWED"] as? Bool == true,
            maximumBytes: (info["OUCHI_ATTACHMENT_MAXIMUM_BYTES"] as? NSNumber)?.int64Value ?? 0,
            maximumFiles: (info["OUCHI_ATTACHMENT_MAXIMUM_FILES"] as? NSNumber)?.intValue ?? 0,
            maximumFileBytes: (info["OUCHI_ATTACHMENT_MAXIMUM_FILE_BYTES"] as? NSNumber)?.int64Value ?? 0,
            retention: info["OUCHI_ATTACHMENT_RETENTION_DESCRIPTION"] as? String ?? "")
    }
    func releaseNewPurchaseConfigured(subscription: Bool) -> Bool {
        #if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
        if releaseFixtureBilling != nil { return releaseFixturePurchasesEnabled }
        #endif
        guard releasePurchaseEnvironment != nil, releasePurchaseDisclosureLinks != nil else { return false }
        if subscription && releaseSubscriptionDisclosure == nil { return false }
        let key = subscription ? "OUCHI_RELEASE_SUBSCRIPTIONS_ENABLED" : "OUCHI_RELEASE_TIPS_ENABLED"
        return Bundle.main.infoDictionary?[key] as? Bool == true
    }
    func releasePurchaseSalesAvailable(subscription: Bool) -> Bool {
        guard releaseNewPurchaseConfigured(subscription: subscription), signedIn,
              let environment = releasePurchaseEnvironment, let rights = releaseEntitlement,
              rights.environment == environment.rawValue,
              rights.purchaseAccountToken == releasePurchaseEpoch,
              releasePurchaseEpoch != nil, let account = releaseBillingAccount, account == snapshotAccount else { return false }
        if subscription, let offer = releaseSubscriptionDisclosure {
            guard let usage = releaseAttachmentCapacity, offer.matchesCapacity(usage) else { return false }
        }
        return environment == .sandbox || rights.salesEnabled
    }
    func loadReleasePurchaseProducts() async {
        guard !busy, signedIn, releaseEntitlement != nil,
              releaseNewPurchaseConfigured(subscription: false) || releaseNewPurchaseConfigured(subscription: true) else { return }
        busy = true
        let expected = generation, revision = accountBindingRevision
        defer { if expected == generation { busy = false } }
        if let offer = releaseSubscriptionDisclosure {
            releaseAttachmentCapacity = nil
            do {
                guard let session, let account = releaseBillingAccount else { throw CloudError.authenticationRequired }
                let credentials = try await session.credentials()
                guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                      credentials.user.id == account, snapshotAccount == account else { throw CancellationError() }
                let usage = try await releaseAttachmentAPI().usage(token: credentials.access_token)
                let current = try await session.credentials()
                guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                      current.user.id == account, current.access_token == credentials.access_token else { throw CancellationError() }
                if offer.matchesCapacity(usage) { releaseAttachmentCapacity = usage }
                else { message = "保存サービスの容量とプランの表示条件が一致しません。新しい契約は開始できません。" }
            } catch {
                if !Task.isCancelled, expected == generation, revision == accountBindingRevision {
                    message = "保存サービスの容量を確認できません。通信を確認して再取得してください。"
                }
            }
        }
        guard !Task.isCancelled, expected == generation, revision == accountBindingRevision else { return }
        do { try await releasePurchases.load() }
        catch {
            if !Task.isCancelled, expected == generation, revision == accountBindingRevision {
                message = "ストアの価格を取得できません。通信を確認し、再度お試しください。"
            }
        }
    }
    func purchaseReleaseProduct(_ product: Product) async {
        let subscription = product.type == .autoRenewable
        let valid = subscription
            ? ["ouchi.premium.monthly", "ouchi.premium.annual"].contains(product.id)
            : product.type == .consumable && ["ouchi.tip.small", "ouchi.tip.medium", "ouchi.tip.large"].contains(product.id)
        guard valid, !busy, signedIn, releaseNewPurchaseConfigured(subscription: subscription),
              let environment = releasePurchaseEnvironment, let session,
              let epoch = releasePurchaseEpoch, let account = releaseBillingAccount,
              releaseEntitlement != nil, releasePurchases.persist != nil else { return }
        busy = true; message = nil
        let expected = generation, revision = accountBindingRevision
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                  credentials.user.id == account, snapshotAccount == account else { throw CancellationError() }
            // Fresh server rights/permission check before an Apple purchase prompt.
            let rights = try await releaseBillingAPI(environment: environment).entitlement(token: credentials.access_token)
            let current = try await session.credentials()
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                  current.user.id == account, current.access_token == credentials.access_token,
                  rights.environment == environment.rawValue, rights.purchaseAccountToken == epoch,
                  releasePurchaseEpoch == epoch else { throw CancellationError() }
            releaseEntitlement = rights
            guard environment == .sandbox || rights.salesEnabled else {
                message = "新しい購入は現在受け付けていません。既存の記録や購入の復元は利用できます。"
                return
            }
            if subscription && rights.premiumIsCurrent(expectedEnvironment: environment) {
                message = "有効な契約があります。新しく購入せず、契約の確認・復元をご利用ください。"
                return
            }
            if subscription, let offer = releaseSubscriptionDisclosure {
                // Re-read capacity after current rights, immediately before a
                // purchase prompt; a cached quote is not permission to charge.
                releaseAttachmentCapacity = nil
                let usage = try await releaseAttachmentAPI().usage(token: current.access_token)
                let afterCapacity = try await session.credentials()
                guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                      afterCapacity.user.id == account, afterCapacity.access_token == current.access_token,
                      releasePurchaseEpoch == epoch else { throw CancellationError() }
                guard offer.matchesCapacity(usage) else {
                    message = "保存サービスの容量とプランの表示条件が一致しません。新しい契約は開始できません。"
                    return
                }
                releaseAttachmentCapacity = usage
            }
            let outcome = try await releasePurchases.purchase(product, account: epoch)
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                  releaseBillingAccount == account, releasePurchaseEpoch == epoch else { return }
            switch outcome {
            case .saved:
                if subscription {
                    message = releaseEntitlement?.premiumIsCurrent(expectedEnvironment: environment) == true
                        ? "購入と有料プランの利用権を確認しました。"
                        : "購入の保存を確認しました。現在の利用権は契約の確認から再確認してください。"
                } else { message = "応援ありがとうございます。チップの保存を確認しました。機能の変更や自動更新はありません。" }
            case .pending: message = "購入は保留中です。承認後の結果を確認します。"
            case .cancelled: break
            }
            if environment == .sandbox, outcome != .cancelled {
                message = "購入のテスト環境です。実際の請求はありません。\n" + (message ?? "")
            }
        } catch PurchaseManager.PurchaseError.subscriptionAlreadyActive {
            if expected == generation, revision == accountBindingRevision { message = "Appleで有効な契約が見つかりました。新しく購入せず、購入の復元から確認してください。" }
        } catch PurchaseManager.PurchaseError.subscriptionBoundElsewhere {
            if expected == generation, revision == accountBindingRevision { message = "別のおうちメンテアカウントに紐づく契約が見つかりました。購入時のアカウントで確認してください。" }
        } catch PurchaseManager.PurchaseError.purchaseInProgress {
            if expected == generation, revision == accountBindingRevision { message = "購入処理が進行中です。結果が出るまでお待ちください。" }
        } catch PurchaseManager.PurchaseError.purchaseNotActive {
            if expected == generation, revision == accountBindingRevision { message = "返金済みか期限切れの購入です。有効な契約として扱っていません。購入の復元から確認してください。" }
        } catch {
            if !Task.isCancelled, expected == generation, revision == accountBindingRevision {
                releaseEntitlement = nil; releasePurchases.markRetryNeeded()
                message = "購入を完了できませんでした。通信とログイン状態を確認してください。保存できていない取引は再確認できます。"
            }
        }
    }
    var configuredClosureReviewAPI: AccountClosureReviewAPI {
        AccountClosureReviewAPI(server: configuredServiceServer, environment: configuredReviewEnvironment)
    }
    var configuredHomeManagementAPI: HomeManagementAPI {
        HomeManagementAPI(server: configuredServiceServer, environment: configuredReviewEnvironment)
    }
    private var configuredServiceServer: BillingServer {
        Bundle.main.infoDictionary?["OUCHI_SANDBOX_REVIEW_SERVER"] as? Bool == true ? .sandboxReview : .production
    }
    private var configuredReviewEnvironment: BillingEnvironment {
        let raw = Bundle.main.infoDictionary?["OUCHI_RELEASE_PURCHASE_ENVIRONMENT"] as? String
        return raw.flatMap(BillingEnvironment.init(rawValue:)) ?? .production
    }
    private func configuredAttachmentAPI(isolatedDevelopment: Bool = false) -> AttachmentAPI {
        let raw = Bundle.main.infoDictionary?["OUCHI_RELEASE_PURCHASE_ENVIRONMENT"] as? String
        let environment = raw.flatMap(BillingEnvironment.init(rawValue:)) ?? .production
        return AttachmentAPI(server: configuredServiceServer, environment: environment,
                             isolatedDevelopment: isolatedDevelopment)
    }
    private func configuredEnrollmentAPI() -> AccountEnrollmentAPI {
        let review = Bundle.main.infoDictionary?["OUCHI_SANDBOX_REVIEW_SERVER"] as? Bool == true
        let raw = Bundle.main.infoDictionary?["OUCHI_RELEASE_PURCHASE_ENVIRONMENT"] as? String
        let environment = raw.flatMap(BillingEnvironment.init(rawValue:)) ?? .production
        return AccountEnrollmentAPI(server: review ? .sandboxReview : .production, environment: environment)
    }
    private func configuredBillingAPI(environment: BillingEnvironment = .sandbox,
                                      isolatedDevelopment: Bool = false) -> BillingAPI {
        let review = Bundle.main.object(forInfoDictionaryKey: "OUCHI_SANDBOX_REVIEW_SERVER") as? Bool == true
        return BillingAPI(environment: environment, server: review ? .sandboxReview : .production,
                          isolatedDevelopment: isolatedDevelopment)
    }
    private func releaseBillingAPI(environment: BillingEnvironment) -> BillingAPI {
        #if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
        if let releaseFixtureBilling { return releaseFixtureBilling }
        #endif
        return configuredBillingAPI(environment: environment)
    }
    private func releaseAttachmentAPI() -> AttachmentAPI {
        #if DEBUG && OUCHI_LOCAL_STOREKIT_TESTS && os(macOS)
        if let releaseFixtureAttachments { return releaseFixtureAttachments }
        #endif
        return configuredAttachmentAPI()
    }
    private func clearReleaseBilling() {
        releasePurchases.stopObserving(); releasePurchases.persist = nil
        releaseEntitlement = nil; releaseAttachmentCapacity = nil; releasePurchaseEpoch = nil; releaseBillingAccount = nil
    }
    func loadReleasePurchaseState(notifyFailure: Bool = true) async {
        guard !busy, signedIn, let environment = releasePurchaseEnvironment, let session else { return }
        busy = true
        let expected = generation, revision = accountBindingRevision
        clearReleaseBilling()
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                  snapshotAccount == credentials.user.id else { return }
            let billing = releaseBillingAPI(environment: environment)
            let rights = try await billing.entitlement(token: credentials.access_token)
            let current = try await session.credentials()
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                  current.user.id == credentials.user.id, current.access_token == credentials.access_token,
                  rights.environment == environment.rawValue,
                  let epoch = rights.purchaseAccountToken, epoch != credentials.user.id else { return }
            clearReleaseBilling()
            releaseBillingAccount = credentials.user.id; releasePurchaseEpoch = epoch; releaseEntitlement = rights
            releasePurchases.persist = { [weak self] signed in
                guard let self, !Task.isCancelled, self.generation == expected,
                      self.accountBindingRevision == revision, self.signedIn,
                      self.releasePurchaseEpoch == epoch, self.releaseBillingAccount == credentials.user.id else { throw CancellationError() }
                let live = try await session.credentials()
                guard live.user.id == credentials.user.id, self.generation == expected,
                      self.accountBindingRevision == revision else { throw CancellationError() }
                try await billing.submit(signedTransaction: signed, token: live.access_token)
                let refreshed = try await billing.entitlement(token: live.access_token)
                let after = try await session.credentials()
                guard !Task.isCancelled, self.generation == expected, self.accountBindingRevision == revision,
                      self.signedIn, after.user.id == credentials.user.id,
                      after.access_token == live.access_token, refreshed.purchaseAccountToken == epoch,
                      refreshed.environment == environment.rawValue,
                      self.releasePurchaseEpoch == epoch else { throw CancellationError() }
                self.releaseEntitlement = refreshed
            }
            releasePurchases.startObserving(account: epoch)
            try await releasePurchases.observeUnfinished(account: epoch)
        } catch {
            if !Task.isCancelled, expected == generation, revision == accountBindingRevision {
                releaseEntitlement = nil; releasePurchases.markRetryNeeded()
                if notifyFailure { message = "契約状態を確認できません。通信とログイン状態を確認し、もう一度お試しください。" }
            }
        }
    }
    func restoreReleasePurchases() async {
        guard !busy, signedIn, let environment = releasePurchaseEnvironment, let session,
              let epoch = releasePurchaseEpoch, releaseEntitlement != nil else { return }
        busy = true; message = nil
        let expected = generation, revision = accountBindingRevision, account = releaseBillingAccount
        defer { if expected == generation { busy = false } }
        do {
            let credentials = try await session.credentials()
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                  credentials.user.id == account, snapshotAccount == account else { return }
            let result = try await releasePurchases.restore(account: epoch)
            let rights = try await releaseBillingAPI(environment: environment).entitlement(token: credentials.access_token)
            let current = try await session.credentials()
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision,
                  current.user.id == account, current.access_token == credentials.access_token,
                  rights.purchaseAccountToken == epoch, releasePurchaseEpoch == epoch else { return }
            releaseEntitlement = rights
            message = result.otherAccountSubscriptionFound
                ? "別のおうちメンテアカウントに紐づく購入が見つかりました。このアカウントには移していません。購入時のアカウントで確認してください。"
                : "Appleの購入履歴と現在の利用権を確認しました。新しい購入は行っていません。"
        } catch {
            if !Task.isCancelled, expected == generation, revision == accountBindingRevision {
                releaseEntitlement = nil; releasePurchases.markRetryNeeded()
                message = "購入を復元できません。保存できていない取引は再確認できます。時間をおいてお試しください。"
            }
        }
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
                let rights = try await configuredBillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
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
    @Published private(set) var sandboxRestoreOutcome: SandboxRestoreFlow.Outcome?
    @Published private(set) var sandboxRestoreNeedsAttention = false
    var sandboxRestoreConfigured: Bool {
        #if DEBUG
        guard sandboxBillingConfigured, !isUIReviewSample else { return false }
        return (try? SandboxRestoreFlow.configuration(info: Bundle.main.infoDictionary ?? [:],
            bundleIdentifier: Bundle.main.bundleIdentifier, purchaseEnvironment: purchases.environment,
            isolatedDevelopment: isolatedDevelopmentEnabled)) != nil
        #else
        return false
        #endif
    }
    private func sandboxRestoreStillBound(account: UUID, epoch: UUID?, expected: Int, revision: UUID) -> Bool {
        signedIn && snapshotAccount == account && billingAccount == account &&
        (epoch == nil || purchaseAccount == epoch) && generation == expected && accountBindingRevision == revision
    }
    private func makeSandboxRestoreFlow(expected: Int, revision: UUID) async throws -> (AppAttestRegistrationSession, SandboxRestoreFlow) {
        guard sandboxRestoreConfigured, let session, let account = snapshotAccount,
              let bundle = Bundle.main.bundleIdentifier,
              let configuration = try SandboxRestoreFlow.configuration(info: Bundle.main.infoDictionary ?? [:],
                bundleIdentifier: bundle, purchaseEnvironment: purchases.environment,
                isolatedDevelopment: isolatedDevelopmentEnabled),
              sandboxRestoreStillBound(account: account, epoch: nil, expected: expected, revision: revision) else { throw CloudError.unavailable }
        let provider = AppAttestEnrollmentContextProvider(session: session, enrollment: configuredEnrollmentAPI(), configuration: configuration)
        let currentContext: AppAttestRegistrationCoordinator.CurrentContext = { [weak self] in
            guard let self, await self.sandboxRestoreStillBound(account: account, epoch: nil, expected: expected, revision: revision),
                  let context = try? await provider.load(expectedAccount: account),
                  await self.sandboxRestoreStillBound(account: account, epoch: context.epochID, expected: expected, revision: revision) else { return nil }
            return context
        }
        let context = try await provider.load(expectedAccount: account)
        guard sandboxRestoreStillBound(account: account, epoch: context.epochID, expected: expected, revision: revision) else { throw CloudError.authenticationRequired }
        let coordinator = try makeAppAttestCoordinator(configuration: configuration, bundle: bundle, current: currentContext)
        let registration = try await coordinator.register(captured: context)
        let scope: AppAttestRegistrationScope
        switch registration {
        case .recordedReference(let reference): scope = reference.scope
        case .newlyConfirmed(let receipt): scope = receipt.scope
        }
        let references = try AppAttestKeyReferenceStorage(namespace: bundle)
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        guard try references.pendingClosure(account: account) == nil,
              let confirmed = try references.confirmed(account: account, epoch: context.epochID, nowMilliseconds: now),
              confirmed.scope == scope, scope == context.session(keyID: confirmed.keyID).scope else { throw CloudError.authenticationRequired }
        let captured = context.session(keyID: confirmed.keyID)
        let currentSession: AppAttestRegistrationAPI.CurrentSession = { [weak self] in
            guard let self, await self.sandboxRestoreStillBound(account: account, epoch: scope.epochID, expected: expected, revision: revision),
                  let latest = try? await provider.load(expectedAccount: account),
                  await self.sandboxRestoreStillBound(account: account, epoch: scope.epochID, expected: expected, revision: revision) else { return nil }
            do {
                guard try references.pendingClosure(account: account) == nil,
                      let key = try references.confirmed(account: account, epoch: scope.epochID,
                        nowMilliseconds: Int64(Date().timeIntervalSince1970 * 1000)),
                      key.scope == scope, latest.session(keyID: key.keyID).scope == scope else { return nil }
                return latest.session(keyID: key.keyID)
            } catch { return nil }
        }
        let keys = try AppAttestEncryptionKeyStorage(namespace: bundle)
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let storage = PendingRestoreStorage(root: support.appendingPathComponent("OuchiPendingRestore", isDirectory: true), keyProvider: { account, epoch in
            guard account == scope.userID, epoch == scope.epochID,
                  try references.pendingClosure(account: account) == nil,
                  let reference = try references.confirmed(account: account, epoch: epoch,
                    nowMilliseconds: Int64(Date().timeIntervalSince1970 * 1000)), reference.scope == scope,
                  let key = try keys.read(account: account, epoch: epoch) else { throw CloudError.authenticationRequired }
            return key
        })
        let flow = SandboxRestoreFlow(server: configuredServiceServer, environment: purchases.environment, storage: storage, currentSession: currentSession)
        try await RestoreCommitAPI(server: configuredServiceServer, environment: purchases.environment, currentSession: currentSession).validate(captured)
        return (captured, flow)
    }
    private enum SandboxRestoreAction { case start, refresh, cancelUnreserved }
    func startSandboxRestore() async { await runSandboxRestore(.start) }
    func refreshSandboxRestore() async { await runSandboxRestore(.refresh) }
    func cancelUnreservedSandboxRestore() async { await runSandboxRestore(.cancelUnreserved) }
    private func runSandboxRestore(_ action: SandboxRestoreAction) async {
        guard !busy, sandboxRestoreConfigured, signedIn else { return }
        busy = true; message = nil
        let expected = generation, revision = accountBindingRevision
        defer { if expected == generation, revision == accountBindingRevision { busy = false } }
        do {
            let (captured, flow) = try await makeSandboxRestoreFlow(expected: expected, revision: revision)
            let result: SandboxRestoreFlow.Outcome
            switch action {
            case .start:
                result = try await flow.startOrResume(captured: captured, producer: { [weak self] identity, requestID in
                    guard let self else { throw CloudError.unavailable }
                    return try await self.prepareSandboxRestoreProof(identity: identity, requestID: requestID,
                        expected: expected, revision: revision)
                })
            case .refresh: result = try await flow.refresh(captured: captured)
            case .cancelUnreserved: result = try await flow.cancelUnreserved(captured: captured)
            }
            guard !Task.isCancelled, sandboxRestoreStillBound(account: captured.scope.userID,
                epoch: captured.scope.epochID, expected: expected, revision: revision) else { return }
            // Process completion is not current premium: only the existing
            // authenticated verified-ledger API may refresh displayed rights.
            if result == .complete {
                let rights = try await configuredBillingAPI(isolatedDevelopment: false).entitlement(token: captured.bearer)
                guard !Task.isCancelled, sandboxRestoreStillBound(account: captured.scope.userID,
                    epoch: captured.scope.epochID, expected: expected, revision: revision),
                    rights.purchaseAccountToken == captured.scope.epochID else { throw CloudError.authenticationRequired }
                sandboxEntitlement = rights
            }
            sandboxRestoreOutcome = result; sandboxRestoreNeedsAttention = false
            switch result {
            case .absent: message = "保存された復元はありません。"
            case .pending: message = "復元を受け付けました。完了するまで新しい購入をせず、状況をご確認ください。"
            case .complete: message = "復元の処理と現在の契約状態を確認しました。利用できる機能は現在の契約状態に従います。"
            case .cancelled: message = "未処理の復元を取り消しました。「復元を確認する」から、改めて確認できます。契約は解約していません。"
            }
        } catch PurchaseManager.PurchaseError.restoreNotFound {
            if expected == generation, revision == accountBindingRevision {
                sandboxRestoreNeedsAttention = false; sandboxRestoreOutcome = .absent
                message = "この端末で復元できる別の登録に紐づく有効なテスト契約は見つかりませんでした。"
            }
        } catch {
            guard !Task.isCancelled, expected == generation, revision == accountBindingRevision else { return }
            sandboxRestoreNeedsAttention = true
            message = "復元の状態を確認できません。保存中の情報は残しています。状況を再確認してください。改善しない場合はサポートへお問い合わせください。"
        }
    }
    private func prepareSandboxRestoreProof(identity: AppAttestRegistrationSession, requestID: UUID,
                                            expected: Int, revision: UUID) async throws -> PendingRestore {
        let scope = identity.scope
        guard sandboxRestoreStillBound(account: scope.userID, epoch: scope.epochID, expected: expected, revision: revision) else { throw CloudError.authenticationRequired }
        let original = try await purchases.sandboxRestoreOriginalTransactionID(account: scope.epochID)
        // Fresh server enrollment plus the existing confirmed key only. The
        // challenge API validates this exact captured identity before/after HTTP.
        guard let session, let configuration = try AppAttestRegistrationConfiguration.parse(
            info: Bundle.main.infoDictionary ?? [:], bundleIdentifier: Bundle.main.bundleIdentifier) else { throw CloudError.unavailable }
        let provider = AppAttestEnrollmentContextProvider(session: session, enrollment: configuredEnrollmentAPI(), configuration: configuration)
        let current: AppAttestRegistrationAPI.CurrentSession = { [weak self] in
            guard let self, await self.sandboxRestoreStillBound(account: scope.userID, epoch: scope.epochID, expected: expected, revision: revision),
                  let context = try? await provider.load(expectedAccount: scope.userID),
                  context.session(keyID: scope.keyID).scope == scope,
                  await self.sandboxRestoreStillBound(account: scope.userID, epoch: scope.epochID, expected: expected, revision: revision) else { return nil }
            return context.session(keyID: scope.keyID)
        }
        let api = RestoreChallengeAPI(server: configuredServiceServer, environment: purchases.environment, currentSession: current)
        let (evidence, challenge, assertion) = try await purchases.sandboxRestoreAssertion(captured: identity,
            originalTransactionID: original, requestID: requestID, api: api)
        try await api.validate(identity)
        guard sandboxRestoreStillBound(account: scope.userID, epoch: scope.epochID, expected: expected, revision: revision) else { throw CloudError.authenticationRequired }
        return try PendingRestore(scope: scope, challenge: challenge, signedAppTransaction: evidence.signedAppTransaction,
            signedTransaction: evidence.signedTransaction, assertion: assertion, nowMilliseconds: Int64(Date().timeIntervalSince1970 * 1000))
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
            let rights = try await configuredBillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
            guard expected == generation else { return }
            guard rights.purchaseAccountToken == purchaseAccount else { throw CloudError.malformedResponse }
            sandboxEntitlement = rights
            do {
                let accepted = try await configuredBillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).requestRecovery(token: credentials.access_token)
                guard expected == generation else { return }
                if accepted == .accepted {
                    let progress = try await configuredBillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).recoveryStatus(token: credentials.access_token)
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
            let progress = try await configuredBillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).recoveryStatus(token: credentials.access_token)
            guard expected == generation else { return }
            if progress.state == .complete {
                let rights = try await configuredBillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
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
                let rights = try await configuredBillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
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
            let rights = try await configuredBillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
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
    private static func erasePendingRestore(account: UUID) async throws {
        guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { throw CloudError.unavailable }
        let pending = PendingRestoreStorage(root: support.appendingPathComponent("OuchiPendingRestore", isDirectory: true),
            keyProvider: { _, _ in throw CloudError.unavailable })
        // Erasure never decrypts proof or reads the encryption key. A competing
        // restore operation refuses cleanup before registration keys are erased.
        try await pending.eraseAccount(account)
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
        let coordinator = try AppAttestRegistrationCoordinator(server: configuredServiceServer, environment: configuredReviewEnvironment, currentContext: current, device: AppAttestDeviceService(), encryptionKeys: keys,
            references: references, pending: pending, retentionMilliseconds: configuration.referenceRetentionMilliseconds,
            eraseAdditionalPending: { try await Self.erasePendingRestore(account: $0) })
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
            let provider = AppAttestEnrollmentContextProvider(session: session, enrollment: configuredEnrollmentAPI(), configuration: configuration)
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
            let provider = AppAttestEnrollmentContextProvider(session: session, enrollment: configuredEnrollmentAPI(), configuration: configuration)
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
            let service = configuredEnrollmentAPI()
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
            let billing = configuredBillingAPI(environment: environment)
            let rights = try await billing.entitlement(token: credentials.access_token)
            guard stillBound(), rights.environment == environment.rawValue, let epoch = rights.purchaseAccountToken else { return nil }
            let service = FormalNotificationChannelAPI(environment: environment, server: configuredServiceServer)
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
            let billing = configuredBillingAPI(environment: environment)
            let rights = try await billing.entitlement(token: credentials.access_token)
            guard stillBound(), let epoch = rights.purchaseAccountToken else { return nil }
            let service = FormalReminderSettingsAPI(environment: environment, server: configuredServiceServer)
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
            let billing = configuredBillingAPI(environment: environment)
            let rights = try await billing.entitlement(token: credentials.access_token)
            guard stillBound(), let epoch = rights.purchaseAccountToken,
                  rights.premiumIsCurrent(expectedEnvironment: environment) else {
                if stillBound() { message = "有料プランの利用権を確認できません。" }; return nil
            }
            let result = try await FormalReportAPI(environment: environment, server: configuredServiceServer).load(home: home, epoch: epoch, token: credentials.access_token)
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
            let rights = try await configuredBillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled).entitlement(token: credentials.access_token)
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
        if releasePurchaseRecoveryConfigured { await loadReleasePurchaseState(notifyFailure: false) }
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
        let billing = configuredBillingAPI(isolatedDevelopment: isolatedDevelopmentEnabled)
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
        if expected == generation {
            busy = false
            if signedIn, !showingOfflineSnapshot, household != nil {
                await loadReleasePurchaseState(notifyFailure: false)
            }
        }
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
    private func save(failureHint: String? = nil, _ mutation: (HouseholdAPI, String) async throws -> Void) async -> Bool {
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
                if let failureHint { message = (message ?? "") + failureHint }
                busy = false
            }
            return false
        }
    }

    func deleteProduct(_ product: Appliance) async -> Bool {
        guard product.homeId == homeID,
              household?.products(in: homeID).contains(where: { $0.id == product.id }) == true else { return false }
        return await save(failureHint: "削除できない場合は、製品の写真・保証書で保存済み・家族共有・削除確認待ちのファイルを先に確認してください。") { api, token in try await api.deleteRecord(.product, id: product.id, token: token) }
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
        let success = await save(failureHint: "削除できない場合は、各製品の写真・保証書で保存済み・家族共有・削除確認待ちのファイルを先に確認してください。") { api, token in try await api.deleteRecord(.home, id: id, token: token) }
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
