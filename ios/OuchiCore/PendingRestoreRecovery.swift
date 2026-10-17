import Foundation

/// Read-only resumption after a restart or lost acknowledgement. It does not
/// retry commit, generate assertions, dispatch Apple updates or grant rights.
public actor PendingRestoreRecovery {
    private let storage: PendingRestoreStorage
    public init(storage: PendingRestoreStorage) { self.storage = storage }
    public func resume(captured: AppAttestRegistrationSession, api: RestoreStatusAPI) async throws -> RestoreStatusAPI.Status? {
        try await api.validate(captured)
        guard let pending = try await storage.read(scope:captured.scope) else { return nil }
        try await api.validate(captured)
        let status = try await api.status(captured:captured,requestID:pending.challenge.requestID,
            pairSHA256:pending.pairSHA256,assertionSHA256:pending.assertionSHA256)
        try await api.validate(captured)
        try Task.checkCancellation()
        if status == .complete { try await storage.removeCompleted(pending) }
        try await api.validate(captured)
        return status
    }
}
