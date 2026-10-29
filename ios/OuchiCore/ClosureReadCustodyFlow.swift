import Foundation

/// Only the scoped read capability is persisted. Auth tokens, passwords and
/// session revisions never enter this record.
public struct ClosureReadCredential: Codable, Equatable, Sendable {
    public let accountID: UUID
    public let scope: ClosureReadScope
    public let credentialID: UUID
    public let expiresAt: Date
    public let token: String
    public init(accountID: UUID, scope: ClosureReadScope, credentialID: UUID, expiresAt: Date, token: String) {
        self.accountID = accountID; self.scope = scope; self.credentialID = credentialID
        self.expiresAt = expiresAt; self.token = token
    }
}
@MainActor public final class ClosureReadCustodyFlow {
    public struct Binding: Equatable, Sendable {
        public let accountID: UUID
        public let scope: ClosureReadScope
        public let revision: UUID
        public init(accountID: UUID, scope: ClosureReadScope, revision: UUID) {
            self.accountID = accountID; self.scope = scope; self.revision = revision
        }
    }
    public struct Confirmation: Equatable, Sendable {
        public let binding: Binding
        public let credentialID: UUID
        public let expiresAt: Date
    }
    /// Valid only during this exact fresh-verification cleanup operation. A
    /// callback retained by an adapter loses authority when the operation ends.
    public struct CleanupAuthorization: Sendable {
        private let check: @MainActor @Sendable () -> Bool
        fileprivate init(check: @escaping @MainActor @Sendable () -> Bool) { self.check = check }
        @MainActor public func isCurrent() -> Bool { check() }
    }
    public typealias Read = @MainActor (Binding) throws -> ClosureReadCredential?
    public typealias Prepare = @MainActor (Binding, ClosureReadWindow) throws -> ClosureReadCredential
    public private(set) var confirmed: Confirmation?
    public private(set) var status: ClosureReadStatus?
    public private(set) var busy = false
    public private(set) var resultUnconfirmed = true
    private let api: ClosureReadCustodyAPI
    private let read: Read
    private let prepare: Prepare
    private var binding: Binding?
    private var generation = 0
    private var activeCleanupID: UUID?
    public init(api: ClosureReadCustodyAPI = ClosureReadCustodyAPI(), read: @escaping Read, prepare: @escaping Prepare) {
        self.api = api; self.read = read; self.prepare = prepare
    }
    public func bind(_ binding: Binding?) {
        guard self.binding != binding else { return }
        self.binding = binding; generation += 1; busy = false; activeCleanupID = nil
        confirmed = nil; status = nil; resultUnconfirmed = true
    }
    /// An explicit user action. Existing custody is probed before repeating the
    /// same registration; read/descriptor failure never creates a replacement.
    public func prepareAndRegister(bearer: String) async throws {
        let (binding, expected) = try begin()
        defer { if generation == expected { busy = false } }
        var saved = try read(binding)
        try check(binding, expected)
        if saved == nil {
            guard let window = try await api.window(scope: binding.scope, bearer: bearer) else { throw CloudError.unavailable }
            try check(binding, expected)
            guard window.scope == binding.scope else { throw CloudError.malformedResponse }
            saved = try prepare(binding, window)
            try check(binding, expected)
            guard saved?.expiresAt == window.expiresAt else { throw CloudError.invalidInput }
        }
        guard let saved else { throw CloudError.unavailable }
        try validate(saved, binding: binding)
        try retained(saved, binding: binding, generation: expected)
        // A positive read also recovers a lost registration acknowledgement.
        let progress = try await api.status(scope: saved.scope, credentialID: saved.credentialID, token: saved.token)
        try check(binding, expected)
        if let progress {
            try acknowledge(saved, binding: binding, generation: expected, status: progress)
            return
        }
        // Unavailable is not permission for a new key/deadline or a deletion
        // retry. Only this exact persisted read credential is registered.
        try retained(saved, binding: binding, generation: expected)
        try await api.register(scope: saved.scope, credentialID: saved.credentialID, token: saved.token, expiresAt: saved.expiresAt, bearer: bearer)
        try check(binding, expected)
        try acknowledge(saved, binding: binding, generation: expected, status: nil)
    }
    /// No login, registration, key generation or renewal. Works after local Auth
    /// cleanup using the original protected record, even after process restart.
    public func recover() async throws -> ClosureReadStatus? {
        let (binding, expected) = try begin()
        defer { if generation == expected { busy = false } }
        guard let saved = try read(binding) else { throw CloudError.unavailable }
        try check(binding, expected); try validate(saved, binding: binding)
        let progress = try await api.status(scope: saved.scope, credentialID: saved.credentialID, token: saved.token)
        try check(binding, expected)
        guard let progress else { return nil }
        try acknowledge(saved, binding: binding, generation: expected, status: progress)
        return progress
    }
    /// Explicit device-local cleanup only. The caller supplies scoped erasers,
    /// never remote account deletion. Every attempt re-reads the original key
    /// and obtains fresh canonical completion before invoking any eraser.
    public func cleanupLocalData(using cleanup: @MainActor (Confirmation, AccountDeletionStatus, CleanupAuthorization) async throws -> AccountDeletionLocalCleanupResult) async throws -> AccountDeletionLocalCleanupResult {
        let (binding, expected) = try begin()
        let cleanupID = UUID(); activeCleanupID = cleanupID
        defer {
            if activeCleanupID == cleanupID { activeCleanupID = nil }
            if generation == expected { busy = false }
        }
        guard let saved = try read(binding) else { throw CloudError.unavailable }
        try check(binding, expected); try validate(saved, binding: binding)
        let progress = try await api.status(scope: saved.scope, credentialID: saved.credentialID, token: saved.token)
        try check(binding, expected)
        guard let progress else { return .pending }
        try retained(saved, binding: binding, generation: expected)
        guard progress.state == .complete else {
            try acknowledge(saved, binding: binding, generation: expected, status: progress)
            return .pending
        }
        let confirmation = Confirmation(binding: binding, credentialID: saved.credentialID, expiresAt: saved.expiresAt)
        let receipt = AccountDeletionStatus(requestID: saved.scope.requestID, epochID: saved.scope.epochID, state: .complete)
        let current = CleanupAuthorization { [self] in
            guard busy, activeCleanupID == cleanupID else { return false }
            do { try retained(saved, binding: binding, generation: expected); return true } catch { return false }
        }
        guard current.isCurrent() else { throw CloudError.authenticationRequired }
        let result = try await cleanup(confirmation, receipt, current)
        try check(binding, expected)
        guard result != .staleBinding else { throw CloudError.authenticationRequired }
        try acknowledge(saved, binding: binding, generation: expected, status: progress)
        return result
    }
    private func begin() throws -> (Binding, Int) {
        guard let binding else { throw CloudError.authenticationRequired }
        guard !busy else { throw CloudError.unavailable }
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard [binding.accountID, binding.revision, binding.scope.requestID, binding.scope.epochID, binding.scope.submissionID].allSatisfy({ $0 != zero }) else { throw CloudError.invalidInput }
        try Task.checkCancellation()
        confirmed = nil; status = nil; resultUnconfirmed = true; busy = true
        return (binding, generation)
    }
    private func check(_ binding: Binding, _ expected: Int) throws {
        try Task.checkCancellation()
        guard generation == expected, self.binding == binding else { throw CloudError.authenticationRequired }
    }
    private func validate(_ saved: ClosureReadCredential, binding: Binding) throws {
        let encoded = saved.token.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") + "="
        guard saved.accountID == binding.accountID, saved.scope == binding.scope,
              saved.credentialID != UUID(uuidString: "00000000-0000-0000-0000-000000000000"),
              saved.token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              let bytes = Data(base64Encoded: encoded), bytes.count == 32, bytes.base64EncodedString() == encoded,
              saved.expiresAt.timeIntervalSince1970.isFinite else { throw CloudError.invalidInput }
        guard saved.expiresAt > Date(), saved.expiresAt <= Date().addingTimeInterval(30 * 86400) else { throw CloudError.unavailable }
    }
    private func retained(_ saved: ClosureReadCredential, binding: Binding, generation: Int) throws {
        let durable = try read(binding)
        try check(binding, generation)
        guard durable == saved else { throw CloudError.unavailable }
        try validate(saved, binding: binding)
    }
    private func acknowledge(_ saved: ClosureReadCredential, binding: Binding, generation: Int, status: ClosureReadStatus?) throws {
        try retained(saved, binding: binding, generation: generation)
        guard status == nil || (status?.scope == saved.scope && status?.credentialID == saved.credentialID) else { throw CloudError.malformedResponse }
        confirmed = .init(binding: binding, credentialID: saved.credentialID, expiresAt: saved.expiresAt)
        self.status = status; resultUnconfirmed = false
    }
}
