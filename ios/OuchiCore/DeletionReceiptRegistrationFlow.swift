import Foundation

/// Persists a receipt before registration. This flow never requests deletion.
/// Callers may proceed only while `registered` matches their current binding;
/// the server must independently bind and authorize the deletion request.
@MainActor public final class DeletionReceiptRegistrationFlow {
    public struct Binding: Equatable, Sendable {
        public let requestID: UUID
        public let userID: UUID
        public let inventoryDigest: String
        public let revision: UUID
        public let expiresAt: Date
        public init(requestID: UUID, userID: UUID, inventoryDigest: String, revision: UUID, expiresAt: Date) {
            self.requestID = requestID; self.userID = userID; self.inventoryDigest = inventoryDigest
            self.revision = revision; self.expiresAt = expiresAt
        }
    }
    public struct PersistedReceipt: Sendable {
        public let requestID: UUID
        public let userID: UUID
        public let inventoryDigest: String
        public let expiresAt: Date
        public let token: String
        public init(requestID: UUID, userID: UUID, inventoryDigest: String, expiresAt: Date, token: String) {
            self.requestID = requestID; self.userID = userID; self.inventoryDigest = inventoryDigest
            self.expiresAt = expiresAt; self.token = token
        }
    }
    public private(set) var registered: Binding?
    public private(set) var busy = false
    private var binding: Binding?
    private var generation = 0
    private let api: DeletionReceiptAPI
    private let persist: (Binding) throws -> PersistedReceipt
    public init(api: DeletionReceiptAPI = DeletionReceiptAPI(), persist: @escaping (Binding) throws -> PersistedReceipt) {
        self.api = api; self.persist = persist
    }
    public func bind(_ binding: Binding?) {
        guard self.binding != binding else { return }
        self.binding = binding; generation += 1; registered = nil; busy = false
    }
    public func register(bearer: String?) async throws {
        guard let binding else { throw CloudError.authenticationRequired }
        guard !busy else { throw CloudError.unavailable }
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard binding.requestID != zero, binding.userID != zero, binding.revision != zero,
              binding.inventoryDigest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              binding.expiresAt.timeIntervalSince1970.isFinite, binding.expiresAt > Date() else { throw CloudError.invalidInput }
        try Task.checkCancellation()
        let expected = generation
        registered = nil; busy = true
        defer { if generation == expected { busy = false } }
        // The adapter must return the durable read-back, not a proposed token.
        let saved = try persist(binding)
        guard saved.requestID == binding.requestID, saved.userID == binding.userID,
              saved.inventoryDigest == binding.inventoryDigest, saved.expiresAt == binding.expiresAt else { throw CloudError.invalidInput }
        try Task.checkCancellation()
        guard generation == expected else { throw CloudError.authenticationRequired }
        try await api.register(requestID: saved.requestID, receiptToken: saved.token, expiresAt: saved.expiresAt, bearer: bearer)
        try Task.checkCancellation()
        guard generation == expected, self.binding == binding else { throw CloudError.authenticationRequired }
        registered = binding
    }
}
