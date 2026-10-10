import Foundation

private final class HouseholdRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

public enum CloudError: Error, Equatable {
    case invalidConfiguration, authenticationRequired, rejected(Int), malformedResponse, invalidInput, unavailable
}

public struct CloudConfiguration: Sendable {
    public let url: URL
    public let publishableKey: String
    public init(url: URL, publishableKey: String, isolatedDevelopment: Bool = false) throws {
        #if DEBUG
        if isolatedDevelopment {
            guard ["http://127.0.0.1:54321", "http://127.0.0.1:54321/"].contains(url.absoluteString),
                  publishableKey.hasPrefix("sb_publishable_"), publishableKey.count > 20,
                  publishableKey.count <= 4096, !publishableKey.contains(where: { $0.isWhitespace }) else { throw CloudError.invalidConfiguration }
            self.url = url; self.publishableKey = publishableKey
            return
        }
        #else
        guard !isolatedDevelopment else { throw CloudError.invalidConfiguration }
        #endif
        guard url.scheme == "https", url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.port == nil,
              url.path.isEmpty || url.path == "/",
              let host = url.host,
              host.range(of: #"^[a-z0-9]{20}\.supabase\.co$"#, options: .regularExpression) != nil,
              publishableKey.hasPrefix("sb_publishable_"),
              publishableKey.count > 20,
              !publishableKey.contains(where: { $0.isWhitespace }) else {
            throw CloudError.invalidConfiguration
        }
        self.url = url
        self.publishableKey = publishableKey
    }
}

public struct Session: Codable, Sendable {
    public struct User: Codable, Sendable { public let id: UUID }
    public let access_token: String
    public let refresh_token: String
    public let expires_at: Double
    public let user: User
}

/// Transport is injectable: tests never connect to the real household or Auth service.
public struct HouseholdAPI: Sendable {
    public typealias Transport = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)
    private let config: CloudConfiguration
    private let transport: Transport
    public init(config: CloudConfiguration, transport: Transport? = nil) {
        self.config = config
        self.transport = transport ?? { request in
            let session = URLSession(configuration: .ephemeral, delegate: HouseholdRedirectBlocker(), delegateQueue: nil)
            defer { session.finishTasksAndInvalidate() }
            let (data, response) = try await session.data(for: request)
            guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
            return (data, response)
        }
    }

