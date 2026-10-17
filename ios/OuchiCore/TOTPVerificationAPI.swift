import Foundation

public struct TOTPFactor: Equatable, Sendable { public let id: UUID }
public struct TOTPChallenge: Equatable, Sendable {
    public let factorID: UUID
    public let id: UUID
    public let expiresAt: Date
}
private final class TOTPRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
/// Existing verified TOTP factors only; never enrolls, removes, or bypasses MFA.
public struct TOTPVerificationAPI: Sendable {
    private let config: CloudConfiguration
    private let transport: HouseholdAPI.Transport
    public init(config: CloudConfiguration, transport: HouseholdAPI.Transport? = nil) {
        self.config = config
        self.transport = transport ?? { request in
            let configuration = URLSessionConfiguration.ephemeral; configuration.timeoutIntervalForResource = 25
            let session = URLSession(configuration: configuration, delegate: TOTPRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in bytes { try Task.checkCancellation(); guard data.count < 65536 else { throw CloudError.malformedResponse }; data.append(byte) }
            return (data, response)
        }
    }
    public func factors(token: String, accountID: UUID) async throws -> [TOTPFactor] {
        let data = try await send(path: "user", token: token)
        struct User: Decodable {
            struct Factor: Decodable { let id: UUID; let factor_type: String; let status: String }
            let id: UUID; let factors: [Factor]?
        }
        let user = try JSONDecoder().decode(User.self, from: data)
        guard user.id == accountID else { throw CloudError.authenticationRequired }
        let factors = user.factors ?? []
        guard factors.count <= 10, Set(factors.map(\.id)).count == factors.count else { throw CloudError.malformedResponse }
        return factors.filter { $0.factor_type == "totp" && $0.status == "verified" }.map { TOTPFactor(id: $0.id) }
    }
    public func challenge(factorID: UUID, token: String, accountID: UUID, now: Date = Date()) async throws -> TOTPChallenge {
        guard try await factors(token: token, accountID: accountID).contains(where: { $0.id == factorID }) else { throw CloudError.authenticationRequired }
        let data = try await send(path: "factors/" + factorID.uuidString.lowercased() + "/challenge", token: token, body: Data("{}".utf8))
        struct Result: Decodable { let id: UUID; let type: String; let expires_at: Double }
        let result = try JSONDecoder().decode(Result.self, from: data)
        guard result.type == "totp", result.id != UUID(uuidString: "00000000-0000-0000-0000-000000000000"),
              result.expires_at.isFinite, result.expires_at > now.timeIntervalSince1970 else { throw CloudError.malformedResponse }
        return .init(factorID: factorID, id: result.id, expiresAt: Date(timeIntervalSince1970: result.expires_at))
    }
    public func verify(_ challenge: TOTPChallenge, code: String, token: String, accountID: UUID, now: Date = Date()) async throws -> Session {
        guard code.utf8.count == 6, code.utf8.allSatisfy({ (48...57).contains($0) }), challenge.expiresAt > now else { throw CloudError.invalidInput }
        let body = try JSONEncoder().encode(["challenge_id": challenge.id.uuidString.lowercased(), "code": code])
        let data = try await send(path: "factors/" + challenge.factorID.uuidString.lowercased() + "/verify", token: token, body: body)
        struct Result: Decodable { let access_token: String; let refresh_token: String; let expires_in: Double; let user: Session.User }
        let value = try JSONDecoder().decode(Result.self, from: data)
        guard value.user.id == accountID, !value.access_token.isEmpty, !value.refresh_token.isEmpty,
              value.access_token.utf8.count <= 16384, value.refresh_token.utf8.count <= 16384,
              !value.access_token.contains(where: { $0.isWhitespace }), !value.refresh_token.contains(where: { $0.isWhitespace }),
              value.expires_in.isFinite, value.expires_in > 0, value.expires_in <= 86400 else { throw CloudError.malformedResponse }
        // The operation server must still verify current policy/session assurance.
        return Session(access_token: value.access_token, refresh_token: value.refresh_token,
                       expires_at: Date().timeIntervalSince1970 + value.expires_in, user: value.user)
    }
    private func send(path: String, token: String, body: Data? = nil) async throws -> Data {
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        let url = config.url.appendingPathComponent("auth/v1/" + path)
        var request = URLRequest(url: url); request.httpMethod = body == nil ? "GET" : "POST"
        request.timeoutInterval = 20; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        if let body { request.httpBody = body; request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await transport(request); try Task.checkCancellation()
        guard response.url == url, data.count <= 65536 else { throw CloudError.malformedResponse }
        if response.statusCode == 401 { throw CloudError.authenticationRequired }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        return data
    }
}
