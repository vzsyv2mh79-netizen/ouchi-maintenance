import Foundation

public protocol SessionStorage: Sendable {
    func read() throws -> Data?
    func write(_ data: Data?) throws
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
        session = try JSONDecoder().decode(Session.self, from: data)
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
    public func signOut() throws {
        generation += 1
        refreshTask?.cancel(); refreshTask = nil
        session = nil
        try storage.write(nil)
    }
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
