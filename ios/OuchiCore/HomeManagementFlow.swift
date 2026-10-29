import Foundation

/// Durable request identity is saved before POST. Unknown outcomes recover by
/// GET only; neither local state nor a cached home role grants ownership.
@MainActor public final class HomeManagementFlow {
    public private(set) var status: HomeManagementStatus?
    public private(set) var receipt: HomeManagementClaim?
    public private(set) var intent: HomeManagementIntent?
    public private(set) var busy = false
    public private(set) var resultUnconfirmed = false
    private let api: HomeManagementAPI
    private let persist: @MainActor (HomeManagementIntent) throws -> HomeManagementIntent
    private var accountID: UUID?
    private var epochID: UUID?
    private var homeID: UUID?
    private var revision: UUID?
    private var generation = 0
    public init(api: HomeManagementAPI = HomeManagementAPI(), persist: @escaping @MainActor (HomeManagementIntent) throws -> HomeManagementIntent = { _ in throw CloudError.unavailable }) {
        self.api = api; self.persist = persist
    }
    public func bind(accountID: UUID?, epochID: UUID?, homeID: UUID?, revision: UUID?, restored: HomeManagementIntent? = nil) {
        let matches = restored.map { $0.accountID == accountID && $0.epochID == epochID && $0.homeID == homeID && valid($0) } ?? false
        guard self.accountID != accountID || self.epochID != epochID || self.homeID != homeID || self.revision != revision || (matches && restored != intent) else { return }
        let sameScope = self.accountID == accountID && self.epochID == epochID && self.homeID == homeID
        self.accountID = accountID; self.epochID = epochID; self.homeID = homeID; self.revision = revision
        generation += 1; busy = false; status = nil; receipt = nil
        if !sameScope { intent = nil }
        if let restored, matches { intent = restored }
        resultUnconfirmed = intent != nil
    }
    public func load(token: String) async throws -> HomeManagementStatus {
        let current = try scope(); guard !busy else { throw CloudError.unavailable }
        busy = true; status = nil
        defer { if generation == current.3 { busy = false } }
        let value = try await api.status(homeID: current.2, epochID: current.1, token: token)
        try check(current); status = value; return value
    }
    public func recover(token: String) async throws -> HomeManagementClaim {
        let current = try scope(); guard let intent else { throw CloudError.invalidInput }
        return try await perform(current) { try await self.api.read(intent, token: token) }
    }
    public func start(token: String) async throws -> HomeManagementClaim {
        let current = try scope()
        guard intent == nil, !busy, let status, status.state == .awaitingManagement, status.canClaim,
              let expectedGeneration = status.generation else { throw CloudError.unavailable }
        return try await perform(current) {
            let fresh = try await self.api.status(homeID: current.2, epochID: current.1, token: token)
            try self.check(current)
            guard fresh.state == .awaitingManagement, fresh.canClaim, fresh.generation == expectedGeneration else { throw CloudError.unavailable }
            let proposed = HomeManagementIntent(accountID: current.0, epochID: current.1, homeID: current.2, generation: expectedGeneration, requestID: UUID())
            let saved = try self.persist(proposed)
            try self.check(current)
            guard saved == proposed, self.valid(saved) else { throw CloudError.invalidInput }
            self.intent = saved
            return try await self.api.claim(saved, token: token)
        }
    }
    /// Explicit retry of the SAME request only after a confirmed absent receipt.
    public func retry(token: String) async throws -> HomeManagementClaim {
        let current = try scope()
        guard let intent, receipt?.state == .notRecorded, !resultUnconfirmed else { throw CloudError.unavailable }
        return try await perform(current) {
            let fresh = try await self.api.status(homeID: current.2, epochID: current.1, token: token)
            try self.check(current)
            guard fresh.state == .awaitingManagement, fresh.canClaim, fresh.generation == intent.generation else { throw CloudError.unavailable }
            return try await self.api.claim(intent, token: token)
        }
    }
    /// Explicit local dismissal after a confirmed terminal receipt. The eraser
    /// must verify exact Keychain readback. No server request is made here.
    public func forgetConfirmedReference(remove: @MainActor (HomeManagementIntent) throws -> Void) throws {
        let current = try scope()
        guard !busy, let intent, receipt?.intent == intent,
              receipt?.state == .claimed || receipt?.state == .superseded else { throw CloudError.unavailable }
        try remove(intent); try check(current)
        self.intent = nil; receipt = nil; status = nil; resultUnconfirmed = false
    }
    private func scope() throws -> (UUID, UUID, UUID, Int) {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard let accountID, let epochID, let homeID, [accountID, epochID, homeID].allSatisfy({ $0 != zero }) else { throw CloudError.authenticationRequired }
        try Task.checkCancellation(); return (accountID, epochID, homeID, generation)
    }
    private func check(_ current: (UUID, UUID, UUID, Int)) throws {
        try Task.checkCancellation()
        guard accountID == current.0, epochID == current.1, homeID == current.2, generation == current.3 else { throw CloudError.authenticationRequired }
    }
    private func valid(_ value: HomeManagementIntent) -> Bool {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        return [value.accountID, value.epochID, value.homeID, value.requestID, value.generation].allSatisfy({ $0 != zero })
    }
    private func perform(_ current: (UUID, UUID, UUID, Int), operation: () async throws -> HomeManagementClaim) async throws -> HomeManagementClaim {
        guard !busy else { throw CloudError.unavailable }
        busy = true; receipt = nil; resultUnconfirmed = true
        defer { if generation == current.3 { busy = false } }
        let value = try await operation(); try check(current)
        receipt = value; resultUnconfirmed = false; return value
    }
}
