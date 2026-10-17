import Foundation

/// Device cleanup is distinct from server completion; credentials remain for progress recovery.
public enum AccountDeletionLocalCleanupResult: Equatable, Sendable { case complete, pending, staleBinding }
@MainActor public func cleanAccountDeletionLocalData(
    receipt: AccountDeletionStatus, account: UUID, epoch: UUID, revision: UUID,
    stillBound: () -> Bool,
    stopNotifications: () async -> Bool,
    erasePendingRegistration: () async -> AccountDeletionLocalCleanupResult,
    eraseSnapshot: @escaping () throws -> Void,
    erasePendingUpload: @escaping () throws -> Void,
    erasePendingRemoval: @escaping () throws -> Void,
    eraseManagedExports: @escaping () throws -> Void,
    clearVisibleData: () -> Void
) async -> AccountDeletionLocalCleanupResult {
    let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
    guard account != zero, epoch != zero, account != epoch, revision != zero,
          receipt.requestID != zero, receipt.epochID == epoch, stillBound(), !Task.isCancelled else { return .staleBinding }
    var confirmed = await stopNotifications()
    guard stillBound(), !Task.isCancelled else { return .staleBinding }
    let registration = await erasePendingRegistration()
    guard stillBound(), !Task.isCancelled, registration != .staleBinding else { return .staleBinding }
    if registration != .complete { confirmed = false }
    // Each synchronous eraser is scoped by its adapter. Attempt independent cleanup
    // after a partial failure, but retain a pending result until every stage succeeds.
    for erase in [eraseSnapshot, erasePendingUpload, erasePendingRemoval, eraseManagedExports] {
        guard stillBound(), !Task.isCancelled else { return .staleBinding }
        do { try erase() } catch { confirmed = false }
    }
    guard stillBound(), !Task.isCancelled else { return .staleBinding }
    clearVisibleData()
    return confirmed ? .complete : .pending
}
