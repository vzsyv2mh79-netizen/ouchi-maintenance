import Foundation

/// Read-only recovery after the original login session is unavailable.
/// This flow neither registers a credential nor starts deletion or local cleanup.
@MainActor public final class DeletionReceiptRecoveryFlow {
    public typealias Binding = DeletionReceiptRegistrationFlow.Binding
    public typealias Receipt = DeletionReceiptRegistrationFlow.PersistedReceipt
    public private(set) var state: DeletionReceiptAPI.State?
    public private(set) var busy = false
    private var binding: Binding?
    private var generation = 0
    private let api: DeletionReceiptAPI
    private let read: (Binding) throws -> Receipt?
    private let now: () -> Date

    public init(api: DeletionReceiptAPI = DeletionReceiptAPI(),
                now: @escaping () -> Date = Date.init,
                read: @escaping (Binding) throws -> Receipt?) {
        self.api = api; self.now = now; self.read = read
    }
    public func bind(_ value: Binding?) {
        guard binding != value else { return }
        binding = value; generation += 1; state = nil; busy = false
    }
    @discardableResult public func recover() async throws -> DeletionReceiptAPI.State {
        state = nil
        guard let binding else { throw CloudError.authenticationRequired }
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard binding.requestID != zero, binding.userID != zero, binding.revision != zero,
              binding.inventoryDigest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              binding.expiresAt.timeIntervalSince1970.isFinite,
              binding.expiresAt > now() else { throw CloudError.invalidInput }
        try Task.checkCancellation()
        guard !busy else { throw CloudError.unavailable }
        let expected = generation
        busy = true; state = nil
        defer { if generation == expected { busy = false } }
        // A missing record stops recovery; do not generate a replacement token.
        guard let saved = try read(binding), saved.requestID == binding.requestID,
              saved.userID == binding.userID, saved.inventoryDigest == binding.inventoryDigest,
              saved.expiresAt == binding.expiresAt else { throw CloudError.unavailable }
        try Task.checkCancellation()
        guard generation == expected else { throw CloudError.authenticationRequired }
        let result = try await api.status(requestID: saved.requestID, receiptToken: saved.token)
        try Task.checkCancellation()
        guard generation == expected, self.binding == binding else { throw CloudError.authenticationRequired }
        guard binding.expiresAt > now() else { throw CloudError.unavailable }
        state = result
        return result
    }
}
