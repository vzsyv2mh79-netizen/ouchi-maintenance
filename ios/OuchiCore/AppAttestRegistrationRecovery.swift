import Foundation

/// Prepared recovery of an already durably staged proof. It cannot create a
/// DeviceCheck key or grant purchases. The receipt writer must confirm durable
/// account/key-reference state before the encrypted retry record is removed.
public actor AppAttestRegistrationRecovery {
    public typealias ReceiptWriter = @Sendable (AppAttestRegistrationReceipt) async throws -> Void
    private let storage: AppAttestPendingRegistrationStorage
    private let api: AppAttestRegistrationAPI
    private let currentSession: AppAttestRegistrationAPI.CurrentSession
    private let persistReceipt: ReceiptWriter
    private let now: @Sendable () -> Int64
    private var active = false
    public init(storage: AppAttestPendingRegistrationStorage, api: AppAttestRegistrationAPI,
                currentSession: @escaping AppAttestRegistrationAPI.CurrentSession,
                references: AppAttestKeyReferenceStorage,
                now: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.storage=storage;self.api=api;self.currentSession=currentSession;self.now=now
        self.persistReceipt={ try references.confirm($0,nowMilliseconds:now()) }
    }
    public init(storage: AppAttestPendingRegistrationStorage, api: AppAttestRegistrationAPI,
                currentSession: @escaping AppAttestRegistrationAPI.CurrentSession,
                persistReceipt: @escaping ReceiptWriter,
                now: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.storage = storage; self.api = api; self.currentSession = currentSession
        self.persistReceipt = persistReceipt; self.now = now
    }
    private func validate(_ captured: AppAttestRegistrationSession) async throws {
        try Task.checkCancellation()
        guard await currentSession() == captured else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
    }
    public func resume(captured: AppAttestRegistrationSession) async throws -> AppAttestRegistrationReceipt? {
        guard !active else { throw CloudError.unavailable }
        active = true; defer { active = false }
        try await validate(captured)
        guard let pending = try await storage.read(scope: captured.scope, nowMilliseconds: now()) else { return nil }
        try await validate(captured)
        let receipt = try await api.commit(pending.challenge, attestation: pending.attestation, captured: captured)
        try await validate(captured)
        // A failed/uncertain durable receipt write leaves the exact proof in
        // place. Repeating this writer must be idempotent for the same scope.
        try await persistReceipt(receipt)
        try await validate(captured)
        try await storage.removeAcknowledged(receipt, scope: captured.scope, nowMilliseconds: now())
        try await validate(captured)
        return receipt
    }
}
