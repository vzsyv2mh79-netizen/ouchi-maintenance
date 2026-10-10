import Foundation

public enum CloudError: Error, Equatable {
    case invalidConfiguration, authenticationRequired, rejected(Int), malformedResponse, invalidInput, unavailable
}

public struct CloudConfiguration: Sendable {
    public let url: URL
    public let publishableKey: String
    public init(url: URL, publishableKey: String) throws {
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
    public init(config: CloudConfiguration, transport: @escaping Transport = { request in
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
        return (data, response)
    }) { self.config = config; self.transport = transport }

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
        request.httpBody = body
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
    public func refresh(_ session: Session) async throws -> Session {
        let body = try JSONEncoder().encode(["refresh_token": session.refresh_token])
        return try JSONDecoder().decode(Session.self, from: await send(path: "auth/v1/token", body: body, query: "grant_type=refresh_token"))
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

    public func saveProduct(_ product: Appliance, creating: Bool, token: String) async throws {
        try product.validate()
        if creating {
            struct Payload: Encodable { let product_data: Appliance; let task_data: [CareTask] }
            _ = try await send(path: "rest/v1/rpc/add_product_with_tasks", token: token,
                               body: JSONEncoder().encode(Payload(product_data: product, task_data: [])))
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
}
