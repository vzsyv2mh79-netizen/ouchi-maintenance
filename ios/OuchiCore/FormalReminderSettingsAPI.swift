import Foundation

private final class FormalReminderRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// The production endpoint remains disabled until release approval. No arbitrary
/// host or redirect may receive the user's bearer token.
public struct FormalReminderSettingsAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let endpoint: URL?
    private let environment: BillingEnvironment
    public init(environment: BillingEnvironment, server: BillingServer = .production, isolatedDevelopment: Bool = false, loopbackPort: UInt16 = 3000,
                transport: HouseholdAPI.Transport? = nil) {
        self.environment = environment
        let reviewed = server.origin(environment: environment).flatMap { URL(string: $0 + "/api/reminder-settings") }
        #if DEBUG
        endpoint = isolatedDevelopment && server == .production && environment == .sandbox && loopbackPort > 0
            ? URL(string: "http://127.0.0.1:\(loopbackPort)/api/reminder-settings")! : reviewed
        #else
        endpoint = reviewed
        #endif
        self.transport = transport ?? { request in
            let session = URLSession(configuration: .ephemeral, delegate: FormalReminderRedirectBlocker(), delegateQueue: nil)
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
    public func load(epoch: UUID, token: String) async throws -> ReminderSettingsReceipt {
        try await send(epoch: epoch, token: token, body: nil)
    }
    public func save(_ schedule: ReminderSchedule, revision: Int, epoch: UUID, token: String) async throws -> ReminderSettingsReceipt {
        guard (0..<9_007_199_254_740_991).contains(revision) else { throw CloudError.invalidInput }
        struct Input: Encodable { let revision: Int; let schedule: ReminderSchedule }
        let receipt = try await send(epoch: epoch, token: token, body: JSONEncoder().encode(Input(revision: revision, schedule: schedule)))
        guard receipt.revision == revision + 1, receipt.saved == schedule else { throw CloudError.malformedResponse }
        return receipt
    }
    private func send(epoch: UUID, token: String, body: Data?) async throws -> ReminderSettingsReceipt {
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
        // Require an explicit saved:null for the first revision, rather than
        // treating a missing server field as an authoritative empty preference.
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(object.keys) == Set(["environment", "salesEnabled", "revision", "saved", "effective", "premiumActive", "purchaseAccountToken"]) else {
            throw CloudError.malformedResponse
        }
        guard let value = object["purchaseAccountToken"] as? String, UUID(uuidString: value) == epoch else { throw CloudError.malformedResponse }
        let receipt = try JSONDecoder().decode(ReminderSettingsReceipt.self, from: data)
        guard receipt.environment == environment.rawValue, !receipt.salesEnabled,
              (0...9_007_199_254_740_991).contains(receipt.revision),
              (receipt.revision == 0) == (receipt.saved == nil),
              receipt.effective == (receipt.premiumActive ? (receipt.saved ?? .free) : .free) else {
            throw CloudError.malformedResponse
        }
        return receipt
    }
}