    private func send(path: String, token: String? = nil, body: Data, query: String? = nil, method: String = "POST", representation: Bool = false) async throws -> Data {
        var parts = URLComponents(url: config.url.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        parts.percentEncodedQuery = query
        var request = URLRequest(url: parts.url!)
        request.httpMethod = method
        if representation { request.setValue("return=representation", forHTTPHeaderField: "Prefer") }
        request.timeoutInterval = 30
        request.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token {
            guard !token.isEmpty, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if method != "GET" { request.httpBody = body }
        let (data, response) = try await transport(request)
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401 { throw CloudError.authenticationRequired }
            // Never expose Auth error bodies, tokens or request credentials in UI logs.
            throw CloudError.rejected(response.statusCode)
        }
        guard data.count <= 10 * 1024 * 1024 else { throw CloudError.malformedResponse }
        return data
    }
    public func signIn(email: String, password: String) async throws -> Session {
        let body = try JSONEncoder().encode(["email": email, "password": password])
        return try JSONDecoder().decode(Session.self, from: await send(path: "auth/v1/token", body: body, query: "grant_type=password"))
    }
    public func signUp(email: String, password: String) async throws -> Session? {
        guard password.count >= 8, !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw CloudError.invalidInput }
        let body = try JSONEncoder().encode(["email": email, "password": password])
        let data = try await send(path: "auth/v1/signup", body: body)
        struct Result: Decodable { let access_token: String? }
        let result = try JSONDecoder().decode(Result.self, from: data)
        guard let token = result.access_token, !token.isEmpty else { return nil }
        return try JSONDecoder().decode(Session.self, from: data)
    }
    public func requestPasswordReset(email: String) async throws {
        guard !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw CloudError.invalidInput }
        var query = URLComponents()
        query.queryItems = [URLQueryItem(name: "redirect_to", value: "https://ouchi-maintenance.vercel.app/reset-password")]
        _ = try await send(path: "auth/v1/recover", body: JSONEncoder().encode(["email": email]), query: query.percentEncodedQuery)
    }
    public func refresh(_ session: Session) async throws -> Session {
        let body = try JSONEncoder().encode(["refresh_token": session.refresh_token])
        return try JSONDecoder().decode(Session.self, from: await send(path: "auth/v1/token", body: body, query: "grant_type=refresh_token"))
    }
    /// Terminate only this Auth session. Does not clear local storage or claim
    /// existing JWTs become unusable; sensitive server operations check sessions.
    public func revokeCurrentSession(token: String) async throws {
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        var parts = URLComponents(url: config.url.appendingPathComponent("auth/v1/logout"), resolvingAgainstBaseURL: false)!
        parts.queryItems = [URLQueryItem(name: "scope", value: "local")]
        let url = parts.url!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"; request.timeoutInterval = 15; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        let (bytes, response) = try await transport(request)
        guard response.url == url else { throw CloudError.malformedResponse }
        guard response.statusCode == 204 else {
            if response.statusCode == 401 { throw CloudError.authenticationRequired }
            throw CloudError.rejected(response.statusCode)
        }
        guard bytes.isEmpty else { throw CloudError.malformedResponse }
    }
    public func load(token: String) async throws -> Household {
        return try JSONDecoder().decode(Household.self, from: await send(path: "rest/v1/rpc/load_household", token: token, body: Data("{}".utf8)))
    }
    public func complete(task: String, token: String) async throws {
        let body = try JSONEncoder().encode(["task_id": task])
        _ = try await send(path: "rest/v1/rpc/complete_maintenance", token: token, body: body)
        // Reload authoritative household before showing history or the next due date.
        // Mutations are never retried automatically after an ambiguous network failure.
    }

    public func saveProduct(_ product: Appliance, creating: Bool, tasks: [CareTask] = [], token: String) async throws {
        try product.validate()
        guard creating || tasks.isEmpty else { throw CloudError.invalidInput }
        for task in tasks {
            try task.validate()
            guard task.productId == product.id else { throw CloudError.invalidInput }
        }
        if creating {
            struct Payload: Encodable { let product_data: Appliance; let task_data: [CareTask] }
            _ = try await send(path: "rest/v1/rpc/add_product_with_tasks", token: token,
                               body: JSONEncoder().encode(Payload(product_data: product, task_data: tasks)))
        } else {
            try await write(table: "products", id: product.id, body: cloudBody(product, nullable: ["purchaseDate", "installedDate", "memo"]), creating: false, token: token)
        }
    }
    public func saveTask(_ task: CareTask, creating: Bool, token: String) async throws {
        try task.validate()
        try await write(table: "maintenance_tasks", id: task.id, body: cloudBody(task, nullable: ["lastCompletedAt", "sourceUrl", "sourceNote", "sourceFrequency"]), creating: creating, token: token)
    }
    private func cloudBody<T: Encodable>(_ value: T, nullable: [String]) throws -> Data {
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as! [String: Any]
        for key in nullable where object[key] == nil { object[key] = NSNull() }
        return try JSONSerialization.data(withJSONObject: object)
    }
    private func write(table: String, id: String, body: Data, creating: Bool, token: String) async throws {
        guard let uuid = UUID(uuidString: id) else { throw CloudError.invalidInput }
        let data = try await send(path: "rest/v1/" + table, token: token, body: body,
                                  query: creating ? "select=id" : "id=eq.\(uuid.uuidString.lowercased())&select=id",
                                  method: creating ? "POST" : "PATCH", representation: true)
        struct Row: Decodable { let id: String }
        let rows = try JSONDecoder().decode([Row].self, from: data)
        guard rows.count == 1, UUID(uuidString: rows[0].id) == uuid else { throw CloudError.unavailable }
    }

    public enum DeletableRecord: String, Sendable { case product = "products", task = "maintenance_tasks", home = "homes" }
    public func deleteRecord(_ record: DeletableRecord, id: String, token: String) async throws {
        guard let uuid = UUID(uuidString: id) else { throw CloudError.invalidInput }
        let data = try await send(path: "rest/v1/" + record.rawValue, token: token, body: Data(),
                                  query: "id=eq.\(uuid.uuidString.lowercased())&select=id", method: "DELETE", representation: true)
        struct Row: Decodable { let id: String }
        let rows = try JSONDecoder().decode([Row].self, from: data)
        guard rows.count == 1, UUID(uuidString: rows[0].id) == uuid else { throw CloudError.unavailable }
    }
    public func createHome(name: String, kind: String, token: String) async throws {
        try validateHome(name: name, kind: kind)
        _ = try await send(path: "rest/v1/rpc/create_maintenance_home", token: token,
                           body: JSONEncoder().encode(["home_name": name.trimmingCharacters(in: .whitespacesAndNewlines), "home_kind": kind]))
    }
    public func updateHome(id: String, name: String, kind: String, token: String) async throws {
        try validateHome(name: name, kind: kind)
        try await write(table: "homes", id: id,
                        body: JSONEncoder().encode(["name": name.trimmingCharacters(in: .whitespacesAndNewlines), "kind": kind]), creating: false, token: token)
    }
    private func validateHome(name: String, kind: String) throws {
        guard (1...80).contains(name.trimmingCharacters(in: .whitespacesAndNewlines).count),
              ["home", "parents", "second", "rental"].contains(kind) else { throw CloudError.invalidInput }
    }
    public func restoreBackup(_ prepared: Backup.Prepared, token: String) async throws {
        let payload = try JSONSerialization.jsonObject(with: prepared.payload)
        let body = try JSONSerialization.data(withJSONObject: ["backup_hash": prepared.hash, "payload": payload])
        let data = try await send(path: "rest/v1/rpc/restore_maintenance_backup", token: token, body: body)
        guard try JSONDecoder().decode(Bool.self, from: data) else { throw CloudError.unavailable }
    }
    public func createInvite(home: String, token: String) async throws -> String {
        guard UUID(uuidString: home) != nil else { throw CloudError.invalidInput }
        let data = try await send(path: "rest/v1/rpc/create_home_invite", token: token, body: JSONEncoder().encode(["home_id": home]))
        let code = try JSONDecoder().decode(String.self, from: data)
        guard Self.validInvite(code) else { throw CloudError.malformedResponse }
        return code
    }
    public static func validInvite(_ code: String) -> Bool {
        code.range(of: #"^[0-9a-f]{64}$"#, options: .regularExpression) != nil
    }
    public func acceptInvite(code: String, name: String, token: String) async throws {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard Self.validInvite(code), (1...80).contains(clean.count) else { throw CloudError.invalidInput }
        _ = try await send(path: "rest/v1/rpc/accept_home_invite", token: token,
                           body: JSONEncoder().encode(["invite_code": code, "member_name": clean]))
    }
    public func members(home: String, token: String) async throws -> [FamilyMember] {
        guard let uuid = UUID(uuidString: home) else { throw CloudError.invalidInput }
        let data = try await send(path: "rest/v1/home_members", token: token, body: Data(),
                                  query: "homeId=eq.\(uuid.uuidString.lowercased())&select=user_id,nickname", method: "GET")
        return try JSONDecoder().decode([FamilyMember].self, from: data)
    }
    public func revokeInvites(home: String, token: String) async throws {
        guard let uuid = UUID(uuidString: home) else { throw CloudError.invalidInput }
        _ = try await send(path: "rest/v1/home_invites", token: token, body: Data(#"{"revoked":true}"#.utf8),
                           query: "homeId=eq.\(uuid.uuidString.lowercased())&used_at=is.null", method: "PATCH")
    }
    public func removeMember(home: String, user: UUID, token: String) async throws {
        guard let uuid = UUID(uuidString: home) else { throw CloudError.invalidInput }
        let data = try await send(path: "rest/v1/home_members", token: token, body: Data(),
                                  query: "homeId=eq.\(uuid.uuidString.lowercased())&user_id=eq.\(user.uuidString.lowercased())&select=user_id,nickname",
                                  method: "DELETE", representation: true)
        let rows = try JSONDecoder().decode([FamilyMember].self, from: data)
        guard rows.count == 1, rows[0].user_id == user else { throw CloudError.unavailable }
    }
}

public struct FamilyMember: Codable, Identifiable, Sendable {
    public let user_id: UUID
    public let nickname: String
    public var id: UUID { user_id }
}
