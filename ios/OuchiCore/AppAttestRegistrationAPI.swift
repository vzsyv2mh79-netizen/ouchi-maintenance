import Foundation
import CoreFoundation

public struct AppAttestRegistrationSession: Equatable, Sendable {
    public let scope: AppAttestRegistrationScope
    public let bearer: String
    public init(scope: AppAttestRegistrationScope, bearer: String) { self.scope = scope; self.bearer = bearer }
}
public struct AppAttestRegistrationReceipt: Equatable, Sendable {
    public let requestID: UUID
    public let scope: AppAttestRegistrationScope
}
private final class AttestRegistrationRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// Prepared transport, not connected to UI or an enabled server endpoint. No
/// DeviceCheck call, key persistence, purchase entitlement or trust flag here.
/// Caller must retain the exact attestation for an uncertain commit retry; an
/// expired challenge requires the separately implemented fresh-key lifecycle.
public struct AppAttestRegistrationAPI: Sendable {
    public typealias CurrentSession = @Sendable () async -> AppAttestRegistrationSession?
    private let transport: HouseholdAPI.Transport
    private let currentSession: CurrentSession
    private let now: @Sendable () -> Int64
    private let endpoint = URL(string: "https://ouchi-maintenance.vercel.app/api/app-attest/registration")!
    public init(currentSession: @escaping CurrentSession, transport: HouseholdAPI.Transport? = nil,
                now: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.currentSession = currentSession; self.now = now
        self.transport = transport ?? { request in
            let session = URLSession(configuration: .ephemeral, delegate: AttestRegistrationRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (stream, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in stream { try Task.checkCancellation(); guard data.count < 4096 else { throw CloudError.malformedResponse }; data.append(byte) }
            return (data, response)
        }
    }
    public func challenge(for captured: AppAttestRegistrationSession, requestID: UUID) async throws -> AppAttestRegistrationChallenge {
        guard requestID != UUID(uuidString: "00000000-0000-0000-0000-000000000000")! else { throw CloudError.invalidInput }
        let object = try await send(path: "challenge", captured: captured, body: ["requestID": requestID.uuidString.lowercased(), "keyID": captured.scope.keyID])
        guard Set(object.keys) == Set(["clientDataBase64"]), let encoded = object["clientDataBase64"] as? String,
              encoded.utf8.count <= 2732, let data = Data(base64Encoded: encoded), data.base64EncodedString() == encoded else { throw CloudError.malformedResponse }
        let result = try AppAttestRegistrationChallenge.parse(canonicalClientData: data, expected: captured.scope, nowMilliseconds: now())
        guard result.requestID == requestID else { throw CloudError.malformedResponse }
        return result
    }
    public func commit(_ challenge: AppAttestRegistrationChallenge, attestation: Data, captured: AppAttestRegistrationSession) async throws -> AppAttestRegistrationReceipt {
        guard !attestation.isEmpty, attestation.count <= 131072 else { throw CloudError.invalidInput }
        _ = try AppAttestRegistrationChallenge.parse(canonicalClientData: challenge.clientData, expected: captured.scope, nowMilliseconds: now())
        let object = try await send(path: "commit", captured: captured, body: ["requestID": challenge.requestID.uuidString.lowercased(), "keyID": captured.scope.keyID, "attestationBase64": attestation.base64EncodedString()])
        guard Set(object.keys) == Set(["requestID","userID","sessionID","epochID","keyID","appID","attestEnvironment","registered"]),
              let registered = object["registered"] as? NSNumber, CFGetTypeID(registered) == CFBooleanGetTypeID(), registered.boolValue,
              object["requestID"] as? String == challenge.requestID.uuidString.lowercased(),
              object["userID"] as? String == captured.scope.userID.uuidString.lowercased(),
              object["sessionID"] as? String == captured.scope.sessionID.uuidString.lowercased(),
              object["epochID"] as? String == captured.scope.epochID.uuidString.lowercased(),
              object["keyID"] as? String == captured.scope.keyID, object["appID"] as? String == captured.scope.appID,
              object["attestEnvironment"] as? String == captured.scope.environment else { throw CloudError.malformedResponse }
        _ = try AppAttestRegistrationChallenge.parse(canonicalClientData: challenge.clientData, expected: captured.scope, nowMilliseconds: now())
        return AppAttestRegistrationReceipt(requestID: challenge.requestID, scope: captured.scope)
    }
    func validate(_ captured: AppAttestRegistrationSession) async throws {
        try Task.checkCancellation()
        guard await currentSession() == captured else { throw CloudError.authenticationRequired }
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard captured.scope.userID != zero, captured.scope.sessionID != zero, captured.scope.epochID != zero,
              captured.scope.userID != captured.scope.epochID,
              ["development","production"].contains(captured.scope.environment),
              captured.scope.appID.range(of: "^[A-Z0-9]{10}\\.[A-Za-z0-9][A-Za-z0-9.-]{1,200}$", options: .regularExpression) != nil,
              captured.scope.keyID.range(of: "^[A-Za-z0-9+/]{43}=$", options: .regularExpression) != nil,
              let key = Data(base64Encoded: captured.scope.keyID), key.count == 32,
              key.base64EncodedString() == captured.scope.keyID else { throw CloudError.invalidInput }
        let bearer = captured.bearer
        guard !bearer.isEmpty, bearer.utf8.count <= 16384, !bearer.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        let parts = bearer.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { throw CloudError.authenticationRequired }
        var payload = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
        guard let bytes = Data(base64Encoded: payload), let claims = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              (claims["sub"] as? String).flatMap(UUID.init(uuidString:)) == captured.scope.userID,
              (claims["session_id"] as? String).flatMap(UUID.init(uuidString:)) == captured.scope.sessionID,
              let expiry = claims["exp"] as? NSNumber, CFGetTypeID(expiry) != CFBooleanGetTypeID(), expiry.doubleValue.isFinite,
              expiry.doubleValue * 1000 > Double(now()) else { throw CloudError.authenticationRequired }
        // Payload checks only bind transport to the captured session. Server
        // signature, live Auth and enrollment checks remain mandatory.
        try Task.checkCancellation()
    }
    private func send(path: String, captured: AppAttestRegistrationSession, body: [String: String]) async throws -> [String: Any] {
        try await validate(captured)
        let target = endpoint.appendingPathComponent(path)
        var request = URLRequest(url: target); request.httpMethod = "POST"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + captured.bearer, forHTTPHeaderField: "Authorization")
        request.setValue(captured.scope.epochID.uuidString.lowercased(), forHTTPHeaderField: "X-Ouchi-App-Epoch")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let encoder = JSONEncoder(); encoder.outputFormatting = .sortedKeys; request.httpBody = try encoder.encode(body)
        try await validate(captured)
        let (data, response) = try await transport(request)
        try await validate(captured)
        guard response.url == target, data.count <= 4096, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { if response.statusCode == 401 { throw CloudError.authenticationRequired }; throw CloudError.rejected(response.statusCode) }
        guard response.mimeType == "application/json", response.value(forHTTPHeaderField: "Cache-Control") == "no-store",
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw CloudError.malformedResponse }
        return object
    }
}
