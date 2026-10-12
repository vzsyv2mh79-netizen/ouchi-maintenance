import Foundation
import CoreFoundation

/// Coordinates one preparation/first-submit/status/cancellation path. Outcomes
/// describe processing only; callers must read current verified paid rights.
public actor SandboxRestoreFlow {
    public enum Outcome: Equatable, Sendable { case absent, pending, complete, cancelled }
    public typealias Producer = @Sendable (AppAttestRegistrationSession, UUID) async throws -> PendingRestore
    private let storage: PendingRestoreStorage
    private let commit: RestoreCommitAPI
    private let status: RestoreStatusAPI
    private let process: RestoreProcessAPI
    private let cancel: RestoreCancelAPI
    private let now: @Sendable () -> Int64
    private var active = false
    public init(storage: PendingRestoreStorage, currentSession: @escaping AppAttestRegistrationAPI.CurrentSession,
                transport: HouseholdAPI.Transport? = nil,
                now: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.storage = storage; self.now = now
        commit = RestoreCommitAPI(currentSession: currentSession, transport: transport, now: now)
        status = RestoreStatusAPI(currentSession: currentSession, transport: transport, now: now)
        process = RestoreProcessAPI(currentSession: currentSession, transport: transport, now: now)
        cancel = RestoreCancelAPI(currentSession: currentSession, transport: transport, now: now)
    }
    /// Independent opt-in is mandatory; a local StoreKit/loopback fixture cannot
    /// call the fixed formal restore endpoints. The shipped flag remains false.
    public static func configuration(info: [String: Any], bundleIdentifier: String?,
                                     purchaseEnvironment: BillingEnvironment, isolatedDevelopment: Bool) throws -> AppAttestRegistrationConfiguration? {
        guard let value = info["OUCHI_SANDBOX_RESTORE_ENABLED"] else { return nil }
        guard let enabled = value as? NSNumber, CFGetTypeID(enabled) == CFBooleanGetTypeID() else { throw CloudError.invalidInput }
        guard enabled.boolValue else { return nil }
        guard purchaseEnvironment == .sandbox, !isolatedDevelopment,
              let registration = try AppAttestRegistrationConfiguration.parse(info: info, bundleIdentifier: bundleIdentifier) else { throw CloudError.unavailable }
        return registration
    }
    public func startOrResume(captured: AppAttestRegistrationSession, producer: Producer) async throws -> Outcome {
        guard !active else { throw CloudError.unavailable }
        active = true; defer { active = false }
        try await commit.validate(captured)
        if try await storage.read(scope: captured.scope) != nil { return try await resume(captured) }
        let requestID = UUID()
        let proof = try await producer(captured, requestID)
        try await commit.validate(captured)
        guard proof.scope == captured.scope, proof.challenge.requestID == requestID else { throw CloudError.invalidInput }
        // Do not call a separate SDK staging helper: this is the sole claim and
        // first submit. Existing records always use status, including lost ack.
        _ = try await PendingRestoreSubmission(storage: storage).submitNew(proof, captured: captured, api: commit, nowMilliseconds: now())
        try await commit.validate(captured)
        return try await resume(captured)
    }
    private func resume(_ captured: AppAttestRegistrationSession) async throws -> Outcome {
        switch try await PendingRestoreRecovery(storage: storage).resume(captured: captured, api: status) {
        case .pending:
            // A successful status lookup is required before dispatch. Missing or
            // lost commit state never retries assertion submission or production.
            try await process.validate(captured)
            guard let pending = try await storage.read(scope: captured.scope) else { return .absent }
            let result = try await process.process(captured: captured, requestID: pending.challenge.requestID,
                pairSHA256: pending.pairSHA256, assertionSHA256: pending.assertionSHA256)
            try await process.validate(captured)
            try Task.checkCancellation()
            if result == .complete { try await storage.removeCompleted(pending) }
            try await process.validate(captured)
            return result == .complete ? .complete : .pending
        case .complete: return .complete
        case nil: return .absent
        }
    }
    public func refresh(captured: AppAttestRegistrationSession) async throws -> Outcome {
        guard !active else { throw CloudError.unavailable }
        active = true; defer { active = false }
        return try await resume(captured)
    }
    public func cancelUnreserved(captured: AppAttestRegistrationSession) async throws -> Outcome {
        guard !active else { throw CloudError.unavailable }
        active = true; defer { active = false }
        return try await PendingRestoreCancellation(storage: storage).cancelUnreserved(captured: captured, api: cancel) == nil ? .absent : .cancelled
    }
}
