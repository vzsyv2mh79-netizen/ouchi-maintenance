import Foundation

public struct MaintenanceReport: Decodable, Sendable {
    public struct Month: Decodable, Sendable { public let month: String; public let completed: Int }
    public struct Product: Decodable, Sendable {
        public let productId: String; public let name: String
        public let completedThisMonth: Int; public let overdue: Int; public let dueToday: Int
    }
    public let homeId: String; public let homeName: String; public let generatedAt: String; public let today: String
    public let productCount: Int; public let taskCount: Int; public let overdue: Int; public let dueToday: Int
    public let months: [Month]; public let perProduct: [Product]; public let explanation: String
}

private final class ReportRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// Development transport. The pinned preview was verified against Vercel project/commit metadata.
/// Do not expose this as a released premium benefit until a tested service is available.
public struct ReportAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let origin: String
    public init(sandboxPreview: Bool = false, transport: HouseholdAPI.Transport? = nil) {
        origin = sandboxPreview ? "https://ouchi-maintenance-n2u08a2mo-gfgz4m9pkm-8942.vercel.app" : "https://ouchi-maintenance.vercel.app"
        self.transport = transport ?? { request in
        let session = URLSession(configuration: .ephemeral, delegate: ReportRedirectBlocker(), delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
        return (data, response)
        }
    }

    public func load(home: String, token: String) async throws -> MaintenanceReport {
        guard let id = UUID(uuidString: home) else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        var components = URLComponents(string: origin + "/api/development/maintenance-report")!
        components.queryItems = [URLQueryItem(name: "homeId", value: id.uuidString.lowercased())]
        let url = components.url!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (bytes, response) = try await transport(request)
        guard response.url == url, bytes.count <= 2_000_000 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        struct Envelope: Decodable { let environment: String; let salesEnabled: Bool; let report: MaintenanceReport }
        let result = try JSONDecoder().decode(Envelope.self, from: bytes)
        let report = result.report
        guard result.environment == "Sandbox", !result.salesEnabled, UUID(uuidString: report.homeId) == id,
              !report.homeName.isEmpty, report.homeName.count <= 80, report.explanation.count <= 2000,
              report.months.count == 6, report.perProduct.count <= 10000,
              report.productCount == report.perProduct.count,
              (0...10000).contains(report.taskCount), (0...10000).contains(report.overdue), (0...10000).contains(report.dueToday),
              report.overdue + report.dueToday <= report.taskCount,
              Self.validDay(report.today), Self.validTimestamp(report.generatedAt),
              Set(report.perProduct.map(\.productId)).count == report.perProduct.count,
              report.months.allSatisfy({ $0.month.range(of: #"^\d{4}-(0[1-9]|1[0-2])$"#, options: .regularExpression) != nil && (0...10000).contains($0.completed) }),
              report.months.map(\.month) == Self.expectedMonths(ending: report.today),
              report.perProduct.reduce(0, { $0 + $1.completedThisMonth }) == report.months.last?.completed,
              report.perProduct.allSatisfy({ UUID(uuidString: $0.productId) != nil && !$0.name.isEmpty && $0.name.count <= 10000 && (0...10000).contains($0.completedThisMonth) && (0...10000).contains($0.overdue) && (0...10000).contains($0.dueToday) }),
              report.perProduct.reduce(0, { $0 + $1.overdue }) == report.overdue,
              report.perProduct.reduce(0, { $0 + $1.dueToday }) == report.dueToday else { throw CloudError.malformedResponse }
        return report
    }
    private static func expectedMonths(ending day: String) -> [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone; formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: day) else { return [] }
        let start = calendar.date(from: calendar.dateComponents([.year, .month], from: date))!
        formatter.dateFormat = "yyyy-MM"
        return (-5...0).map { formatter.string(from: calendar.date(byAdding: .month, value: $0, to: start)!) }
    }
    private static func validTimestamp(_ value: String) -> Bool {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) != nil
    }
    private static func validDay(_ value: String) -> Bool {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "yyyy-MM-dd"; formatter.isLenient = false
        guard value.count == 10, let date = formatter.date(from: value) else { return false }
        return formatter.string(from: date) == value
    }
}
