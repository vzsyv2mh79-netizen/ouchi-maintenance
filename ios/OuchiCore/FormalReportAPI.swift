import Foundation

private final class FormalReportRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
/// Separate formal transport. Release always uses the fixed HTTPS application origin.
public struct FormalReportAPI: Sendable {
    private let environment: BillingEnvironment
    private let origin: String?
    private let transport: HouseholdAPI.Transport
    public init(environment: BillingEnvironment, server: BillingServer = .production, isolatedDevelopment: Bool = false, loopbackPort: UInt16 = 3000,
                transport: HouseholdAPI.Transport? = nil) {
        self.environment = environment
        #if DEBUG
        origin = isolatedDevelopment && server == .production && environment == .sandbox && loopbackPort > 0 ? "http://127.0.0.1:\(loopbackPort)" : server.origin(environment: environment)
        #else
        origin = server.origin(environment: environment)
        #endif
        self.transport = transport ?? { request in
            let session = URLSession(configuration: .ephemeral, delegate: FormalReportRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (stream, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 2_000_000 else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in stream {
                try Task.checkCancellation()
                guard data.count < 2_000_000 else { throw CloudError.malformedResponse }
                data.append(byte)
            }
            return (data, response)
        }
    }
    public func load(home: String, epoch: UUID, token: String) async throws -> MaintenanceReport {
        guard let origin else { throw CloudError.invalidInput }
        try Task.checkCancellation()
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard let id = UUID(uuidString: home), id != zero, epoch != zero else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        var components = URLComponents(string: origin + "/api/maintenance-report")!
        components.queryItems = [URLQueryItem(name: "homeId", value: id.uuidString.lowercased())]
        let url = components.url!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue(epoch.uuidString.lowercased(), forHTTPHeaderField: "X-Ouchi-App-Epoch")
        let (bytes, response) = try await transport(request)
        try Task.checkCancellation()
        guard response.url == url, bytes.count <= 2_000_000, response.expectedContentLength <= 2_000_000 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        guard response.mimeType == "application/json", response.value(forHTTPHeaderField: "Cache-Control") == "no-store" else { throw CloudError.malformedResponse }
        struct Envelope: Decodable { let environment: BillingEnvironment; let purchaseAccountToken: UUID; let report: MaintenanceReport }
        let value = try JSONDecoder().decode(Envelope.self, from: bytes)
        guard value.environment == environment, value.purchaseAccountToken == epoch else { throw CloudError.malformedResponse }
        return try ReportAPI.checkedReport(value.report, home: id)
    }
}
