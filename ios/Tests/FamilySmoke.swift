import Foundation
import OuchiCore

@main struct FamilySmoke {
    static func main() async throws {
        let home = UUID().uuidString.lowercased(), user = UUID(), code = String(repeating: "a", count: 64)
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_only")
        let create = HouseholdAPI(config: config) { request in
            precondition(request.httpMethod == "POST" && request.url?.path == "/rest/v1/rpc/create_home_invite")
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
            let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
            precondition(body == ["home_id": home])
            return (try JSONEncoder().encode(code), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let result = try await create.createInvite(home: home, token: "synthetic")
        precondition(result == code)
        let accept = HouseholdAPI(config: config) { request in
            precondition(request.url?.path == "/rest/v1/rpc/accept_home_invite")
            let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
            precondition(body == ["invite_code": code, "member_name": "家族"])
            return (Data("null".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        try await accept.acceptInvite(code: code, name: " 家族 ", token: "synthetic")
        do { try await accept.acceptInvite(code: "bad", name: "家族", token: "synthetic"); fatalError("invalid invite reached network") }
        catch { precondition(error as? CloudError == .invalidInput) }
        let list = HouseholdAPI(config: config) { request in
            precondition(request.httpMethod == "GET" && request.httpBody == nil)
            precondition(request.url?.query == "homeId=eq.\(home)&select=user_id,nickname")
            return (Data("[{\"user_id\":\"\(user.uuidString)\",\"nickname\":\"家族\"}]".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let members = try await list.members(home: home, token: "synthetic")
        precondition(members.count == 1 && members[0].id == user)
        let remove = HouseholdAPI(config: config) { request in
            precondition(request.httpMethod == "DELETE")
            precondition(request.url?.query == "homeId=eq.\(home)&user_id=eq.\(user.uuidString.lowercased())&select=user_id,nickname")
            return (Data("[]".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        do { try await remove.removeMember(home: home, user: user, token: "synthetic"); fatalError("missing membership accepted") }
        catch { precondition(error as? CloudError == .unavailable) }
        let revoked = HouseholdAPI(config: config) { request in
            precondition(request.httpMethod == "PATCH" && request.url?.path == "/rest/v1/home_invites")
            precondition(request.url?.query == "homeId=eq.\(home)&used_at=is.null")
            let body = try JSONDecoder().decode([String: Bool].self, from: request.httpBody!)
            precondition(body == ["revoked": true])
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 204, httpVersion: nil, headerFields: nil)!)
        }
        try await revoked.revokeInvites(home: home, token: "synthetic")
        print("FamilySmoke PASS: authenticated invite/create/join/list, invalid-code rejection, scoped membership removal and unused-invite revocation. No network.")
    }
}
