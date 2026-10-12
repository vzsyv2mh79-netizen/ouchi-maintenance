import Foundation

private final class RestoreCommitRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// Exact retained Sandbox proof submission. Acknowledgement is reservation
/// only, never premium access. No automatic retry or Apple mutation here.
public struct RestoreCommitAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let identity: AppAttestRegistrationAPI
    private let now: @Sendable () -> Int64
    private let endpoint = URL(string: "https://ouchi-maintenance.vercel.app/api/billing/restore/commit")!
    public init(currentSession: @escaping AppAttestRegistrationAPI.CurrentSession,
                transport: HouseholdAPI.Transport? = nil,
                now: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.now = now
        self.identity = AppAttestRegistrationAPI(currentSession: currentSession, now: now)
        self.transport = transport ?? { request in
            let session = URLSession(configuration: .ephemeral, delegate: RestoreCommitRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (stream,response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in stream { try Task.checkCancellation(); guard data.count < 4096 else { throw CloudError.malformedResponse }; data.append(byte) }
            return (data,response)
        }
    }
    public func validate(_ captured: AppAttestRegistrationSession) async throws { try await identity.validate(captured) }
    public struct Accepted: Sendable {
        public let requestID: UUID
        public let scope: AppAttestRegistrationScope
        public let pairSHA256: String
        public let assertionSHA256: String
        fileprivate init(_ pending: PendingRestore) throws {
            requestID = pending.challenge.requestID; scope = pending.scope
            pairSHA256 = try pending.pairSHA256; assertionSHA256 = pending.assertionSHA256
        }
    }
    public func submit(pending: PendingRestore, captured: AppAttestRegistrationSession) async throws -> Accepted {
        try await validate(captured)
        guard pending.scope == captured.scope else { throw CloudError.authenticationRequired }
        let expected = RestoreAssertionScope(userID:pending.scope.userID,sessionID:pending.scope.sessionID,epochID:pending.scope.epochID,
            keyID:pending.scope.keyID,appID:pending.scope.appID,environment:pending.scope.environment,
            requestID:pending.challenge.requestID,proofSHA256:try pending.pairSHA256)
        _ = try RestoreAssertionChallenge.parse(canonicalClientData:pending.challenge.clientData,expected:expected,nowMilliseconds:now())
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys,.withoutEscapingSlashes]
        let data = try encoder.encode(["requestID":pending.challenge.requestID.uuidString.lowercased(),"keyID":pending.scope.keyID,
            "signedAppTransaction":pending.signedAppTransaction,"signedTransaction":pending.signedTransaction,"assertionBase64":pending.assertion.base64EncodedString()])
        guard data.count <= 262144 else { throw CloudError.invalidInput }
        var request = URLRequest(url:endpoint); request.httpMethod = "POST"; request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalCacheData; request.httpShouldHandleCookies = false
        request.setValue("Bearer " + captured.bearer,forHTTPHeaderField:"Authorization")
        request.setValue(captured.scope.epochID.uuidString.lowercased(),forHTTPHeaderField:"X-Ouchi-App-Epoch")
        request.setValue("application/json",forHTTPHeaderField:"Content-Type"); request.httpBody = data
        try await validate(captured)
        let (body,response) = try await transport(request)
        try await validate(captured)
        guard response.url == endpoint,body.count <= 4096,response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
        guard response.statusCode == 202 else { if response.statusCode == 401 { throw CloudError.authenticationRequired }; throw CloudError.rejected(response.statusCode) }
        guard response.mimeType == "application/json",response.value(forHTTPHeaderField:"Cache-Control") == "no-store",
              let object = try JSONSerialization.jsonObject(with:body) as? [String:Any],Set(object.keys) == Set(["requestID","status"]),
              object["requestID"] as? String == pending.challenge.requestID.uuidString.lowercased(),object["status"] as? String == "pending" else { throw CloudError.malformedResponse }
        try await validate(captured)
        return try Accepted(pending)
    }
}
