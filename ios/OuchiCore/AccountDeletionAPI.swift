import Foundation

private final class DeletionRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// Prepared client only. No deletion screen or production server route is enabled.
public struct AccountDeletionAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let origin: String
    public init(isolatedDevelopment: Bool = false, loopbackPort: UInt16 = 3000,
                transport: HouseholdAPI.Transport? = nil) {
        #if DEBUG
        origin = isolatedDevelopment && loopbackPort > 0
            ? "http://127.0.0.1:\(loopbackPort)" : "https://ouchi-maintenance.vercel.app"
        #else
        origin = "https://ouchi-maintenance.vercel.app"
        #endif
        self.transport = transport ?? { request in
            // Bound the entire response, including a peer that trickles bytes.
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForResource = 35
            let session = URLSession(configuration: configuration, delegate: DeletionRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in bytes {
                try Task.checkCancellation()
                guard data.count < 4096 else { throw CloudError.malformedResponse }
                data.append(byte)
            }
            return (data, response)
        }
    }
    public func request(password: String, token: String) async throws -> AccountDeletionStatus {
        guard !password.isEmpty, password.count <= 1024 else { throw CloudError.invalidInput }
        let body = try JSONEncoder().encode(["confirmation": "DELETE_OUCHI_ACCOUNT", "password": password])
        guard body.count <= 4096 else { throw CloudError.invalidInput }
        let result = try await send(path: "", token: token, body: body)
        return try AccountDeletionStatus.accepted(result.0, httpStatus: result.1)
    }
    public func progress(requestID: UUID, token: String) async throws -> AccountDeletionStatus {
        guard requestID != UUID(uuidString: "00000000-0000-0000-0000-000000000000") else { throw CloudError.invalidInput }
        let result = try await send(path: "/" + requestID.uuidString.lowercased(), token: token, body: nil)
        return try AccountDeletionStatus.progress(result.0, httpStatus: result.1, expectedRequestID: requestID)
    }
    /// Check this before retrying a request whose server acknowledgement was lost.
    public func currentProgress(token: String, expectedAccountID: UUID? = nil, expectedEpochID: UUID? = nil) async throws -> AccountDeletionStatus? {
        let result = try await send(path: "", token: token, body: nil)
        let object = try JSONSerialization.jsonObject(with: result.0) as? [String: Any]
        if object?["state"] as? String == "not_requested" {
            let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
            guard let account = expectedAccountID, let epoch = expectedEpochID, account != zero, epoch != zero,
                  Set(object!.keys) == ["state", "userID", "epochID"],
                  let user = object?["userID"] as? String, UUID(uuidString: user) == account,
                  let enrollment = object?["epochID"] as? String, UUID(uuidString: enrollment) == epoch else { throw CloudError.malformedResponse }
            return nil
        }
        return try AccountDeletionStatus.currentProgress(result.0, httpStatus: result.1)
    }
    private func send(path: String, token: String, body: Data?) async throws -> (Data, Int) {
        guard !token.isEmpty, token.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        let url = URL(string: origin + "/api/account/deletion" + path)!
        var request = URLRequest(url: url)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (data, response) = try await transport(request)
        try Task.checkCancellation()
        guard response.url == url, data.count <= 4096 else { throw CloudError.malformedResponse }
        if response.statusCode == 401 { throw CloudError.authenticationRequired }
        guard response.statusCode == (body == nil ? 200 : 202) else { throw CloudError.rejected(response.statusCode) }
        return (data, response.statusCode)
    }
}
