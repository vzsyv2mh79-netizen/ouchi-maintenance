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
        generation += 1; busy = false; receipt = nil; reconciled = false
        if !sameAccount { binding = nil }
        if let restored, restoredMatches { binding = restored }
        resultUnconfirmed = binding != nil
    }
    public func recover(token: String) async throws -> AccountClosureReviewReceipt? {
        let current = try scope(); guard let binding else { return nil }
        return try await perform(current: current) { try await self.api.read(token: token, epochID: binding.epochID, submissionID: binding.submissionID) }
    }
    /// Explicit new request. A previously unknown/pending submission must be reconciled first.
    public func startNew(password: String, token: String) async throws -> AccountClosureReviewReceipt? {
        let current = try scope()
        guard !busy, binding == nil || (reconciled && receipt?.state == .cancelled) else { throw CloudError.unavailable }
        let proposed = AccountClosureReviewBinding(accountID: current.0, epochID: current.1, submissionID: UUID())
        let saved = try persist(proposed)
        guard generation == current.2, accountID == current.0, epochID == current.1 else { throw CloudError.authenticationRequired }
        guard saved == proposed, valid(saved) else { throw CloudError.invalidInput }
        binding = saved; receipt = nil; reconciled = false
        return try await perform(current: current) { try await self.api.request(password: password, token: token, epochID: saved.epochID, submissionID: saved.submissionID) }
    }
    /// Explicit retry uses the original nonce and only after a confirmed absent review.
    public func retry(password: String, token: String) async throws -> AccountClosureReviewReceipt? {
        let current = try scope(); guard let binding, reconciled, receipt == nil else { throw CloudError.unavailable }
        return try await perform(current: current) { try await self.api.request(password: password, token: token, epochID: binding.epochID, submissionID: binding.submissionID) }
    }
    public func cancel(token: String) async throws -> AccountClosureReviewReceipt? {
        let current = try scope(); guard let binding else { throw CloudError.invalidInput }
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
        guard !busy else { throw CloudError.unavailable }
        busy = true; reconciled = false; resultUnconfirmed = true
        defer { if generation == current.2 { busy = false } }
        let result = try await operation()
        try Task.checkCancellation()
        guard generation == current.2, accountID == current.0, epochID == current.1 else { throw CloudError.authenticationRequired }
        receipt = result; reconciled = true; resultUnconfirmed = false
        return result
    }
}
