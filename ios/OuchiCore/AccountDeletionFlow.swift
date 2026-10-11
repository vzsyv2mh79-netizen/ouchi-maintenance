import Foundation

/// Prepared flow for a future deletion screen; does not erase local data.
@MainActor public final class AccountDeletionFlow {
    public private(set) var receipt: AccountDeletionStatus?
    public private(set) var busy = false
    private var accountID: UUID?
    private var epochID: UUID?
    private var generation = 0
    private var bindingRevision: UUID?
    private let api: AccountDeletionAPI
    public init(api: AccountDeletionAPI = AccountDeletionAPI()) { self.api = api }

    public func bind(accountID: UUID?, epochID: UUID? = nil, revision: UUID? = nil) {
        guard self.accountID != accountID || self.epochID != epochID || bindingRevision != revision else { return }
        bindingRevision = revision
        generation += 1
        self.accountID = accountID
        self.epochID = epochID
        receipt = nil
        busy = false
    }

    public func recover(token: String) async throws -> AccountDeletionStatus? {
        try await perform(token: token, password: nil)
    }
    public func submit(password: String, token: String) async throws -> AccountDeletionStatus? {
        try await perform(token: token, password: password)
    }
    private func perform(token: String, password: String?) async throws -> AccountDeletionStatus? {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard let accountID, let epochID, accountID != zero, epochID != zero else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        guard !busy else { throw CloudError.unavailable }
        let expected = generation
        busy = true
        defer { if generation == expected { busy = false } }
        let current = try await api.currentProgress(token: token)
        try Task.checkCancellation()
        guard generation == expected else { throw CloudError.authenticationRequired }
        if let current {
            guard current.epochID == epochID else { throw CloudError.authenticationRequired }
            receipt = current
            return current
        }
        // Explicitly empty current epoch may submit; an outage must never do so.
        guard let password else { receipt = nil; return nil }
        let accepted = try await api.request(password: password, token: token)
        try Task.checkCancellation()
        guard generation == expected else { throw CloudError.authenticationRequired }
        guard accepted.epochID == epochID else { throw CloudError.authenticationRequired }
        receipt = accepted
        return accepted
    }
}
