import Foundation

private final class ReceiptRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// Prepared receipt transport. Server route remains undeployed. Possession grants
/// only a fixed request's status read; this API never starts or repeats deletion.
public struct DeletionReceiptAPI: Sendable {
    public enum State: String, Decodable, Sendable { case complete, unconfirmed }
    private let transport: HouseholdAPI.Transport
    private let origin: String
    public init(isolatedDevelopment: Bool = false, loopbackPort: UInt16 = 3000, transport: HouseholdAPI.Transport? = nil) {
        #if DEBUG
        origin = isolatedDevelopment && loopbackPort > 0 ? "http://127.0.0.1:\(loopbackPort)" : "https://ouchi-maintenance.vercel.app"
        #else
        origin = "https://ouchi-maintenance.vercel.app"
        #endif
        self.transport = transport ?? { request in
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForResource = 20
            let session = URLSession(configuration: configuration, delegate: ReceiptRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in bytes { try Task.checkCancellation(); guard data.count < 4096 else { throw CloudError.malformedResponse }; data.append(byte) }
            return (data, response)
        }
    }
    /// Device must persist token and deadline before this call. Exact repeat is
    /// safe after a lost reply; changing either is not an implicit rotation.
    public func register(requestID: UUID, receiptToken: String, expiresAt: Date, bearer: String?) async throws {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard expiresAt.timeIntervalSince1970.isFinite else { throw CloudError.invalidInput }
        let deadline = formatter.string(from: expiresAt)
        let body = try JSONEncoder().encode(["expiresAt": deadline])
        let data = try await send(requestID: requestID, receiptToken: receiptToken, bearer: bearer, body: body)
        struct Registered: Decodable { let registered: Bool; let expiresAt: String }
        let result = try JSONDecoder().decode(Registered.self, from: data)
        guard result.registered, result.expiresAt == deadline else { throw CloudError.malformedResponse }
    }
    public func status(requestID: UUID, receiptToken: String) async throws -> State {
        let data = try await send(requestID: requestID, receiptToken: receiptToken, bearer: nil, body: nil)
        struct Result: Decodable { let state: State; let notification: String? }
        let result = try JSONDecoder().decode(Result.self, from: data)
        guard result.notification == nil || result.notification == "unconfirmed" else { throw CloudError.malformedResponse }
        return result.state
    }
    private func send(requestID: UUID, receiptToken: String, bearer: String?, body: Data?) async throws -> Data {
        guard requestID != UUID(uuidString: "00000000-0000-0000-0000-000000000000"),
              receiptToken.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw CloudError.invalidInput }
        if let bearer { guard !bearer.isEmpty, bearer.count <= 16384, !bearer.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired } }
        try Task.checkCancellation()
        let url = URL(string: origin + "/api/account/deletion/" + requestID.uuidString.lowercased() + "/receipt")!
        var request = URLRequest(url: url)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(receiptToken, forHTTPHeaderField: "X-Deletion-Receipt")
        if let bearer { request.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        request.httpBody = body
        let (data, response) = try await transport(request)
        try Task.checkCancellation()
        guard response.url == url, data.count <= 4096 else { throw CloudError.malformedResponse }
        if response.statusCode == 401 { throw CloudError.authenticationRequired }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        return data
    }
}
