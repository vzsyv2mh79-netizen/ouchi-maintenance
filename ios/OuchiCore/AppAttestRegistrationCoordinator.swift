import Foundation

public struct AppAttestRegistrationContext: Equatable, Sendable {
    public let userID: UUID, sessionID: UUID, epochID: UUID
    public let appID: String, environment: String, bearer: String
    public init(userID: UUID, sessionID: UUID, epochID: UUID, appID: String, environment: String, bearer: String) {
        self.userID=userID;self.sessionID=sessionID;self.epochID=epochID
        self.appID=appID;self.environment=environment;self.bearer=bearer
    }
    public func session(keyID: String) -> AppAttestRegistrationSession {
        .init(scope:.init(userID:userID,sessionID:sessionID,epochID:epochID,keyID:keyID,appID:appID,environment:environment),bearer:bearer)
    }
}
public enum AppAttestRegistrationPreparation: Equatable, Sendable {
    /// Local metadata only: caller still needs fresh server authorization.
    case recordedReference(AppAttestKeyReference)
    case newlyConfirmed(AppAttestRegistrationReceipt)
}

/// Prepared initial-registration/recovery flow. Not connected to release UI.
/// One shared instance coordinates its registration and local account cleanup;
/// it is not a durable cross-process fence or a purchase entitlement source.
public actor AppAttestRegistrationCoordinator {
    public typealias CurrentContext = @Sendable () async -> AppAttestRegistrationContext?
    private let currentContext: CurrentContext
    private let device: AppAttestDeviceService
    private let encryptionKeys: AppAttestEncryptionKeyStorage
    private let references: AppAttestKeyReferenceStorage
    private let pending: AppAttestPendingRegistrationStorage
    private let transport: HouseholdAPI.Transport?
    private let now: @Sendable () -> Int64
    private let retentionMilliseconds: Int64
    private var activeAccount: UUID?
    private var closingAccounts=Set<UUID>()
    private var completionWaiters:[UUID:[CheckedContinuation<Void,Never>]]=[:]
    public init(currentContext: @escaping CurrentContext, device: AppAttestDeviceService,
                encryptionKeys: AppAttestEncryptionKeyStorage, references: AppAttestKeyReferenceStorage,
                pending: AppAttestPendingRegistrationStorage, retentionMilliseconds: Int64,
                transport: HouseholdAPI.Transport? = nil,
                now: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970*1000) }) throws {
        guard retentionMilliseconds>=300000,retentionMilliseconds<=7_776_000_000 else { throw CloudError.invalidInput }
        self.currentContext=currentContext;self.device=device;self.encryptionKeys=encryptionKeys
        self.references=references;self.pending=pending;self.retentionMilliseconds=retentionMilliseconds
        self.transport=transport;self.now=now
    }
    private func session(keyID: String) async -> AppAttestRegistrationSession? {
        guard let context=await currentContext(), !closingAccounts.contains(context.userID) else { return nil }
        do { guard try references.pendingClosure(account:context.userID)==nil else { return nil } }
        catch { return nil }
        return context.session(keyID:keyID)
    }
    private func api(keyID: String) -> AppAttestRegistrationAPI {
        AppAttestRegistrationAPI(currentSession:{ [weak self] in await self?.session(keyID:keyID) },transport:transport,now:now)
    }
    private func finishRegistration(account: UUID) {
        activeAccount=nil
        let waiters=completionWaiters.removeValue(forKey:account) ?? []
        for waiter in waiters { waiter.resume() }
    }
    public func register(captured: AppAttestRegistrationContext) async throws -> AppAttestRegistrationPreparation {
        guard activeAccount==nil,!closingAccounts.contains(captured.userID) else { throw CloudError.unavailable }
        guard try references.pendingClosure(account:captured.userID)==nil else { throw CloudError.unavailable }
        activeAccount=captured.userID;defer { finishRegistration(account:captured.userID) }
        // Validate identity/JWT binding before a device operation. This dummy key
        // is used only by the local validator, never sent to Apple or the server.
        let placeholder=Data(repeating:0,count:32).base64EncodedString()
        try await api(keyID:placeholder).validate(captured.session(keyID:placeholder))
        guard !closingAccounts.contains(captured.userID) else { throw CloudError.unavailable }
        var reference=try references.generated(account:captured.userID,epoch:captured.epochID,nowMilliseconds:now())
        if let confirmed=try references.confirmed(account:captured.userID,epoch:captured.epochID,nowMilliseconds:now()) {
            guard confirmed.scope==captured.session(keyID:confirmed.keyID).scope else { throw CloudError.authenticationRequired }
            return .recordedReference(confirmed)
        }
        if reference==nil {
            guard device.isSupported,try await !pending.hasPendingRecord(account:captured.userID,epoch:captured.epochID) else { throw CloudError.unavailable }
            try await api(keyID:placeholder).validate(captured.session(keyID:placeholder))
            guard try references.generationIntent(account:captured.userID,epoch:captured.epochID)==nil else { throw CloudError.unavailable }
            let created=now()
            guard created>0,created<=9_007_199_254_740_991-retentionMilliseconds else { throw CloudError.invalidInput }
            let intent=try AppAttestGenerationIntent(context:captured,requestID:UUID(),createdAtMilliseconds:created,retainUntilMilliseconds:created+retentionMilliseconds)
            _ = try encryptionKeys.provision(account:captured.userID,epoch:captured.epochID)
            try references.persistGenerationIntent(intent)
            let key=try await device.generateKey()
            // Do not discard a completed key on cancellation/session change.
            // Cleanup on this actor waits until this record is written or fails.
            let generated=try intent.reference(keyID:key)
            try references.persistCompletedGeneration(generated)
            reference=try references.generated(account:captured.userID,epoch:captured.epochID,nowMilliseconds:now())
        }
        guard let reference,reference.scope==captured.session(keyID:reference.keyID).scope,
              try encryptionKeys.read(account:captured.userID,epoch:captured.epochID) != nil else { throw CloudError.authenticationRequired }
        let capturedSession=captured.session(keyID:reference.keyID),api=api(keyID:reference.keyID)
        try await api.validate(capturedSession)
        if try await pending.read(scope:reference.scope,nowMilliseconds:now())==nil {
            let challenge=try await api.challenge(for:capturedSession,requestID:reference.requestID)
            try await api.validate(capturedSession)
            let proof=try await device.attest(challenge,scope:reference.scope,nowMilliseconds:now())
            // Staging precedes cancellation/closing checks. An expired challenge
            // is refused, leaving the immutable reference for explicit recovery.
            let staged=try AppAttestPendingRegistration(scope:reference.scope,challenge:challenge,attestation:proof,nowMilliseconds:now())
            try await pending.stage(staged,nowMilliseconds:now())
        }
        try await api.validate(capturedSession)
        let recovery=AppAttestRegistrationRecovery(storage:pending,api:api,currentSession:{ [weak self] in await self?.session(keyID:reference.keyID) },references:references,now:now)
        guard let receipt=try await recovery.resume(captured:capturedSession) else { throw CloudError.unavailable }
        return .newlyConfirmed(receipt)
    }
    public func stopAcceptingRegistration(account: UUID) throws {
        guard account != UUID(uuidString:"00000000-0000-0000-0000-000000000000")! else { throw CloudError.invalidInput }
        closingAccounts.insert(account)
    }
    /// Caller must revoke enrollment/session as appropriate and use this SAME
    /// instance. Failed/cancelled cleanup stays closed and can be retried.
    public func closeAccount(account: UUID) async throws {
        try Task.checkCancellation();try stopAcceptingRegistration(account:account)
        let created=now()
        guard created>0,created<=9_007_199_254_740_991-retentionMilliseconds else { throw CloudError.invalidInput }
        try references.beginClosure(AppAttestAccountClosure(accountID:account,requestID:UUID(),createdAtMilliseconds:created,retainUntilMilliseconds:created+retentionMilliseconds))
        if activeAccount==account {
            await withCheckedContinuation { completionWaiters[account,default:[]].append($0) }
        }
        try Task.checkCancellation()
        try await pending.eraseAccount(account)
        try Task.checkCancellation()
        try references.erase(account:account)
        try encryptionKeys.erase(account:account)
    }
    public func completeLocalClosure(confirmation: LocalSessionErasureConfirmation, session: SessionController) async throws {
        let account=confirmation.accountID
        guard activeAccount != account,
              let record=try references.pendingClosure(account:account) else { throw CloudError.authenticationRequired }
        try await session.withConfirmedErasure(confirmation) {}
        closingAccounts.insert(account)
        try await pending.eraseAccount(account)
        try Task.checkCancellation()
        try references.erase(account:account)
        try encryptionKeys.erase(account:account)
        let references=self.references
        try await session.withConfirmedErasure(confirmation) { try references.removeClosure(record) }
        // This instance remains closed. A subsequent verified login gets a new coordinator.
    }
}
