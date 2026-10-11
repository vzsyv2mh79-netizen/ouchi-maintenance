import Foundation

private final class ReminderRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// Authoritative settings receipt. Expired rights retain saved preferences but
/// must use the free schedule. This Sandbox contract does not enable sales.
public struct ReminderSettingsReceipt: Decodable, Equatable, Sendable {
    public let environment: String
    public let salesEnabled: Bool
    public let revision: Int
    public let saved: ReminderSchedule?
    public let effective: ReminderSchedule
    public let premiumActive: Bool
}

/// The production endpoint remains disabled until release approval. No arbitrary
/// host or redirect may receive the user's bearer token.
public struct ReminderSettingsAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    public init(transport: HouseholdAPI.Transport? = nil) {
        self.transport = transport ?? { request in
            let session = URLSession(configuration: .ephemeral, delegate: ReminderRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (stream, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in stream {
                try Task.checkCancellation()
                guard data.count < 4096 else { throw CloudError.malformedResponse }
                data.append(byte)
            }
            return (data, response)
        }
    }
    public func load(token: String) async throws -> ReminderSettingsReceipt {
        try await send(token: token, body: nil)
    }
    public func save(_ schedule: ReminderSchedule, revision: Int, token: String) async throws -> ReminderSettingsReceipt {
        guard (0..<9_007_199_254_740_991).contains(revision) else { throw CloudError.invalidInput }
        struct Input: Encodable { let revision: Int; let schedule: ReminderSchedule }
        let receipt = try await send(token: token, body: JSONEncoder().encode(Input(revision: revision, schedule: schedule)))
        guard receipt.revision == revision + 1, receipt.saved == schedule else { throw CloudError.malformedResponse }
        return receipt
    }
    private func send(token: String, body: Data?) async throws -> ReminderSettingsReceipt {
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        let url = URL(string: "https://ouchi-maintenance.vercel.app/api/development/reminder-settings")!
        var request = URLRequest(url: url)
        request.httpMethod = body == nil ? "GET" : "PUT"
        request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (data, response) = try await transport(request)
        try Task.checkCancellation()
        guard response.url == url, data.count <= 4096 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else {
            if response.statusCode == 401 { throw CloudError.authenticationRequired }
            throw CloudError.rejected(response.statusCode)
        }
        // Require an explicit saved:null for the first revision, rather than
        // treating a missing server field as an authoritative empty preference.
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(object.keys) == Set(["environment", "salesEnabled", "revision", "saved", "effective", "premiumActive"]) else {
            throw CloudError.malformedResponse
        }
        let receipt = try JSONDecoder().decode(ReminderSettingsReceipt.self, from: data)
        guard receipt.environment == "Sandbox", !receipt.salesEnabled,
              (0...9_007_199_254_740_991).contains(receipt.revision),
              (receipt.revision == 0) == (receipt.saved == nil),
              receipt.effective == (receipt.premiumActive ? (receipt.saved ?? .free) : .free) else {
            throw CloudError.malformedResponse
        }
        return receipt
    }
}
