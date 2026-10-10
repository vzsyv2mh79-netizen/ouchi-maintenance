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

/// Isolated development lifecycle transport. No production endpoint is selected.
/// This closes app access; it does not claim complete account/PII erasure.
public struct DevelopmentAccountLifecycleAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    public init(transport: HouseholdAPI.Transport? = nil) {
        self.transport = transport ?? { request in
            #if DEBUG
            let session = URLSession(configuration: .ephemeral, delegate: ReportRedirectBlocker(), delegateQueue: nil)
            defer { session.finishTasksAndInvalidate() }
            let (bytes, response) = try await session.data(for: request)
            guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
            return (bytes, response)
            #else
            throw CloudError.rejected(503)
            #endif
        }
    }
    public func closeAppAccess(token: String, password: String, confirmed: Bool) async throws {
        let bytes = try await send(path: "account-closure", confirmation: "DELETE_OUCHI_MAINTENANCE", token: token, password: password, confirmed: confirmed)
        struct Result: Decodable { let appAccessClosed: Bool; let cleanupApplied: Bool; let sharedIdentityPreserved: Bool }
        let result = try JSONDecoder().decode(Result.self, from: bytes)
        guard result.appAccessClosed, result.sharedIdentityPreserved else { throw CloudError.malformedResponse }
    }
    public func reenroll(token: String, password: String, confirmed: Bool) async throws -> UUID {
        let bytes = try await send(path: "account-reenrollment", confirmation: "REENROLL_OUCHI_MAINTENANCE", token: token, password: password, confirmed: confirmed)
        struct Result: Decodable { let appEnrollmentCreated: Bool; let epochID: String; let sharedIdentityPreserved: Bool }
        let result = try JSONDecoder().decode(Result.self, from: bytes)
        guard result.appEnrollmentCreated, result.sharedIdentityPreserved,
              let epoch = UUID(uuidString: result.epochID), epoch.uuidString != "00000000-0000-0000-0000-000000000000" else { throw CloudError.malformedResponse }
        return epoch
    }
    private func send(path: String, confirmation: String, token: String, password: String, confirmed: Bool) async throws -> Data {
        guard confirmed, !password.isEmpty, password.utf16.count <= 1024 else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        let bytes = try JSONSerialization.data(withJSONObject: ["confirmation": confirmation, "password": password])
        guard bytes.count <= 4096 else { throw CloudError.invalidInput }
        let url = URL(string: "http://127.0.0.1:3000/api/development/" + path)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = bytes
        let (body, response) = try await transport(request)
        guard response.url == url, body.count <= 4096 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        return body
    }
}

