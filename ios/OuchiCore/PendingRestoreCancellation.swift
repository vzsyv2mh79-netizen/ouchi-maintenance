import Foundation

/// Authenticated cancellation of an exact persisted unreserved proof. A network
/// failure or unknown server outcome retains it; this never sends commit or
/// obtains a replacement SDK proof/Apple mutation/current subscription rights.
public actor PendingRestoreCancellation {
    private let storage: PendingRestoreStorage
    public init(storage: PendingRestoreStorage) { self.storage = storage }
    public func cancelUnreserved(captured: AppAttestRegistrationSession, api: RestoreCancelAPI) async throws -> RestoreCancelAPI.Receipt? {
        try await api.validate(captured)
        guard let pending = try await storage.read(scope: captured.scope) else { return nil }
        try await api.validate(captured)
        let receipt = try await api.cancelUnreserved(pending: pending, captured: captured)
        try await api.validate(captured)
        try Task.checkCancellation()
        try await storage.removeCancelled(pending, receipt: receipt)
        try await api.validate(captured)
        return receipt
    }
}
