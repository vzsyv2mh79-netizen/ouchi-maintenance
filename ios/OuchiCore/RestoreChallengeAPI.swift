import Foundation

private final class RestoreChallengeRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// Fixed authenticated challenge transport. Callers use the own-device SDK pair;
/// the server independently verifies its signatures and registered key. No
/// assertion commit, ownership transfer, entitlement or automatic retry here.
public struct RestoreChallengeAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let identity: AppAttestRegistrationAPI
    private let now: @Sendable () -> Int64
    private let endpoint = URL(string: "https://ouchi-maintenance.vercel.app/api/billing/restore/challenge")!
    public init(currentSession: @escaping AppAttestRegistrationAPI.CurrentSession,
                transport: HouseholdAPI.Transport? = nil,
                now: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.now = now
        self.identity = AppAttestRegistrationAPI(currentSession: currentSession, now: now)
        self.transport = transport ?? { request in
            let session = URLSession(configuration: .ephemeral, delegate: RestoreChallengeRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (stream,response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in stream { try Task.checkCancellation(); guard data.count < 4096 else { throw CloudError.malformedResponse }; data.append(byte) }
            return (data,response)
        }
    }
    public func validate(_ captured: AppAttestRegistrationSession) async throws { try await identity.validate(captured) }
    public func challenge(captured: AppAttestRegistrationSession, requestID: UUID,
                          signedAppTransaction: String, signedTransaction: String) async throws -> RestoreAssertionChallenge {
        try await validate(captured)
        guard requestID != UUID(uuidString: "00000000-0000-0000-0000-000000000000")! else { throw CloudError.invalidInput }
        let digest = try RestoreAssertionChallenge.pairDigest(signedApp: signedAppTransaction, signedTransaction: signedTransaction)
        let scope = RestoreAssertionScope(userID: captured.scope.userID, sessionID: captured.scope.sessionID,
            epochID: captured.scope.epochID, keyID: captured.scope.keyID, appID: captured.scope.appID,
            environment: captured.scope.environment, requestID: requestID, proofSHA256: digest)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(["requestID": requestID.uuidString.lowercased(), "keyID": captured.scope.keyID,
            "signedAppTransaction": signedAppTransaction, "signedTransaction": signedTransaction])
        guard data.count <= 262144 else { throw CloudError.invalidInput }
        var request = URLRequest(url: endpoint); request.httpMethod = "POST"; request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalCacheData; request.httpShouldHandleCookies = false
        request.setValue("Bearer " + captured.bearer, forHTTPHeaderField: "Authorization")
        request.setValue(captured.scope.epochID.uuidString.lowercased(), forHTTPHeaderField: "X-Ouchi-App-Epoch")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = data
        try await validate(captured)
        let (body,response) = try await transport(request)
        try await validate(captured)
        guard response.url == endpoint, body.count <= 4096, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { if response.statusCode == 401 { throw CloudError.authenticationRequired }; throw CloudError.rejected(response.statusCode) }
        guard response.mimeType == "application/json", response.value(forHTTPHeaderField: "Cache-Control") == "no-store",
              let object = try JSONSerialization.jsonObject(with: body) as? [String: Any], Set(object.keys) == Set(["clientDataBase64"]),
              let encoded = object["clientDataBase64"] as? String, !encoded.isEmpty, encoded.utf8.count <= 2732,
              let canonical = Data(base64Encoded: encoded), canonical.base64EncodedString() == encoded else { throw CloudError.malformedResponse }
        let result = try RestoreAssertionChallenge.parse(canonicalClientData: canonical, expected: scope, nowMilliseconds: now())
        try await validate(captured)
        return result
    }
}
