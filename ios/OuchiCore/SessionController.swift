import Foundation

public protocol SessionStorage: Sendable {
    func read() throws -> Data?
    func write(_ data: Data?) throws
}

/// Issued only by the controller for its exact current login generation.
public struct CompletedDeletionSessionPermit: Sendable {
    fileprivate let account: UUID
    fileprivate let generation: Int
}

public actor SessionController {
    private let api: HouseholdAPI
    private let storage: any SessionStorage
    private var session: Session?
    private var generation = 0
    private var refreshTask: Task<Session, Error>?
    public init(api: HouseholdAPI, storage: any SessionStorage) {
        self.api = api; self.storage = storage
    }
    public func restore() throws -> Bool {
        guard let data = try storage.read() else { return false }
        let restored = try JSONDecoder().decode(Session.self, from: data)
        generation += 1
        refreshTask?.cancel(); refreshTask = nil
        session = restored
        return true
    }
    public func signIn(email: String, password: String) async throws {
        try signOut()
        let expected = generation
        let value = try await api.signIn(email: email, password: password)
        guard expected == generation else { throw CancellationError() }
        try storage.write(JSONEncoder().encode(value))
        session = value
    }
    public func signUp(email: String, password: String) async throws -> Bool {
        try signOut()
        let expected = generation
        let value = try await api.signUp(email: email, password: password)
        guard expected == generation else { throw CancellationError() }
        guard let value else { return false }
        try storage.write(JSONEncoder().encode(value))
        session = value
        return true
    }
    public func signOut() throws {
        generation += 1
        refreshTask?.cancel(); refreshTask = nil
        session = nil
        try storage.write(nil)
    }
    /// Caller must obtain this receipt from the authenticated deletion API.
    /// Local file cleanup alone or a pending receipt never authorizes erasure.
    public func prepareCompletedDeletionErasure(receipt: AccountDeletionStatus, account: UUID, epoch: UUID) throws -> CompletedDeletionSessionPermit {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        try Task.checkCancellation()
        guard receipt.state == .complete, receipt.requestID != zero,
              account != zero, epoch != zero, account != epoch,
              receipt.epochID == epoch, session?.user.id == account else { throw CloudError.authenticationRequired }
        return CompletedDeletionSessionPermit(account: account, generation: generation)
    }
    /// No suspension between comparison, Keychain deletion and memory invalidation.
    /// A storage failure leaves the login available for explicit same-binding retry.
    public func eraseCompletedDeletionSession(_ permit: CompletedDeletionSessionPermit) throws {
        try Task.checkCancellation()
        guard permit.generation == generation, session?.user.id == permit.account else { throw CloudError.authenticationRequired }
        try storage.write(nil)
        generation += 1
        refreshTask?.cancel(); refreshTask = nil
        session = nil
    }
    /// Remote-only preflight. Local session/storage are cleared separately after
    /// acknowledgement; a delayed response must not act on a replacement login.
    public func revokeRemoteSession() async throws {
        let expected = generation
        let current = try await credentials()
        guard expected == generation else { throw CancellationError() }
        try await api.revokeCurrentSession(token: current.access_token)
        guard expected == generation else { throw CancellationError() }
    }
    /// Device-local identity for offline viewing only; not remote authorization.
    public func localAccount() -> UUID? { session?.user.id }
    public func credentials(now: Date = Date()) async throws -> Session {
        guard let current = session else { throw CloudError.authenticationRequired }
        if current.expires_at > now.timeIntervalSince1970 + 60 { return current }
        let expected = generation
        // Actor reentrancy: all simultaneous consumers await one refresh request.
        let pending: Task<Session, Error>
        if let existing = refreshTask { pending = existing }
        else {
            let api = self.api
            pending = Task { try await api.refresh(current) }
            refreshTask = pending
        }
        do {
            let value = try await pending.value
            guard expected == generation, value.user.id == current.user.id else { throw CancellationError() }
            try storage.write(JSONEncoder().encode(value))
            session = value
            refreshTask = nil
            return value
        } catch {
            if expected == generation { refreshTask = nil }
            throw error
        }
    }
}