/// Disposable loopback attachment tests only. Production transport is unavailable.
public struct DevelopmentAttachmentAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    public init(transport: HouseholdAPI.Transport? = nil) {
        self.transport = transport ?? { request in
            #if DEBUG
            let session = URLSession(configuration: .ephemeral, delegate: ReportRedirectBlocker(), delegateQueue: nil)
            defer { session.finishTasksAndInvalidate() }
            let (bytes, response) = try await session.data(for: request)
            guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
            return (bytes, response)
            #else
            throw CloudError.rejected(503)
            #endif
        }
    }
    public struct Binding: Decodable, Sendable {
        public let account: UUID
        public let epoch: UUID
    }
    public func binding(token: String) async throws -> Binding {
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        let url = URL(string: "http://127.0.0.1:3000/api/development/product-attachments?binding=true")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (body, response) = try await transport(request)
        guard response.url == url, body.count <= 4096 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        let value = try JSONDecoder().decode(Binding.self, from: body)
        let nilID = "00000000-0000-0000-0000-000000000000"
        guard value.account != value.epoch, value.account.uuidString != nilID, value.epoch.uuidString != nilID else { throw CloudError.malformedResponse }
        return value
    }
    public struct Usage: Decodable, Sendable {
        public let usedBytes: Int
        public let usedFiles: Int
        public let reservedBytes: Int
        public let reservedFiles: Int
        public let limitBytes: Int
        public let limitFiles: Int
        public let fileLimitBytes: Int
    }
    public func usage(token: String) async throws -> Usage {
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        let url = URL(string: "http://127.0.0.1:3000/api/development/product-attachments?usage=true")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (body, response) = try await transport(request)
        guard response.url == url, body.count <= 4096 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        struct Envelope: Decodable { let usage: Usage }
        let value = try JSONDecoder().decode(Envelope.self, from: body).usage
        guard value.usedBytes >= 0, value.usedFiles >= 0, value.reservedBytes >= 0, value.reservedFiles >= 0,
              value.reservedBytes <= value.usedBytes, value.reservedFiles <= value.usedFiles,
              value.limitBytes == 104857600, value.limitFiles == 100, value.fileLimitBytes == 5242880 else { throw CloudError.malformedResponse }
        return value
    }
    public struct StoredAttachment: Decodable, Sendable, Identifiable {
        public let id: UUID
        public let size: Int
        public let mime: String
        public let createdAt: String
    }
    public struct AttachmentPage: Sendable {
        public let items: [StoredAttachment]
        public let next: UUID?
    }
    public func page(product: UUID, after: UUID? = nil, token: String) async throws -> AttachmentPage {
        let nilID = "00000000-0000-0000-0000-000000000000"
        guard product.uuidString != nilID, after?.uuidString != nilID else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        var components = URLComponents(string: "http://127.0.0.1:3000/api/development/product-attachments")!
        components.queryItems = [URLQueryItem(name: "productId", value: product.uuidString.lowercased()), URLQueryItem(name: "page", value: "true")]
        if let after { components.queryItems?.append(URLQueryItem(name: "after", value: after.uuidString.lowercased())) }
        let url = components.url!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (body, response) = try await transport(request)
        guard response.url == url, body.count <= 32768 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        struct Envelope: Decodable { let items: [StoredAttachment]; let next: UUID? }
        let value = try JSONDecoder().decode(Envelope.self, from: body)
        let dates = ISO8601DateFormatter(); dates.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plainDates = ISO8601DateFormatter()
        guard value.items.count <= 25, Set(value.items.map(\.id)).count == value.items.count,
              value.items.allSatisfy({ item in
                  item.id.uuidString != nilID && item.size > 0 && item.size <= 5242880 && ["image/png", "image/jpeg", "application/pdf"].contains(item.mime) && item.createdAt.utf8.count <= 64 && (dates.date(from: item.createdAt) != nil || plainDates.date(from: item.createdAt) != nil) && (after == nil || item.id.uuidString > after!.uuidString)
              }), value.items.map({ $0.id.uuidString }) == value.items.map({ $0.id.uuidString }).sorted(),
              value.next == nil || (value.items.count == 25 && value.next == value.items.last?.id) else { throw CloudError.malformedResponse }
        return AttachmentPage(items: value.items, next: value.next)
    }
    public func list(product: UUID, token: String) async throws -> [StoredAttachment] {
        guard product.uuidString != "00000000-0000-0000-0000-000000000000" else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        var components = URLComponents(string: "http://127.0.0.1:3000/api/development/product-attachments")!
        components.queryItems = [URLQueryItem(name: "productId", value: product.uuidString.lowercased())]
        let url = components.url!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (body, response) = try await transport(request)
        guard response.url == url else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        guard body.count <= 1024 * 1024 else { throw CloudError.malformedResponse }
        struct Listing: Decodable { let items: [StoredAttachment] }
        let items = try JSONDecoder().decode(Listing.self, from: body).items
        let dates = ISO8601DateFormatter(); dates.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plainDates = ISO8601DateFormatter()
        guard Set(items.map(\.id)).count == items.count, items.allSatisfy({ item in
            item.id.uuidString != "00000000-0000-0000-0000-000000000000" && item.size > 0 && item.size <= 5 * 1024 * 1024 && ["image/png", "image/jpeg", "application/pdf"].contains(item.mime) && item.createdAt.utf8.count <= 64 && (dates.date(from: item.createdAt) != nil || plainDates.date(from: item.createdAt) != nil)
        }) else { throw CloudError.malformedResponse }
        return items
    }
    public struct DownloadedFile: Sendable {
        public let bytes: Data
        public let mime: String
        public let fileExtension: String
    }
    public func download(attachment: UUID, token: String) async throws -> DownloadedFile {
        guard attachment.uuidString != "00000000-0000-0000-0000-000000000000" else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        var components = URLComponents(string: "http://127.0.0.1:3000/api/development/product-attachments")!
        let identifier = attachment.uuidString.lowercased()
        components.queryItems = [URLQueryItem(name: "attachmentId", value: identifier)]
        let url = components.url!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (body, response) = try await transport(request)
        guard response.url == url else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        guard !body.isEmpty, body.count <= 5 * 1024 * 1024 else { throw CloudError.malformedResponse }
        let mime = response.value(forHTTPHeaderField: "Content-Type") ?? ""
        let fileExtension: String, prefix: [UInt8]
        switch mime {
        case "image/png": fileExtension = "png"; prefix = [137,80,78,71,13,10,26,10]
        case "image/jpeg": fileExtension = "jpg"; prefix = [255,216,255]
        case "application/pdf": fileExtension = "pdf"; prefix = [37,80,68,70,45]
        default: throw CloudError.malformedResponse
        }
        guard body.starts(with: prefix),
              response.value(forHTTPHeaderField: "Content-Disposition") == "attachment; filename=\"ouchi-attachment-\(identifier).\(fileExtension)\"" else { throw CloudError.malformedResponse }
        return DownloadedFile(bytes: body, mime: mime, fileExtension: fileExtension)
    }
    /// Reuse the same ID after an uncertain response; never mint a retry ID silently.
    public func upload(product: UUID, attachment: UUID, bytes: Data, mime: String, token: String, confirmed: Bool) async throws {
        guard confirmed, !bytes.isEmpty, bytes.count <= 5 * 1024 * 1024,
              ["image/jpeg", "image/png", "application/pdf"].contains(mime),
              product.uuidString != "00000000-0000-0000-0000-000000000000",
              attachment.uuidString != "00000000-0000-0000-0000-000000000000" else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        var components = URLComponents(string: "http://127.0.0.1:3000/api/development/product-attachments")!
        components.queryItems = [URLQueryItem(name: "productId", value: product.uuidString.lowercased()), URLQueryItem(name: "attachmentId", value: attachment.uuidString.lowercased())]
        let url = components.url!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue(mime, forHTTPHeaderField: "Content-Type")
        request.setValue(String(bytes.count), forHTTPHeaderField: "Content-Length")
        request.httpBody = bytes
        let (body, response) = try await transport(request)
        guard response.url == url, body.count <= 4096 else { throw CloudError.malformedResponse }
        guard response.statusCode == 200 else { throw CloudError.rejected(response.statusCode) }
        struct Result: Decodable { let saved: Bool; let attachmentId: UUID }
        let result = try JSONDecoder().decode(Result.self, from: body)
        guard result.saved, result.attachmentId == attachment else { throw CloudError.malformedResponse }
    }
}

