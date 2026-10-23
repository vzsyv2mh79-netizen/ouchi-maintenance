import Foundation

public struct HomeHandoffBinding: Codable, Equatable, Sendable {
    public let accountID: UUID
    public let epochID: UUID
    public let homeID: UUID
    public let requestID: UUID
    public init(accountID: UUID, epochID: UUID, homeID: UUID, requestID: UUID) {
        self.accountID = accountID; self.epochID = epochID; self.homeID = homeID; self.requestID = requestID
    }
}
public struct HomeHandoffIntent: Codable, Equatable, Sendable {
    public let binding: HomeHandoffBinding
    public let recipientID: UUID?
    public let createdAt: Date
    public init(binding: HomeHandoffBinding, recipientID: UUID?, createdAt: Date) {
        self.binding = binding; self.recipientID = recipientID; self.createdAt = createdAt
    }
}

/// No local ownership mutation. An uncertain decision is recovered by GET only.
@MainActor public final class HomeHandoffFlow {
    public private(set) var status: HomeHandoffStatus?
    public private(set) var busy = false
    private var binding: HomeHandoffBinding?
    private var revision: UUID?
    private var generation = 0
    private var recipientID: UUID?
    private let api: HomeHandoffAPI
    private let persist: @MainActor (HomeHandoffBinding, UUID?) throws -> HomeHandoffIntent
    public init(api: HomeHandoffAPI = HomeHandoffAPI(),
                persist: @escaping @MainActor (HomeHandoffBinding, UUID?) throws -> HomeHandoffIntent = { _, _ in throw CloudError.unavailable }) {
        self.api = api; self.persist = persist
    }
    public func bind(_ value: HomeHandoffBinding?, revision: UUID? = nil) {
        guard binding != value || self.revision != revision else { return }
        let sameIntent = binding == value
        binding = value; self.revision = revision; generation += 1
        status = nil; busy = false
        if !sameIntent { recipientID = nil }
    }
    public func recover(token: String) async throws -> HomeHandoffStatus {
        try await perform(token: token, action: .read)
    }
    public func request(recipientID: UUID, token: String) async throws -> HomeHandoffStatus {
        try await perform(token: token, action: .create(recipientID))
    }
    public func decide(accept: Bool, token: String, now: @escaping @Sendable () -> Date = { Date() }) async throws -> HomeHandoffStatus {
        try await perform(token: token, action: .decide(accept, now))
    }
    private enum Action { case read, create(UUID), decide(Bool, @Sendable () -> Date) }
    private func perform(token: String, action: Action) async throws -> HomeHandoffStatus {
        guard let binding, binding.accountID != UUID(uuidString: "00000000-0000-0000-0000-000000000000") else { throw CloudError.authenticationRequired }
        try Task.checkCancellation(); guard !busy else { throw CloudError.unavailable }
        let expected = generation; busy = true
        defer { if generation == expected { busy = false } }
        func check() throws { try Task.checkCancellation(); guard generation == expected else { throw CloudError.authenticationRequired } }
        let value: HomeHandoffStatus
        switch action {
        case .read:
            value = try await api.read(requestID: binding.requestID, homeID: binding.homeID, epochID: binding.epochID, token: token)
        case .create(let recipient):
            // Capture intent before a possibly ambiguous send. Never reuse an ID
            // for a different recipient just because the acknowledgement was lost.
            guard recipient != UUID(uuidString: "00000000-0000-0000-0000-000000000000"),
                  recipient != binding.accountID, recipientID == nil || recipientID == recipient else { throw CloudError.invalidInput }
            recipientID = recipient
            let saved = try persist(binding, recipient)
            guard saved.binding == binding, saved.recipientID == recipient else { throw CloudError.invalidInput }
            try check()
            value = try await api.create(requestID: binding.requestID, homeID: binding.homeID, recipientID: recipient, epochID: binding.epochID, token: token)
        case .decide(let accept, let now):
            let current = try await api.read(requestID: binding.requestID, homeID: binding.homeID, epochID: binding.epochID, token: token)
            try check(); status = current
            if current.state == (accept ? .completed : .cancelled) { return current }
            guard current.state == .pending, !accept || current.expiresAt > now() else { throw CloudError.invalidInput }
            let saved = try persist(binding, nil)
            guard saved.binding == binding else { throw CloudError.invalidInput }
            try check()
            value = try await api.decide(accept: accept, requestID: binding.requestID, homeID: binding.homeID, epochID: binding.epochID, token: token)
        }
        try check(); status = value; return value
    }
}
