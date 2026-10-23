import Foundation
import DeviceCheck

/// Uses an already registered key. It never generates a new key, grants rights,
/// consumes a nonce or changes ownership. Caller must capture the own-device
/// StoreKit pair and use authenticated transport; the server verifies everything.
public struct RestoreAssertionDeviceService: Sendable {
    public typealias Completion = @Sendable (Data?, (any Error)?) -> Void
    public struct Operations: Sendable {
        public let supported: @Sendable () -> Bool
        public let generate: @Sendable (String, Data, @escaping Completion) -> Void
        public init(supported: @escaping @Sendable () -> Bool,
                    generate: @escaping @Sendable (String, Data, @escaping Completion) -> Void) {
            self.supported = supported; self.generate = generate
        }
        public static let device = Operations(supported: { DCAppAttestService.shared.isSupported },
            generate: { DCAppAttestService.shared.generateAssertion($0, clientDataHash: $1, completionHandler: $2) })
    }
    private let operations: Operations
    public init(operations: Operations = .device) { self.operations = operations }
    public func generate(challenge: RestoreAssertionChallenge, scope: RestoreAssertionScope,
                         validateCurrentScope: @Sendable () async throws -> Void,
                         now: @Sendable () -> Int64) async throws -> Data {
        try Task.checkCancellation()
        try await validateCurrentScope()
        _ = try RestoreAssertionChallenge.parse(canonicalClientData: challenge.clientData,
            expected: scope, nowMilliseconds: now())
        try Task.checkCancellation()
        guard operations.supported() else { throw CloudError.unavailable }
        let assertion: Data = try await withCheckedThrowingContinuation { continuation in
            operations.generate(scope.keyID, challenge.clientDataHash) { value, error in
                if let error { continuation.resume(throwing: error) }
                else if let value { continuation.resume(returning: value) }
                else { continuation.resume(throwing: CloudError.malformedResponse) }
            }
        }
        // Apple operations cannot be cancelled. Discarding an unsent assertion
        // may advance the device counter; server consumption must allow a jump,
        // never a replay. This method performs no network request or retry.
        try Task.checkCancellation()
        try await validateCurrentScope()
        _ = try RestoreAssertionChallenge.parse(canonicalClientData: challenge.clientData,
            expected: scope, nowMilliseconds: now())
        try Task.checkCancellation()
        guard !assertion.isEmpty, assertion.count <= 131072 else { throw CloudError.malformedResponse }
        return assertion
    }
}
