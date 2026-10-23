import Foundation
import CoreFoundation

/// This receipt concerns only one Ouchi retirement. It must never be projected
/// into a shared-account deletion scope or a fabricated inventory digest.
public struct ClosureReadScope: Codable, Equatable, Sendable {
    public let requestID: UUID
    public let epochID: UUID
    public let submissionID: UUID
    public init(requestID: UUID, epochID: UUID, submissionID: UUID) {
        self.requestID = requestID; self.epochID = epochID; self.submissionID = submissionID
    }
}
public struct ClosureReadWindow: Equatable, Sendable {
    public let scope: ClosureReadScope
    /// Upper bound only: canonical job/completion-proof expiry can be earlier.
    public let expiresAt: Date
}
public struct ClosureReadStatus: Equatable, Sendable {
    public let scope: ClosureReadScope
    public let credentialID: UUID
    public let state: AccountClosureProgressReceipt.State
}
private final class ClosureReadRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
/// Prepared, gated backend. Persistence is the caller's prerequisite for register.
/// No endpoint ever starts deletion, renews a credential or acknowledges local
/// cleanup. A missing result must retain the original saved scope and key.
public struct ClosureReadCustodyAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let origin: String?
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
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForResource = 35
            let session = URLSession(configuration: config, delegate: ClosureReadRedirectBlocker(), delegateQueue: nil)
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
    public func window(scope: ClosureReadScope, bearer: String) async throws -> ClosureReadWindow? {
        guard let result = try await send(action: "window", scope: scope, bearer: bearer) else { return nil }
        guard Set(result.keys) == ["kind", "requestID", "epochID", "submissionID", "expiresAt"],
              result["kind"] as? String == "app-closure-read-window/v1",
              let deadline = deadline(result["expiresAt"]) else { throw CloudError.malformedResponse }
        return .init(scope: scope, expiresAt: deadline)
    }
    /// Call only with the secure store's read-back, including its original key,
    /// credential ID and server deadline. A lost reply never authorizes rotation.
    public func register(scope: ClosureReadScope, credentialID: UUID, token: String, expiresAt: Date, bearer: String) async throws {
        guard expiresAt.timeIntervalSince1970.isFinite, expiresAt > Date() else { throw CloudError.invalidInput }
        let formatter = Self.formatter()
        let expiry = formatter.string(from: expiresAt)
        guard let result = try await send(action: "register", scope: scope, credentialID: credentialID, token: token, bearer: bearer, expiry: expiry) else { throw CloudError.unavailable }
        guard Set(result.keys) == ["kind", "requestID", "epochID", "submissionID", "credentialID", "expiresAt", "registered"],
              result["kind"] as? String == "app-closure-read-registration/v1",
              result["expiresAt"] as? String == expiry, deadline(result["expiresAt"]) != nil,
              let flag = result["registered"] as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID(), flag.boolValue else { throw CloudError.malformedResponse }
    }
    public func status(scope: ClosureReadScope, credentialID: UUID, token: String) async throws -> ClosureReadStatus? {
        guard let result = try await send(action: "status", scope: scope, credentialID: credentialID, token: token) else { return nil }
        guard Set(result.keys) == ["kind", "requestID", "epochID", "submissionID", "credentialID", "state"],
              result["kind"] as? String == "app-closure-read-status/v1",
              let raw = result["state"] as? String, let state = AccountClosureProgressReceipt.State(rawValue: raw) else { throw CloudError.malformedResponse }
        return .init(scope: scope, credentialID: credentialID, state: state)
    }
    private static func formatter() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return formatter
    }
    private func deadline(_ value: Any?) -> Date? {
        guard let raw = value as? String, raw.range(of: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$", options: .regularExpression) != nil else { return nil }
        let formatter = Self.formatter()
        guard let date = formatter.date(from: raw), formatter.string(from: date) == raw,
              date > Date(), date <= Date().addingTimeInterval(30 * 86400) else { return nil }
        return date
    }
    private func send(action: String, scope: ClosureReadScope, credentialID: UUID? = nil, token: String? = nil,
                      bearer: String? = nil, expiry: String? = nil) async throws -> [String: Any]? {
        // Fail before transporting a bearer, password or saved read capability.
        guard let origin else { throw CloudError.invalidInput }
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard [scope.requestID, scope.epochID, scope.submissionID].allSatisfy({ $0 != zero }), credentialID != zero else { throw CloudError.invalidInput }
        if let token {
            let encoded = token.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") + "="
            guard token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
                  let bytes = Data(base64Encoded: encoded), bytes.count == 32, bytes.base64EncodedString() == encoded else { throw CloudError.invalidInput }
        }
        if let bearer { guard !bearer.isEmpty, bearer.utf8.count <= 16384, !bearer.contains(where: { $0.isWhitespace || $0 == "," }) else { throw CloudError.authenticationRequired } }
        try Task.checkCancellation()
        let url = URL(string: origin + "/api/account/closure-review/custody/" + action)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        var body = ["requestID": scope.requestID.uuidString.lowercased(), "expectedEpochID": scope.epochID.uuidString.lowercased(), "submissionID": scope.submissionID.uuidString.lowercased()]
        if let credentialID { body["credentialID"] = credentialID.uuidString.lowercased() }
        if let expiry { body["expiresAt"] = expiry }
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue(token, forHTTPHeaderField: "X-Ouchi-Closure-Read") }
        if let bearer { request.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
        let (bytes, response) = try await transport(request)
        try Task.checkCancellation()
        guard response.url == url, bytes.count <= 4096, response.expectedContentLength <= 4096, response.mimeType == "application/json",
              response.value(forHTTPHeaderField: "Cache-Control")?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "no-store" else { throw CloudError.malformedResponse }
        if let length = response.value(forHTTPHeaderField: "Content-Length") { guard !length.isEmpty, length.allSatisfy({ $0.isASCII && $0.isNumber }), Int(length) == bytes.count else { throw CloudError.malformedResponse } }
        if response.statusCode == 401 { throw CloudError.authenticationRequired }
        guard response.statusCode == 200 || response.statusCode == 404 else { throw CloudError.rejected(response.statusCode) }
        guard let result = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              result["requestID"] as? String == scope.requestID.uuidString.lowercased(), result["epochID"] as? String == scope.epochID.uuidString.lowercased(),
              result["submissionID"] as? String == scope.submissionID.uuidString.lowercased(),
              credentialID == nil || result["credentialID"] as? String == credentialID?.uuidString.lowercased() else { throw CloudError.malformedResponse }
        if response.statusCode == 404 {
            let expected: Set<String> = ["kind", "state", "requestID", "epochID", "submissionID"]
            guard Set(result.keys) == (credentialID == nil ? expected : expected.union(["credentialID"])),
                  result["kind"] as? String == "app-closure-read-unavailable/v1", result["state"] as? String == "unavailable" else { throw CloudError.malformedResponse }
            return nil
        }
        return result
    }
}
