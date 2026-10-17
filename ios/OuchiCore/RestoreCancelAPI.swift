import Foundation

private final class RestoreCancelRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// A scoped server cancellation receipt only. Missing/error outcomes preserve
/// the original proof; no paid access or replacement request is authorized here.
public struct RestoreCancelAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let identity: AppAttestRegistrationAPI
    private let now: @Sendable () -> Int64
    private let endpoint = URL(string: "https://ouchi-maintenance.vercel.app/api/billing/restore/cancel")!
    public init(currentSession: @escaping AppAttestRegistrationAPI.CurrentSession,
                transport: HouseholdAPI.Transport? = nil,
                now: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.now = now
        self.identity = AppAttestRegistrationAPI(currentSession: currentSession, now: now)
        self.transport = transport ?? { request in
            // Bound the entire response, including a peer that trickles bytes.
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForResource = 20
            let session = URLSession(configuration: configuration, delegate: RestoreCancelRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (stream,response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in stream { try Task.checkCancellation(); guard data.count < 4096 else { throw CloudError.malformedResponse }; data.append(byte) }
            return (data,response)
        }
    }
    public func validate(_ captured: AppAttestRegistrationSession) async throws { try await identity.validate(captured) }
    public struct Receipt: Sendable {
        public let requestID: UUID
        public let scope: AppAttestRegistrationScope
        public let pairSHA256: String
        public let assertionSHA256: String
        fileprivate init(requestID: UUID, scope: AppAttestRegistrationScope, pairSHA256: String, assertionSHA256: String) {
            self.requestID = requestID; self.scope = scope
            self.pairSHA256 = pairSHA256; self.assertionSHA256 = assertionSHA256
        }
    }
    public func cancelUnreserved(pending: PendingRestore, captured: AppAttestRegistrationSession) async throws -> Receipt {
        try await validate(captured)
        guard pending.scope == captured.scope else { throw CloudError.invalidInput }
        let requestID = pending.challenge.requestID
        let pairSHA256 = try pending.pairSHA256, assertionSHA256 = pending.assertionSHA256
        let allowed = Set("0123456789abcdef".utf8)
        guard requestID != UUID(uuidString: "00000000-0000-0000-0000-000000000000")!,
              [pairSHA256, assertionSHA256].allSatisfy({ $0.utf8.count == 64 && $0.utf8.allSatisfy { allowed.contains($0) } }) else { throw CloudError.invalidInput }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(["requestID": requestID.uuidString.lowercased(), "keyID": captured.scope.keyID, "pairSHA256": pairSHA256, "assertionSHA256": assertionSHA256])
        guard data.count <= 1024 else { throw CloudError.invalidInput }
        var request = URLRequest(url: endpoint); request.httpMethod = "POST"; request.timeoutInterval = 15
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
              let object = try JSONSerialization.jsonObject(with: body) as? [String: Any], Set(object.keys) == Set(["requestID", "status", "pairSHA256", "assertionSHA256"]),
              object["requestID"] as? String == requestID.uuidString.lowercased(),
              object["status"] as? String == "cancelled",
              object["pairSHA256"] as? String == pairSHA256,
              object["assertionSHA256"] as? String == assertionSHA256 else { throw CloudError.malformedResponse }
        try await validate(captured)
        return Receipt(requestID: requestID, scope: captured.scope, pairSHA256: pairSHA256, assertionSHA256: assertionSHA256)
    }
}
