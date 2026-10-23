import Foundation

/// Prepared account-scoped cleanup. Erase ciphertext first, then its keys;
/// a failed stage stays recoverable and can be retried with the same account.
@MainActor public func eraseAppAttestLocalRegistration(
    account: UUID,
    stillBound: () -> Bool,
    prepareClosure: () throws -> Void,
    erasePendingProofs: () async throws -> Void,
    eraseEncryptionKeys: () throws -> Void
) async -> AccountDeletionLocalCleanupResult {
    let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
    guard account != zero, stillBound(), !Task.isCancelled else { return .staleBinding }
    do {
        // Persist restart protection before destroying any recoverable material.
        try prepareClosure()
        guard stillBound(), !Task.isCancelled else { return .staleBinding }
        try await erasePendingProofs()
        guard stillBound(), !Task.isCancelled else { return .staleBinding }
        try eraseEncryptionKeys()
        guard stillBound(), !Task.isCancelled else { return .staleBinding }
        return .complete
    } catch {
        return stillBound() && !Task.isCancelled ? .pending : .staleBinding
    }
}
