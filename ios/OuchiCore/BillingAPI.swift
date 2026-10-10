import Foundation

public struct SandboxEntitlement: Decodable, Sendable {
    public enum Plan: String, Decodable, Sendable { case free, premium }
    public let plan: Plan
    public let salesEnabled: Bool
    public let environment: String?
    public let expiresAt: Double?
    public let productId: String?
    public func premiumIsCurrent(now: Date = Date()) -> Bool {
        plan == .premium && environment == "Sandbox" && salesEnabled == false &&
        ["ouchi.premium.monthly", "ouchi.premium.annual"].contains(productId ?? "") &&
        (expiresAt?.isFinite == true) && (expiresAt ?? 0) > now.timeIntervalSince1970 * 1000
    }
}

/// Sandbox-only transport. Server validates Apple JWS and binds it to the user's JWT.
/// This adapter never marks production benefits as purchased.
public struct BillingAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    public init(transport: @escaping HouseholdAPI.Transport = { request in
        let (bytes, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
        return (bytes, response)
    }) { self.transport = transport }
    private func send(path: String, token: String, body: Data?) async throws -> Data {
        guard !token.isEmpty, token.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        let url = URL(string: "https://ouchi-maintenance.vercel.app/api/billing/" + path)!
        var request = URLRequest(url: url); request.httpMethod = body == nil ? "GET" : "POST"
        request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (data, response) = try await transport(request)
        guard response.url?.scheme == "https", response.url?.host == url.host, response.url?.path == url.path else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else {
            if response.statusCode == 401 { throw CloudError.authenticationRequired }
            throw CloudError.rejected(response.statusCode)
        }
        guard data.count <= 1_000_000 else { throw CloudError.malformedResponse }
        return data
    }
    public func submit(signedTransaction: String, token: String) async throws {
        guard !signedTransaction.isEmpty, signedTransaction.utf8.count <= 250_000 else { throw CloudError.invalidInput }
        let body = try JSONEncoder().encode(["signedTransaction": signedTransaction])
        let data = try await send(path: "transactions", token: token, body: body)
        struct Saved: Decodable { let saved: Bool; let environment: String }
        let result = try JSONDecoder().decode(Saved.self, from: data)
        guard result.saved, result.environment == "Sandbox" else { throw CloudError.malformedResponse }
    }
    public func entitlement(token: String) async throws -> SandboxEntitlement {
        let data = try await send(path: "entitlement", token: token, body: nil)
        let result = try JSONDecoder().decode(SandboxEntitlement.self, from: data)
        guard !result.salesEnabled, result.environment == nil || result.environment == "Sandbox" else { throw CloudError.malformedResponse }
        if result.plan == .premium {
            guard result.environment == "Sandbox", result.expiresAt?.isFinite == true,
                  ["ouchi.premium.monthly", "ouchi.premium.annual"].contains(result.productId ?? "") else { throw CloudError.malformedResponse }
        }
        return result
    }
}
