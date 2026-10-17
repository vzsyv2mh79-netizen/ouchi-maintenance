import Foundation

/// Submission identity must be durably saved/read back before a mutation.
/// Passwords and bearer tokens are never part of this custody record.
public struct AccountClosureReviewBinding: Codable, Equatable, Sendable {
    public let accountID: UUID
    public let epochID: UUID
    public let submissionID: UUID
    public init(accountID: UUID, epochID: UUID, submissionID: UUID) {
        self.accountID = accountID; self.epochID = epochID; self.submissionID = submissionID
    }
}
@MainActor public final class AccountClosureReviewFlow {
    public typealias Persist = @MainActor (AccountClosureReviewBinding) throws -> AccountClosureReviewBinding
    public private(set) var binding: AccountClosureReviewBinding?
    public private(set) var receipt: AccountClosureReviewReceipt?
    public private(set) var progress: AccountClosureProgressReceipt?
    /// Sticky for this saved submission: a lost later reply must not reopen mutations.
    public private(set) var retirementObserved = false
    /// Fresh exact missing progress/review permits only an explicit SAME-number
    /// intake retry. It never confirms erasure or permits a new submission.
    public private(set) var canRetrySameSubmission = false
    public private(set) var busy = false
    public private(set) var resultUnconfirmed = false
    private let api: AccountClosureReviewAPI
    private let persist: Persist
    private var accountID: UUID?
    private var epochID: UUID?
    private var revision: UUID?
    private var generation = 0
    private var reconciled = false
    public init(api: AccountClosureReviewAPI = AccountClosureReviewAPI(), persist: @escaping Persist = { _ in throw CloudError.unavailable }) {
        self.api = api; self.persist = persist
    }
    public func bind(accountID: UUID?, epochID: UUID?, revision: UUID?, restored: AccountClosureReviewBinding? = nil) {
        let restoredMatches = restored.map { $0.accountID == accountID && $0.epochID == epochID && valid($0) } ?? false
        let referenceChanged = restoredMatches && restored != binding
        guard self.accountID != accountID || self.epochID != epochID || self.revision != revision || referenceChanged else { return }
        let sameAccount = self.accountID == accountID && self.epochID == epochID
        self.accountID = accountID; self.epochID = epochID; self.revision = revision
        generation += 1; canRetrySameSubmission = false; busy = false; receipt = nil; progress = nil; reconciled = false
        if !sameAccount || referenceChanged { retirementObserved = false }
        if !sameAccount { binding = nil }
        if let restored, restoredMatches { binding = restored }
        resultUnconfirmed = binding != nil
    }
    /// Progress is checked before the legacy review. Unmapped/expired progress
    /// plus an absent review is uncertain, never authorization to create a new
    /// submission or claim deletion. A separate explicit same-number intake
    /// retry rechecks both reads immediately before requesting.
    public func refresh(token: String) async throws -> AccountClosureReviewReceipt? {
        let current = try scope()
        guard let binding, !busy else { throw CloudError.unavailable }
        busy = true; canRetrySameSubmission = false; reconciled = false; resultUnconfirmed = true; receipt = nil; progress = nil
        defer { if generation == current.2 { busy = false } }
        let status = try await api.progress(token: token, epochID: binding.epochID, submissionID: binding.submissionID)
        try check(current)
        if let status {
            retirementObserved = true; progress = status; reconciled = true; resultUnconfirmed = false
            return nil
        }
        // Once processing was observed, even an unavailable receipt cannot
        // restore cancellation/retry or fall back to an older review snapshot.
        guard !retirementObserved else { return nil }
        let result = try await api.read(token: token, epochID: binding.epochID, submissionID: binding.submissionID)
        try check(current)
        receipt = result; reconciled = result != nil; resultUnconfirmed = result == nil
        // The scoped read endpoint verifies live original app enrollment before
        // returning this exact missing receipt; transport/protocol errors throw.
        canRetrySameSubmission = result == nil
        return result
    }
    private func check(_ current: (UUID, UUID, Int)) throws {
        try Task.checkCancellation()
        guard generation == current.2, accountID == current.0, epochID == current.1 else { throw CloudError.authenticationRequired }
    }
    public func recover(token: String) async throws -> AccountClosureReviewReceipt? {
        let current = try scope(); guard let binding else { return nil }
        return try await perform(current: current) { try await self.api.read(token: token, epochID: binding.epochID, submissionID: binding.submissionID) }
    }
    /// Explicit new request. A previously unknown/pending submission must be reconciled first.
    public func startNew(password: String, token: String) async throws -> AccountClosureReviewReceipt? {
        let current = try scope()
        guard !busy, !retirementObserved, binding == nil || (reconciled && receipt?.state == .cancelled) else { throw CloudError.unavailable }
        let proposed = AccountClosureReviewBinding(accountID: current.0, epochID: current.1, submissionID: UUID())
        let saved = try persist(proposed)
        guard generation == current.2, accountID == current.0, epochID == current.1 else { throw CloudError.authenticationRequired }
        guard saved == proposed, valid(saved) else { throw CloudError.invalidInput }
        binding = saved; receipt = nil; reconciled = false
        return try await perform(current: current) { try await self.api.request(password: password, token: token, epochID: saved.epochID, submissionID: saved.submissionID) }
    }
    /// Explicit retry uses the original nonce and only after a confirmed absent review.
    public func retry(password: String, token: String) async throws -> AccountClosureReviewReceipt? {
        let current = try scope()
        guard let binding, !busy, !retirementObserved, canRetrySameSubmission else { throw CloudError.unavailable }
        // User confirmation is not cached authority: acceptance/processing may
        // have arrived since the screen last read. Recover that result instead.
        let observed = try await refresh(token: token)
        try check(current)
        guard canRetrySameSubmission, !retirementObserved else { return observed }
        return try await perform(current: current) { try await self.api.request(password: password, token: token, epochID: binding.epochID, submissionID: binding.submissionID) }
    }
    public func cancel(token: String) async throws -> AccountClosureReviewReceipt? {
        let current = try scope(); guard let binding, !retirementObserved, reconciled, receipt?.state == .reviewRequired, !resultUnconfirmed else { throw CloudError.unavailable }
        return try await perform(current: current) { try await self.api.cancel(token: token, epochID: binding.epochID, submissionID: binding.submissionID) }
    }
    private func scope() throws -> (UUID, UUID, Int) {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard let accountID, let epochID, accountID != zero, epochID != zero else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        return (accountID, epochID, generation)
    }
    private func valid(_ value: AccountClosureReviewBinding) -> Bool {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        return value.accountID != zero && value.epochID != zero && value.submissionID != zero
    }
    private func perform(current: (UUID, UUID, Int), operation: () async throws -> AccountClosureReviewReceipt?) async throws -> AccountClosureReviewReceipt? {
        guard !busy, !retirementObserved else { throw CloudError.unavailable }
        busy = true; canRetrySameSubmission = false; reconciled = false; resultUnconfirmed = true; receipt = nil
        defer { if generation == current.2 { busy = false } }
        let result = try await operation()
        try Task.checkCancellation()
        guard generation == current.2, accountID == current.0, epochID == current.1 else { throw CloudError.authenticationRequired }
        receipt = result; reconciled = result != nil; resultUnconfirmed = result == nil
        return result
    }
}
