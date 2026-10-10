import Foundation

public enum BillingEnvironment: String, Codable, Sendable {
    case sandbox = "Sandbox"
    case production = "Production"
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
    public let environment: BillingEnvironment
    public init(environment: BillingEnvironment = .sandbox, transport: @escaping HouseholdAPI.Transport = { request in
        let (bytes, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
        return (bytes, response)
    }) { self.environment = environment; self.transport = transport }
    private func send(path: String, token: String, body: Data?, allowedStatuses: Set<Int> = [200]) async throws -> (data: Data, status: Int) {
        guard !token.isEmpty, token.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        let url = URL(string: "https://ouchi-maintenance.vercel.app/api/billing/" + path)!
        var request = URLRequest(url: url); request.httpMethod = body == nil ? "GET" : "POST"
        request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (data, response) = try await transport(request)
        guard response.url?.scheme == "https", response.url?.host == url.host, response.url?.path == url.path else { throw CloudError.malformedResponse }
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
