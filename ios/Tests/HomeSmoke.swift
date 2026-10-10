import Foundation
import OuchiCore

@main struct HomeSmoke {
    static func main() async throws {
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_only")
        let id = UUID().uuidString.lowercased()
        let create = HouseholdAPI(config: config) { request in
            precondition(request.httpMethod == "POST" && request.url?.path == "/rest/v1/rpc/create_maintenance_home")
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
            let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
            precondition(body == ["home_name": "実家", "home_kind": "parents"])
            return (Data("null".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        try await create.createHome(name: " 実家 ", kind: "parents", token: "synthetic")
        do { try await create.createHome(name: " ", kind: "home", token: "synthetic"); fatalError("blank home sent") }
        catch { precondition(error as? CloudError == .invalidInput) }
        do { try await create.createHome(name: "家", kind: "owner", token: "synthetic"); fatalError("invalid kind sent") }
        catch { precondition(error as? CloudError == .invalidInput) }
        let update = HouseholdAPI(config: config) { request in
            precondition(request.httpMethod == "PATCH" && request.url?.path == "/rest/v1/homes")
            precondition(request.url?.query == "id=eq.\(id)&select=id")
            let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
            precondition(body == ["name": "わが家", "kind": "home"])
            return (Data("[]".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        do { try await update.updateHome(id: id, name: "わが家", kind: "home", token: "synthetic"); fatalError("zero row update accepted") }
        catch { precondition(error as? CloudError == .unavailable) }
        print("HomeSmoke PASS: authenticated create/update contracts, input validation, no owner reassignment, zero-row refusal. No network.")
    }
}
