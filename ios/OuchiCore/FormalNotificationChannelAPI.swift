import Foundation

public enum NotificationChannel: String, Codable, CaseIterable, Sendable { case web, native, both }
public struct NotificationChannelReceipt: Codable, Equatable, Sendable {
    public let environment: String
    public let revision: Int
    public let channel: NotificationChannel
    public let nativeRegistered: Bool
    public let purchaseAccountToken: UUID
}

private final class FormalChannelRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// The production endpoint remains disabled until release approval. No arbitrary
/// host or redirect may receive the user's bearer token.
public struct FormalNotificationChannelAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let endpoint: URL?
    private let environment: BillingEnvironment
    public init(environment: BillingEnvironment, server: BillingServer = .production, isolatedDevelopment: Bool = false, loopbackPort: UInt16 = 3000,
                transport: HouseholdAPI.Transport? = nil) {
        self.environment = environment
        let reviewed = server.origin(environment: environment).flatMap { URL(string: $0 + "/api/notification-channel") }
        #if DEBUG
        endpoint = isolatedDevelopment && server == .production && environment == .sandbox && loopbackPort > 0
            ? URL(string: "http://127.0.0.1:\(loopbackPort)/api/notification-channel")! : reviewed
        #else
        endpoint = reviewed
        #endif
        self.transport = transport ?? { request in
            let session = URLSession(configuration: .ephemeral, delegate: FormalChannelRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (stream, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in stream {
                try Task.checkCancellation()
                guard data.count < 4096 else { throw CloudError.malformedResponse }
                data.append(byte)
            }
            return (data, response)
        }
    }
    public func load(epoch: UUID, token: String) async throws -> NotificationChannelReceipt {
        try await send(epoch: epoch, token: token, body: nil)
    }
    public func save(_ channel: NotificationChannel, revision: Int, epoch: UUID, token: String) async throws -> NotificationChannelReceipt {
        guard (0..<9_007_199_254_740_991).contains(revision) else { throw CloudError.invalidInput }
        struct Input: Encodable { let revision: Int; let channel: NotificationChannel }
        let receipt = try await send(epoch: epoch, token: token, body: JSONEncoder().encode(Input(revision: revision, channel: channel)))
        guard receipt.revision == revision + 1, receipt.channel == channel else { throw CloudError.malformedResponse }
        return receipt
    }
    private func send(epoch: UUID, token: String, body: Data?) async throws -> NotificationChannelReceipt {
        guard let endpoint else { throw CloudError.invalidInput }
        guard epoch != UUID(uuidString: "00000000-0000-0000-0000-000000000000") else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        let url = endpoint
        var request = URLRequest(url: url)
        request.httpMethod = body == nil ? "GET" : "PUT"
        request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(epoch.uuidString.lowercased(), forHTTPHeaderField: "X-Ouchi-App-Epoch")
        request.httpBody = body
        let (data, response) = try await transport(request)
        try Task.checkCancellation()
        guard response.url == url, data.count <= 4096, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else {
            if response.statusCode == 401 { throw CloudError.authenticationRequired }
            throw CloudError.rejected(response.statusCode)
        }
        guard response.mimeType == "application/json", response.value(forHTTPHeaderField: "Cache-Control") == "no-store" else { throw CloudError.malformedResponse }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(object.keys) == Set(["environment", "revision", "channel", "nativeRegistered", "purchaseAccountToken"]),
              let value = object["purchaseAccountToken"] as? String, UUID(uuidString: value) == epoch else {
            throw CloudError.malformedResponse
        }
        if let length = response.value(forHTTPHeaderField: "Content-Length") {
            guard !length.isEmpty, length.allSatisfy({ $0.isASCII && $0.isNumber }), Int(length) == data.count else { throw CloudError.malformedResponse }
        }
        let receipt: NotificationChannelReceipt
        do { receipt = try JSONDecoder().decode(NotificationChannelReceipt.self, from: data) }
        catch { throw CloudError.malformedResponse }
        guard receipt.environment == environment.rawValue,
              (0...9_007_199_254_740_991).contains(receipt.revision),
              receipt.revision != 0 || receipt.channel == .both else { throw CloudError.malformedResponse }
        return receipt
    }
}
