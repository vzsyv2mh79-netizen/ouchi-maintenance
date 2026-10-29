import Foundation

public enum HomeHandoffState: String, Sendable { case pending, expired, cancelled, completed }
public enum HomeHandoffAuthenticationError: Error, Equatable, Sendable { case additionalVerificationRequired }
public struct HomeHandoffStatus: Equatable, Sendable {
    public let requestID: UUID
    public let homeID: UUID
    public let state: HomeHandoffState
    public let expiresAt: Date

    static func decode(_ data: Data, requestID: UUID, homeID: UUID) throws -> Self {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(value.keys) == ["requestID", "homeID", "state", "expiresAt"],
              let rawRequest = value["requestID"] as? String, UUID(uuidString: rawRequest) == requestID,
              let rawHome = value["homeID"] as? String, UUID(uuidString: rawHome) == homeID,
              let rawState = value["state"] as? String, let state = HomeHandoffState(rawValue: rawState),
              let rawDate = value["expiresAt"] as? String else { throw CloudError.malformedResponse }
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = format.date(from: rawDate)
        if date == nil { format.formatOptions = [.withInternetDateTime]; date = format.date(from: rawDate) }
        guard let date, date.timeIntervalSince1970.isFinite else { throw CloudError.malformedResponse }
        return Self(requestID: requestID, homeID: homeID, state: state, expiresAt: date)
    }
}

private final class HandoffRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// Prepared contract. A shipping server route and current MFA verifier are still required.
public struct HomeHandoffAPI: Sendable {
    private let origin: String?
    private let transport: HouseholdAPI.Transport
    public init(server: BillingServer = .production, environment: BillingEnvironment = .production,
                isolatedDevelopment: Bool = false, loopbackPort: UInt16 = 3000,
                transport: HouseholdAPI.Transport? = nil) {
        #if DEBUG
        origin = isolatedDevelopment && server == .production && loopbackPort > 0
            ? "http://127.0.0.1:\(loopbackPort)" : server.origin(environment: environment)
        #else
        origin = server.origin(environment: environment)
        #endif
        self.transport = transport ?? { request in
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForResource = 35
            let session = URLSession(configuration: configuration, delegate: HandoffRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in bytes {
                try Task.checkCancellation()
                guard data.count < 4096 else { throw CloudError.malformedResponse }
                data.append(byte)
            }
            return (data, response)
        }
    }
    public func create(requestID: UUID, homeID: UUID, recipientID: UUID, epochID: UUID, token: String) async throws -> HomeHandoffStatus {
        guard valid(recipientID) else { throw CloudError.invalidInput }
        return try await send(method: "POST", requestID: requestID, homeID: homeID, epochID: epochID, token: token,
                              body: ["homeID": homeID.uuidString.lowercased(), "recipientID": recipientID.uuidString.lowercased()])
    }
    public func read(requestID: UUID, homeID: UUID, epochID: UUID, token: String) async throws -> HomeHandoffStatus {
        try await send(method: "GET", requestID: requestID, homeID: homeID, epochID: epochID, token: token, body: nil)
    }
    public func decide(accept: Bool, requestID: UUID, homeID: UUID, epochID: UUID, token: String) async throws -> HomeHandoffStatus {
        let value = try await send(method: "PUT", requestID: requestID, homeID: homeID, epochID: epochID, token: token, body: ["accept": accept])
        guard value.state == (accept ? .completed : .cancelled) else { throw CloudError.malformedResponse }
        return value
    }
    private func valid(_ id: UUID) -> Bool { id != UUID(uuidString: "00000000-0000-0000-0000-000000000000")! }
    private func send(method: String, requestID: UUID, homeID: UUID, epochID: UUID, token: String, body: [String: Any]?) async throws -> HomeHandoffStatus {
        // Fail before transporting a bearer, password or saved read capability.
        guard let origin else { throw CloudError.invalidInput }
        guard valid(requestID), valid(homeID), valid(epochID) else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        let url = URL(string: origin + "/api/family/handoff/" + requestID.uuidString.lowercased())!
        var request = URLRequest(url: url)
        request.httpMethod = method; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue(epochID.uuidString.lowercased(), forHTTPHeaderField: "X-Ouchi-App-Epoch")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await transport(request)
        try Task.checkCancellation()
        guard response.url == url, data.count <= 4096 else { throw CloudError.malformedResponse }
        if response.statusCode == 401 { throw CloudError.authenticationRequired }
        // A successful ownership result must satisfy the private handler's
        // JSON/no-store contract. Never promote an HTML or cacheable response.
        if response.statusCode == 200 {
            guard response.expectedContentLength <= 4096, response.mimeType == "application/json",
                  response.value(forHTTPHeaderField: "Cache-Control")?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "no-store" else { throw CloudError.malformedResponse }
            if let declared = response.value(forHTTPHeaderField: "Content-Length") {
                guard !declared.isEmpty, declared.allSatisfy({ $0.isASCII && $0.isNumber }),
                      Int(declared) == data.count else { throw CloudError.malformedResponse }
            }
        }
        if response.statusCode == 403,
           let refusal = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           Set(refusal.keys) == ["error", "code"],
           refusal["error"] as? String == "Additional verification required",
           refusal["code"] as? String == "additional_verification_required" {
            throw HomeHandoffAuthenticationError.additionalVerificationRequired
        }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        return try HomeHandoffStatus.decode(data, requestID: requestID, homeID: homeID)
    }
}