/// Credential-free retry payload. A server-issued enrollment binding is required
/// again before resuming; local data never proves rights or a completed upload.
public struct PendingAttachment: Codable, Sendable {
    public let account: UUID
    public let epoch: UUID
    public let product: UUID
    public let id: UUID
    public let bytes: Data
    public let mime: String
    public init(account: UUID, epoch: UUID, product: UUID, id: UUID, bytes: Data, mime: String) throws {
        self.account = account; self.epoch = epoch; self.product = product; self.id = id; self.bytes = bytes; self.mime = mime
        try validate()
    }
    private func validate() throws {
        let nilID = "00000000-0000-0000-0000-000000000000"
        guard [account,epoch,product,id].allSatisfy({ $0.uuidString != nilID }), account != epoch,
              !bytes.isEmpty, bytes.count <= 5 * 1024 * 1024 else { throw CloudError.invalidInput }
        let prefix: [UInt8]
        switch mime {
        case "image/png": prefix = [137,80,78,71,13,10,26,10]
        case "image/jpeg": prefix = [255,216,255]
        case "application/pdf": prefix = [37,80,68,70,45]
        default: throw CloudError.invalidInput
        }
        guard bytes.starts(with: prefix) else { throw CloudError.invalidInput }
    }
    public func encode() throws -> Data {
        try validate()
        let data = try JSONEncoder().encode(self)
        guard data.count <= 7 * 1024 * 1024 else { throw CloudError.invalidInput }
        return data
    }
    public static func decode(_ data: Data, account: UUID, epoch: UUID) throws -> PendingAttachment {
        guard data.count <= 7 * 1024 * 1024 else { throw CloudError.invalidInput }
        let value = try JSONDecoder().decode(Self.self, from: data)
        guard value.account == account, value.epoch == epoch else { throw CloudError.authenticationRequired }
        try value.validate()
        return value
    }
}
