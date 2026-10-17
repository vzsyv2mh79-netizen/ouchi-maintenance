import Foundation
import OuchiCore
@main struct ProfileSmoke {
    static func main() async throws {
        let user = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let config = try CloudConfiguration(url: URL(string: "https://abcdefghijklmnopqrst.supabase.co")!, publishableKey: "sb_publishable_synthetic_test_only")
        let bytes = Data("{\"id\":\"11111111-1111-4111-8111-111111111111\",\"email\":\"synthetic@example.invalid\"}".utf8)
        let api = HouseholdAPI(config: config) { request in
            precondition(request.url?.absoluteString == "https://abcdefghijklmnopqrst.supabase.co/auth/v1/user")
            precondition(request.httpMethod == "GET" && request.httpBody == nil)
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
            precondition(request.cachePolicy == .reloadIgnoringLocalCacheData)
            return (bytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let profile = try await api.currentUser(token: "synthetic", expectedUser: user)
        precondition(profile.email == "synthetic@example.invalid")
        do { _ = try await api.currentUser(token: "synthetic", expectedUser: UUID()); fatalError("different profile accepted") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        let redirect = HouseholdAPI(config: config) { _ in (bytes, HTTPURLResponse(url: URL(string: "https://example.invalid")!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
        do { _ = try await redirect.currentUser(token: "synthetic", expectedUser: user); fatalError("redirect accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        for status in [201,401,503] {
            let failure = HouseholdAPI(config: config) { request in (bytes, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!) }
            do { _ = try await failure.currentUser(token: "synthetic", expectedUser: user); fatalError("invalid response accepted") }
            catch { precondition(error as? CloudError == (status == 401 ? .authenticationRequired : .rejected(status))) }
        }
        let old = try JSONDecoder().decode(Session.User.self, from: Data("{\"id\":\"11111111-1111-4111-8111-111111111111\"}".utf8))
        precondition(old.email == nil)
        print("ProfileSmoke PASS: authenticated GET, current-user match, redirect/status refusal and old profile compatibility. Mock only; no real Auth call.")
    }
}
