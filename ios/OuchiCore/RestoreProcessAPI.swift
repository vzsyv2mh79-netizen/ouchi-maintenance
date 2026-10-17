import Foundation

private final class RestoreProcessRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// Executes only an existing scoped server-ledger reservation. The server
/// persists an unknown mutation marker before Apple and never repeats that PUT.
/// Returned completion is process status, never current premium entitlement.
public struct RestoreProcessAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let identity: AppAttestRegistrationAPI
    private let now: @Sendable () -> Int64
    private let endpoint = URL(string: "https://ouchi-maintenance.vercel.app/api/billing/restore/process")!
    public init(currentSession: @escaping AppAttestRegistrationAPI.CurrentSession,
                transport: HouseholdAPI.Transport? = nil,
                now: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.now = now
        self.identity = AppAttestRegistrationAPI(currentSession: currentSession, now: now)
        self.transport = transport ?? { request in
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForRequest = 60
            configuration.timeoutIntervalForResource = 65
            let session = URLSession(configuration: configuration, delegate: RestoreProcessRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (stream,response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in stream { try Task.checkCancellation(); guard data.count < 4096 else { throw CloudError.malformedResponse }; data.append(byte) }
            return (data,response)
        }
    }
    public func validate(_ captured: AppAttestRegistrationSession) async throws { try await identity.validate(captured) }
    public enum Status: String, Sendable { case pending, complete }
    public func process(captured: AppAttestRegistrationSession, requestID: UUID,
                       pairSHA256: String, assertionSHA256: String) async throws -> Status {
        try await validate(captured)
        let allowed = Set("0123456789abcdef".utf8)
        guard requestID != UUID(uuidString: "00000000-0000-0000-0000-000000000000")!,
              [pairSHA256, assertionSHA256].allSatisfy({ $0.utf8.count == 64 && $0.utf8.allSatisfy { allowed.contains($0) } }) else { throw CloudError.invalidInput }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(["requestID": requestID.uuidString.lowercased(), "pairSHA256": pairSHA256, "assertionSHA256": assertionSHA256])
        guard data.count <= 1024 else { throw CloudError.invalidInput }
        var request = URLRequest(url: endpoint); request.httpMethod = "POST"; request.timeoutInterval = 60
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
              let object = try JSONSerialization.jsonObject(with: body) as? [String: Any], Set(object.keys) == Set(["requestID", "status"]),
              object["requestID"] as? String == requestID.uuidString.lowercased(),
              let text = object["status"] as? String, let status = Status(rawValue: text) else { throw CloudError.malformedResponse }
        try await validate(captured)
        return status
    }
}
