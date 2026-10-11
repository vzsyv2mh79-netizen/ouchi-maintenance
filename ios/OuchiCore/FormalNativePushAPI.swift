import Foundation

public enum NativePushEnvironment: String, Codable, Sendable { case sandbox = "Sandbox", production = "Production" }
public struct NativePushRegistrationReceipt: Equatable, Sendable {
    public let registrationID: UUID
    public let epoch: UUID
    public let notificationEnvironment: NativePushEnvironment
    public let purchaseEnvironment: BillingEnvironment
}
private final class FormalNativePushRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
/// Fixed formal endpoint, independent APNs/purchase scopes; no registration is
/// automatically requested and no message is sent by this transport.
public struct FormalNativePushAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let endpoint: URL
    private let notificationEnvironment: NativePushEnvironment
    private let purchaseEnvironment: BillingEnvironment
    public init(notificationEnvironment: NativePushEnvironment, purchaseEnvironment: BillingEnvironment,
                isolatedDevelopment: Bool = false, loopbackPort: UInt16 = 3000, transport: HouseholdAPI.Transport? = nil) {
        self.notificationEnvironment = notificationEnvironment; self.purchaseEnvironment = purchaseEnvironment
        #if DEBUG
        endpoint = isolatedDevelopment && notificationEnvironment == .sandbox && purchaseEnvironment == .sandbox && loopbackPort > 0
            ? URL(string: "http://127.0.0.1:\(loopbackPort)/api/native-push-registration")!
            : URL(string: "https://ouchi-maintenance.vercel.app/api/native-push-registration")!
        #else
        endpoint = URL(string: "https://ouchi-maintenance.vercel.app/api/native-push-registration")!
        #endif
        self.transport = transport ?? { request in
            let session = URLSession(configuration: .ephemeral, delegate: FormalNativePushRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (stream, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in stream { try Task.checkCancellation(); guard data.count < 4096 else { throw CloudError.malformedResponse }; data.append(byte) }
            return (data, response)
        }
    }
    public func register(deviceToken: Data, epoch: UUID, token: String) async throws -> NativePushRegistrationReceipt {
        guard (16...512).contains(deviceToken.count) else { throw CloudError.invalidInput }
        let value = try await send(method: "POST", body: ["deviceToken": deviceToken.map { String(format: "%02x", $0) }.joined()], epoch: epoch, token: token)
        guard let id = value.registrationId, id != Self.nilUUID else { throw CloudError.malformedResponse }
        return NativePushRegistrationReceipt(registrationID: id, epoch: epoch, notificationEnvironment: notificationEnvironment, purchaseEnvironment: purchaseEnvironment)
    }
    public func disable(_ receipt: NativePushRegistrationReceipt, token: String) async throws -> Bool {
        guard receipt.epoch != Self.nilUUID, receipt.registrationID != Self.nilUUID,
              receipt.notificationEnvironment == notificationEnvironment, receipt.purchaseEnvironment == purchaseEnvironment else { throw CloudError.invalidInput }
        let value = try await send(method: "DELETE", body: ["registrationId": receipt.registrationID.uuidString.lowercased()], epoch: receipt.epoch, token: token)
        guard let disabled = value.disabled else { throw CloudError.malformedResponse }; return disabled
    }
    private static let nilUUID = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
    private struct Receipt: Decodable {
        let notificationEnvironment: NativePushEnvironment, purchaseEnvironment: BillingEnvironment
        let purchaseAccountToken: UUID
        let registrationId: UUID?, disabled: Bool?
    }
    private func send(method: String, body: [String: String], epoch: UUID, token: String) async throws -> Receipt {
        guard epoch != Self.nilUUID else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        var request = URLRequest(url: endpoint); request.httpMethod = method; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(epoch.uuidString.lowercased(), forHTTPHeaderField: "X-Ouchi-App-Epoch"); request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await transport(request); try Task.checkCancellation()
        guard response.url == endpoint, data.count <= 4096, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { if response.statusCode == 401 { throw CloudError.authenticationRequired }; throw CloudError.rejected(response.statusCode) }
        guard response.mimeType == "application/json", response.value(forHTTPHeaderField: "Cache-Control") == "no-store",
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(object.keys) == Set(["notificationEnvironment", "purchaseEnvironment", "purchaseAccountToken", method == "POST" ? "registrationId" : "disabled"]) else { throw CloudError.malformedResponse }
        let value = try JSONDecoder().decode(Receipt.self, from: data)
        guard value.notificationEnvironment == notificationEnvironment, value.purchaseEnvironment == purchaseEnvironment, value.purchaseAccountToken == epoch else { throw CloudError.malformedResponse }
        return value
    }
}
