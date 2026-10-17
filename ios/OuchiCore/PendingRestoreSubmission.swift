import Foundation

/// First submission only. A persisted attempt always resumes status instead of
/// re-sending or regenerating proof. No rights or Apple updates are performed.
public actor PendingRestoreSubmission {
    private let storage: PendingRestoreStorage
    private var active = false
    public init(storage: PendingRestoreStorage) { self.storage = storage }
    public func submitNew(_ pending: PendingRestore, captured: AppAttestRegistrationSession,
                          api: RestoreCommitAPI, nowMilliseconds: Int64) async throws -> RestoreCommitAPI.Accepted {
        guard !active else { throw CloudError.unavailable }
        active = true; defer { active = false }
        try await api.validate(captured)
        guard pending.scope == captured.scope else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        // Atomic filesystem claim refuses another actor/process before HTTP.
        // Once staged, errors/cancellation never remove or replace evidence.
        try await storage.stageNew(pending,nowMilliseconds:nowMilliseconds)
        try await api.validate(captured)
        try Task.checkCancellation()
        return try await api.submit(pending:pending,captured:captured)
    }
}
