import Foundation

private final class BillingRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

public enum BillingEnvironment: String, Codable, Sendable {
    case sandbox = "Sandbox"
    case production = "Production"
}

/// Build-selected destinations only. Never accept an origin from a deep link,
/// remote response or user input, and never include Vercel access credentials.
public enum BillingServer: Sendable {
    case production
    case sandboxReview

    fileprivate func origin(environment: BillingEnvironment) -> String? {
        switch self {
        case .production: return "https://ouchi-maintenance.vercel.app"
        case .sandboxReview:
            guard environment == .sandbox else { return nil }
            // Verified Ouchi project / feat/native-household-core / ad1205275.
            // Updating this immutable deployment requires a reviewed source change.
            return "https://ouchi-maintenance-7gmdv28id-gfgz4m9pkm-8942.vercel.app"
        }
    }
}

public struct VerifiedEntitlement: Decodable, Sendable {
    public enum Plan: String, Decodable, Sendable { case free, premium }
    public let plan: Plan
    public let salesEnabled: Bool
    public let environment: String?
    public let expiresAt: Double?
    public let productId: String?
    public let purchaseAccountToken: UUID?
    public func premiumIsCurrent(now: Date = Date(), expectedEnvironment: BillingEnvironment = .sandbox) -> Bool {
        // Availability of new sales must not revoke a previously paid period.
        plan == .premium && environment == expectedEnvironment.rawValue &&
        purchaseAccountToken != nil && purchaseAccountToken != UUID(uuidString: "00000000-0000-0000-0000-000000000000") &&
        ["ouchi.premium.monthly", "ouchi.premium.annual"].contains(productId ?? "") &&
        (expiresAt?.isFinite == true) && (expiresAt ?? 0) > now.timeIntervalSince1970 * 1000
    }
}

// Keep existing test-only screens source compatible while the production UI is prepared.
public typealias SandboxEntitlement = VerifiedEntitlement

public struct BillingRecoveryStatus: Decodable, Sendable {
    public enum State: String, Decodable, Sendable { case none, queued, running, complete, failed, cancelled }
    public let state: State
    public let environment: BillingEnvironment
}
public enum BillingRecoveryRequest: String, Decodable, Sendable { case accepted; case noPurchaseHistory = "no_purchase_history" }

/// Server validates Apple JWS and binds it to the authenticated user.
/// Environment selection only scopes validation; it does not enable purchases or sales.
public struct BillingAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let origin: String?
    public let environment: BillingEnvironment
    public init(environment: BillingEnvironment = .sandbox, server: BillingServer = .production,
                isolatedDevelopment: Bool = false,
                loopbackPort: UInt16 = 3000, transport: HouseholdAPI.Transport? = nil) {
        self.environment = environment
        #if DEBUG
        origin = isolatedDevelopment && environment == .sandbox && server == .production && loopbackPort > 0
            ? "http://127.0.0.1:\(loopbackPort)" : server.origin(environment: environment)
        #else
        origin = server.origin(environment: environment)
        #endif
        self.transport = transport ?? { request in
            // Reject redirects before transmitting a bearer or signed transaction
            // to any second endpoint; a response URL check alone is too late.
            let session = URLSession(configuration: .ephemeral, delegate: BillingRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in bytes {
                try Task.checkCancellation()
                guard data.count < 1_000_000 else { throw CloudError.malformedResponse }
                data.append(byte)
            }
            return (data, response)
        }
    }
    private func send(path: String, token: String, body: Data?, allowedStatuses: Set<Int> = [200]) async throws -> (data: Data, status: Int) {
        // A mismatched build/environment must fail before bearer/JWS transmission.
        guard let origin else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        let url = URL(string: origin + "/api/billing/" + path)!
        var request = URLRequest(url: url); request.httpMethod = body == nil ? "GET" : "POST"
        request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (data, response) = try await transport(request)
        guard response.url == url else { throw CloudError.malformedResponse }
        guard allowedStatuses.contains(response.statusCode) else {
            if response.statusCode == 401 { throw CloudError.authenticationRequired }
            throw CloudError.rejected(response.statusCode)
        }
        guard data.count <= 1_000_000 else { throw CloudError.malformedResponse }
        return (data, response.statusCode)
    }
    public func submit(signedTransaction: String, token: String) async throws {
        guard !signedTransaction.isEmpty, signedTransaction.utf8.count <= 250_000 else { throw CloudError.invalidInput }
        let body = try JSONEncoder().encode(["signedTransaction": signedTransaction])
        let (data, _) = try await send(path: "transactions", token: token, body: body)
        struct Saved: Decodable { let saved: Bool; let environment: String }
        let result = try JSONDecoder().decode(Saved.self, from: data)
        guard result.saved, result.environment == environment.rawValue else { throw CloudError.malformedResponse }
    }
    public func entitlement(token: String) async throws -> VerifiedEntitlement {
        let (data, _) = try await send(path: "entitlement", token: token, body: nil)
        let result = try JSONDecoder().decode(VerifiedEntitlement.self, from: data)
        // Only a disabled, unconfigured free Sandbox response may omit its environment.
        let unconfiguredSandbox = environment == .sandbox && result.plan == .free && !result.salesEnabled && result.environment == nil
        guard result.environment == environment.rawValue || unconfiguredSandbox else { throw CloudError.malformedResponse }
        if environment == .sandbox && result.salesEnabled { throw CloudError.malformedResponse }
        if let account = result.purchaseAccountToken, account == UUID(uuidString: "00000000-0000-0000-0000-000000000000") { throw CloudError.malformedResponse }
        if result.plan == .premium {
            guard result.purchaseAccountToken != nil else { throw CloudError.malformedResponse }
            guard result.environment == environment.rawValue, result.expiresAt?.isFinite == true,
                  ["ouchi.premium.monthly", "ouchi.premium.annual"].contains(result.productId ?? "") else { throw CloudError.malformedResponse }
        }
        return result
    }
    public func requestRecovery(token: String) async throws -> BillingRecoveryRequest {
        let (data, status) = try await send(path: "recovery", token: token, body: Data("{}".utf8), allowedStatuses: [200, 202])
        struct Receipt: Decodable { let state: BillingRecoveryRequest; let environment: BillingEnvironment }
        let receipt = try JSONDecoder().decode(Receipt.self, from: data)
        guard receipt.environment == environment,
              (status == 202 && receipt.state == .accepted) || (status == 200 && receipt.state == .noPurchaseHistory) else { throw CloudError.malformedResponse }
        return receipt.state
    }
    public func recoveryStatus(token: String) async throws -> BillingRecoveryStatus {
        let (data, _) = try await send(path: "recovery", token: token, body: nil)
        let result = try JSONDecoder().decode(BillingRecoveryStatus.self, from: data)
        guard result.environment == environment else { throw CloudError.malformedResponse }
        return result
    }

}
