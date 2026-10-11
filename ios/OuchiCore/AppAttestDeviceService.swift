import Foundation
import DeviceCheck

/// Prepared DeviceCheck boundary. Completed non-cancellable Apple results are
/// returned even if the waiting task was cancelled so the coordinator can first
/// persist the key reference/proof and then stop. Never grants purchase rights.
public struct AppAttestDeviceService: Sendable {
    public typealias KeyCompletion = @Sendable (String?, (any Error)?) -> Void
    public typealias ProofCompletion = @Sendable (Data?, (any Error)?) -> Void
    public struct Operations: Sendable {
        public let supported: @Sendable () -> Bool
        public let generate: @Sendable (@escaping KeyCompletion) -> Void
        public let attest: @Sendable (String, Data, @escaping ProofCompletion) -> Void
        public init(supported: @escaping @Sendable () -> Bool,
                    generate: @escaping @Sendable (@escaping KeyCompletion) -> Void,
                    attest: @escaping @Sendable (String, Data, @escaping ProofCompletion) -> Void) {
            self.supported = supported; self.generate = generate; self.attest = attest
        }
        public static let device = Operations(supported: { DCAppAttestService.shared.isSupported },
            generate: { DCAppAttestService.shared.generateKey(completionHandler: $0) },
            attest: { DCAppAttestService.shared.attestKey($0, clientDataHash: $1, completionHandler: $2) })
    }
    private let operations: Operations
    public init(operations: Operations = .device) { self.operations = operations }
    public var isSupported: Bool { operations.supported() }
    public func generateKey() async throws -> String {
        try Task.checkCancellation()
        guard operations.supported() else { throw CloudError.unavailable }
        let key: String = try await withCheckedThrowingContinuation { continuation in
            operations.generate { value, error in
                if let error { continuation.resume(throwing: error) }
                else if let value { continuation.resume(returning: value) }
                else { continuation.resume(throwing: CloudError.malformedResponse) }
            }
        }
        guard key.range(of: "^[A-Za-z0-9+/]{43}=$", options: .regularExpression) != nil,
              let bytes = Data(base64Encoded: key), bytes.count == 32, bytes.base64EncodedString() == key else { throw CloudError.malformedResponse }
        return key
    }
    public func attest(_ challenge: AppAttestRegistrationChallenge, scope: AppAttestRegistrationScope, nowMilliseconds: Int64) async throws -> Data {
        try Task.checkCancellation()
        _ = try AppAttestRegistrationChallenge.parse(canonicalClientData: challenge.clientData, expected: scope, nowMilliseconds: nowMilliseconds)
        guard operations.supported() else { throw CloudError.unavailable }
        let proof: Data = try await withCheckedThrowingContinuation { continuation in
            operations.attest(scope.keyID, challenge.clientDataHash) { value, error in
                if let error { continuation.resume(throwing: error) }
                else if let value { continuation.resume(returning: value) }
                else { continuation.resume(throwing: CloudError.malformedResponse) }
            }
        }
        guard !proof.isEmpty, proof.count <= 131072 else { throw CloudError.malformedResponse }
        // Caller must durably stage this completed proof before reacting to
        // cancellation, expiry or changed session. Apple does not cancel it.
        return proof
    }
}
