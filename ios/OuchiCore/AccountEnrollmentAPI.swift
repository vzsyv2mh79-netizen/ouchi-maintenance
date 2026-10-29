import Foundation
import CoreFoundation
public struct EnrollmentState: Equatable, Sendable {
    public let userID: UUID
    public let sessionID: UUID
    public let epochID: UUID?
    public var enrolled: Bool { epochID != nil }
}
private final class EnrollmentRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// The production endpoint remains disabled until release approval. No arbitrary
/// host or redirect may receive the user's bearer token.
public struct AccountEnrollmentAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let endpoint: URL?
    public init(server: BillingServer = .production, environment: BillingEnvironment = .production,
                isolatedDevelopment: Bool = false, loopbackPort: UInt16 = 3000,
                transport: HouseholdAPI.Transport? = nil) {
        let reviewed = server.origin(environment: environment).flatMap { URL(string: $0 + "/api/account/enrollment") }
        #if DEBUG
        endpoint = isolatedDevelopment && server == .production && loopbackPort > 0
            ? URL(string: "http://127.0.0.1:\(loopbackPort)/api/account/enrollment")! : reviewed
        #else
        endpoint = reviewed
        #endif
        self.transport = transport ?? { request in
            let session = URLSession(configuration: .ephemeral, delegate: EnrollmentRedirectBlocker(), delegateQueue: nil)
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
    /// Payload parsing only compares scope; server Auth verification is mandatory.
    private func sessionID(token: String, account: UUID) throws -> UUID {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { throw CloudError.authenticationRequired }
        var encoded = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let bytes = Data(base64Encoded: encoded),
              let value = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              let user = value["sub"] as? String, UUID(uuidString: user) == account,
              let session = value["session_id"] as? String, let id = UUID(uuidString: session), id != Self.zero,
              let expiry = value["exp"] as? Double, expiry.isFinite, expiry > Date().timeIntervalSince1970 else { throw CloudError.authenticationRequired }
        return id
    }
    private static let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
    public func load(account: UUID, token: String) async throws -> EnrollmentState {
        let value = try await send(account: account, token: token, body: nil)
        guard Set(value.keys) == Set(["userID","sessionID","epochID","enrolled"]),
              let boolean = value["enrolled"] as? NSNumber, CFGetTypeID(boolean) == CFBooleanGetTypeID(),
              let enrolled = value["enrolled"] as? Bool else { throw CloudError.malformedResponse }
        let epoch = (value["epochID"] as? String).flatMap(UUID.init(uuidString:))
        guard enrolled ? epoch != nil && epoch != Self.zero : value["epochID"] is NSNull else { throw CloudError.malformedResponse }
        return EnrollmentState(userID: account, sessionID: try sessionID(token: token, account: account), epochID: epoch)
    }
    public func register(account: UUID, token: String, password: String, requestID: UUID) async throws -> UUID {
        guard !password.isEmpty, password.count <= 1024, requestID != Self.zero else { throw CloudError.invalidInput }
        struct Consent: Encodable { let confirmation = "ENROLL_OUCHI_MAINTENANCE"; let password: String; let requestID: String }
        let value = try await send(account: account, token: token, body: JSONEncoder().encode(Consent(password: password, requestID: requestID.uuidString.lowercased())))
        guard Set(value.keys) == Set(["userID","sessionID","epochID","requestID"]),
              let request = value["requestID"] as? String, UUID(uuidString: request) == requestID,
              let epoch = value["epochID"] as? String, let id = UUID(uuidString: epoch), id != Self.zero else { throw CloudError.malformedResponse }
        return id
    }
    private func send(account: UUID, token: String, body: Data?) async throws -> [String: Any] {
        // Refuse a Production/review mismatch before handling credentials or
        // invoking transport, including explicit-consent password submission.
        guard let endpoint, account != Self.zero else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        let expectedSession = try sessionID(token: token, account: account)
        try Task.checkCancellation()
        let url = endpoint
        var request = URLRequest(url: url)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (data, response) = try await transport(request)
        try Task.checkCancellation()
        guard response.url == url, data.count <= 4096, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        guard response.mimeType == "application/json", response.value(forHTTPHeaderField: "Cache-Control") == "no-store" else { throw CloudError.malformedResponse }
        if let length = response.value(forHTTPHeaderField: "Content-Length") {
            guard !length.isEmpty, length.allSatisfy({ $0.isASCII && $0.isNumber }), Int(length) == data.count else { throw CloudError.malformedResponse }
        }
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let user = value["userID"] as? String, UUID(uuidString: user) == account,
              let session = value["sessionID"] as? String, UUID(uuidString: session) == expectedSession else { throw CloudError.malformedResponse }
        return value
    }
}
