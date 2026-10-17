import Foundation
import CoreFoundation

public enum HomeManagementAuthenticationError: Error, Equatable, Sendable { case additionalVerificationRequired }
public struct HomeManagementStatus: Equatable, Sendable {
    public enum State: String, Sendable { case managed, awaitingManagement = "awaiting_management" }
    public let homeID: UUID
    public let epochID: UUID
    public let state: State
    public let generation: UUID?
    public let canClaim: Bool
    static func decode(_ data: Data, homeID: UUID, epochID: UUID) throws -> Self {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(value.keys) == ["kind", "homeID", "epochID", "state", "generation", "canClaim"],
              value["kind"] as? String == "ownerless-home-status/v1",
              UUID(uuidString: value["homeID"] as? String ?? "") == homeID,
              UUID(uuidString: value["epochID"] as? String ?? "") == epochID,
              let state = State(rawValue: value["state"] as? String ?? ""),
              let boolean = value["canClaim"] as? NSNumber, CFGetTypeID(boolean) == CFBooleanGetTypeID() else { throw CloudError.malformedResponse }
        let generation = UUID(uuidString: value["generation"] as? String ?? "")
        guard state == .managed ? (value["generation"] is NSNull && !boolean.boolValue) : (generation != nil && generation != .zero) else { throw CloudError.malformedResponse }
        return Self(homeID: homeID, epochID: epochID, state: state, generation: generation, canClaim: boolean.boolValue)
    }
}
public struct HomeManagementIntent: Codable, Equatable, Sendable {
    public let accountID: UUID
    public let epochID: UUID
    public let homeID: UUID
    public let generation: UUID
    public let requestID: UUID
    public init(accountID: UUID, epochID: UUID, homeID: UUID, generation: UUID, requestID: UUID) {
        self.accountID = accountID; self.epochID = epochID; self.homeID = homeID; self.generation = generation; self.requestID = requestID
    }
}
public struct HomeManagementClaim: Equatable, Sendable {
    public enum State: String, Sendable { case claimed, superseded, notRecorded = "not_recorded" }
    public let intent: HomeManagementIntent
    public let state: State
    static func decode(_ data: Data, intent: HomeManagementIntent, mutation: Bool) throws -> Self {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(value.keys) == ["kind", "requestID", "homeID", "epochID", "generation", "state"],
              value["kind"] as? String == "ownerless-home-claim/v1",
              UUID(uuidString: value["requestID"] as? String ?? "") == intent.requestID,
              UUID(uuidString: value["homeID"] as? String ?? "") == intent.homeID,
              UUID(uuidString: value["epochID"] as? String ?? "") == intent.epochID,
              UUID(uuidString: value["generation"] as? String ?? "") == intent.generation,
              let state = State(rawValue: value["state"] as? String ?? ""), !mutation || state != .notRecorded else { throw CloudError.malformedResponse }
        return Self(intent: intent, state: state)
    }
}
private extension UUID { static let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")! }
private final class ManagementRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
/// Backend endpoint and reviewed policy must be deployed before enabling the UI.
public struct HomeManagementAPI: Sendable {
    private let origin: String
    private let transport: HouseholdAPI.Transport
    public init(isolatedDevelopment: Bool = false, loopbackPort: UInt16 = 3000, transport: HouseholdAPI.Transport? = nil) {
        #if DEBUG
        origin = isolatedDevelopment && loopbackPort > 0 ? "http://127.0.0.1:\(loopbackPort)" : "https://ouchi-maintenance.vercel.app"
        #else
        origin = "https://ouchi-maintenance.vercel.app"
        #endif
        self.transport = transport ?? { request in
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForResource = 35
            let session = URLSession(configuration: configuration, delegate: ManagementRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in bytes {
                try Task.checkCancellation(); guard data.count < 4096 else { throw CloudError.malformedResponse }; data.append(byte)
            }
            return (data, response)
        }
    }
    public func status(homeID: UUID, epochID: UUID, token: String) async throws -> HomeManagementStatus {
        try HomeManagementStatus.decode(await send(homeID: homeID, epochID: epochID, token: token), homeID: homeID, epochID: epochID)
    }
    public func read(_ intent: HomeManagementIntent, token: String) async throws -> HomeManagementClaim {
        try validate(intent)
        let query = [URLQueryItem(name: "requestID", value: intent.requestID.uuidString.lowercased()), URLQueryItem(name: "generation", value: intent.generation.uuidString.lowercased())]
        return try HomeManagementClaim.decode(await send(homeID: intent.homeID, epochID: intent.epochID, token: token, query: query), intent: intent, mutation: false)
    }
    public func claim(_ intent: HomeManagementIntent, token: String) async throws -> HomeManagementClaim {
        try validate(intent)
        let body = ["requestID": intent.requestID.uuidString.lowercased(), "generation": intent.generation.uuidString.lowercased(), "confirmation": "CLAIM_HOME_MANAGEMENT"]
        return try HomeManagementClaim.decode(await send(homeID: intent.homeID, epochID: intent.epochID, token: token, body: body), intent: intent, mutation: true)
    }
    private func validate(_ intent: HomeManagementIntent) throws {
        guard [intent.accountID, intent.homeID, intent.epochID, intent.generation, intent.requestID].allSatisfy({ $0 != .zero }) else { throw CloudError.invalidInput }
    }
    private func send(homeID: UUID, epochID: UUID, token: String, query: [URLQueryItem]? = nil, body: [String: String]? = nil) async throws -> Data {
        guard homeID != .zero, epochID != .zero else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        var parts = URLComponents(string: origin + "/api/family/management/" + homeID.uuidString.lowercased())!
        parts.queryItems = query
        let url = parts.url!
        var request = URLRequest(url: url)
        request.httpMethod = body == nil ? "GET" : "POST"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue(epochID.uuidString.lowercased(), forHTTPHeaderField: "X-Ouchi-App-Epoch")
        if let body { request.httpBody = try JSONEncoder().encode(body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        try Task.checkCancellation(); let (data, response) = try await transport(request); try Task.checkCancellation()
        guard response.url == url, data.count <= 4096 else { throw CloudError.malformedResponse }
        if response.statusCode == 401 { throw CloudError.authenticationRequired }
        if [200, 403].contains(response.statusCode) {
            guard response.mimeType == "application/json", response.expectedContentLength <= 4096,
                  response.value(forHTTPHeaderField: "Cache-Control")?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "no-store" else { throw CloudError.malformedResponse }
            if let declared = response.value(forHTTPHeaderField: "Content-Length") {
                guard !declared.isEmpty, declared.allSatisfy({ $0.isASCII && $0.isNumber }), Int(declared) == data.count else { throw CloudError.malformedResponse }
            }
        }
        if response.statusCode == 403, let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           Set(value.keys) == ["error", "code"], value["error"] as? String == "Additional verification required", value["code"] as? String == "additional_verification_required" {
            throw HomeManagementAuthenticationError.additionalVerificationRequired
        }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        return data
    }
}
