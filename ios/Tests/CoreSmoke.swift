import Foundation
import OuchiCore

@main struct CoreSmoke {
    static func main() async throws {
        let key = "sb_publishable_synthetic_test_only"
        let base = URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!
        let config = try CloudConfiguration(url: base, publishableKey: key)
        for url in ["http://aaaaaaaaaaaaaaaaaaaa.supabase.co", "https://attacker.com", "https://aaaaaaaaaaaaaaaaaaaa.supabase.co/other", "https://aaaaaaaaaaaaaaaaaaaa.supabase.co?key=secret"] {
            do { _ = try CloudConfiguration(url: URL(string: url)!, publishableKey: key); fatalError("unsafe URL accepted") }
            catch { precondition(error as? CloudError == .invalidConfiguration) }
        }
        do { _ = try CloudConfiguration(url: base, publishableKey: "sb_secret_forbidden"); fatalError("secret accepted") }
        catch { precondition(error as? CloudError == .invalidConfiguration) }
        let fixture = #"{"homes":[{"id":"a","name":"家","kind":"home"},{"id":"b","name":"別宅","kind":"second"}],"products":[{"id":"p1","homeId":"a","categoryId":"washer","maker":"メーカー","name":"洗濯機","modelNumber":"A"},{"id":"p2","homeId":"b","categoryId":"washer","maker":"メーカー","name":"洗濯機","modelNumber":"B"}],"tasks":[{"id":"t1","productId":"p1","name":"掃除","kind":"掃除","intervalDays":7,"nextDueAt":"2026-10-12","sourceKind":"ユーザー設定"},{"id":"t2","productId":"p2","name":"掃除","kind":"掃除","intervalDays":7,"nextDueAt":"2026-10-11","sourceKind":"ユーザー設定"}],"history":[{"id":"h1","taskId":"t1","productId":"p1","completedAt":"2026-10-10"},{"id":"h2","taskId":"t2","productId":"p2","completedAt":"2026-10-09"}]}"#
        let api = HouseholdAPI(config: config) { request in
            precondition(request.httpMethod == "POST")
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic-user-session")
            precondition(request.value(forHTTPHeaderField: "apikey") == key)
            precondition(request.url?.path == "/rest/v1/rpc/load_household")
            return (Data(fixture.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let data = try await api.load(token: "synthetic-user-session")
        precondition(data.tasks(in: "a").map(\.id) == ["t1"])
        precondition(data.history(in: "a").map(\.id) == ["h1"])
        precondition(data.products(in: "missing").isEmpty)
        let restored = try JSONDecoder().decode(Household.self, from: data.export())
        precondition(restored.products.count == 2 && restored.history.count == 2)
        let complete = HouseholdAPI(config: config) { request in
            precondition(request.url?.path == "/rest/v1/rpc/complete_maintenance")
            let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
            precondition(body == ["task_id": "t1"])
            return (Data("null".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        try await complete.complete(task: "t1", token: "synthetic-user-session")
        let denied = HouseholdAPI(config: config) { request in
            (Data("sensitive error must not leak".utf8), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
        }
        do { try await denied.complete(task: "t1", token: "synthetic-user-session"); fatalError("unauthorized completion") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        let signIn = HouseholdAPI(config: config) { request in
            precondition(request.url?.query == "grant_type=password")
            precondition(request.value(forHTTPHeaderField: "Authorization") == nil)
            let body = try JSONDecoder().decode([String:String].self, from: request.httpBody!)
            precondition(body == ["email": "synthetic@example.invalid", "password": "test-only"])
            return (Data(#"{"access_token":"synthetic","refresh_token":"synthetic-refresh","expires_at":2000000000,"user":{"id":"11111111-1111-4111-8111-111111111111"}}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let session = try await signIn.signIn(email: "synthetic@example.invalid", password: "test-only")
        precondition(session.user.id.uuidString.lowercased() == "11111111-1111-4111-8111-111111111111")
        print("PASS: configuration, request authentication, household isolation, export, atomic completion, rejected completion, login contract. No network used.")
    }
}
