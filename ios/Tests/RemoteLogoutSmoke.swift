import Foundation
import OuchiCore
@main struct RemoteLogoutSmoke {
    static func main() async throws {
        let config = try CloudConfiguration(url: URL(string: "https://abcdefghijklmnopqrst.supabase.co")!, publishableKey: "sb_publishable_synthetic_test_only")
        let api = HouseholdAPI(config: config) { request in
            precondition(request.url?.absoluteString == "https://abcdefghijklmnopqrst.supabase.co/auth/v1/logout?scope=local")
            precondition(request.httpMethod == "POST" && request.httpBody == nil)
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
            precondition(request.value(forHTTPHeaderField: "apikey") == config.publishableKey)
            precondition(request.cachePolicy == .reloadIgnoringLocalCacheData && request.timeoutInterval == 15)
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 204, httpVersion: nil, headerFields: nil)!)
        }
        try await api.revokeCurrentSession(token: "synthetic")
        for status in [200,401,403,503] {
            let rejected = HouseholdAPI(config: config) { request in (Data(), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!) }
            do { try await rejected.revokeCurrentSession(token: "synthetic"); fatalError("invalid logout ack accepted") }
            catch { precondition(error as? CloudError == (status == 401 ? .authenticationRequired : .rejected(status))) }
        }
        let redirected = HouseholdAPI(config: config) { _ in (Data(), HTTPURLResponse(url: URL(string: "https://example.invalid")!, statusCode: 204, httpVersion: nil, headerFields: nil)!) }
        do { try await redirected.revokeCurrentSession(token: "synthetic"); fatalError("redirect accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        let invalidBody = HouseholdAPI(config: config) { request in (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: 204, httpVersion: nil, headerFields: nil)!) }
        do { try await invalidBody.revokeCurrentSession(token: "synthetic"); fatalError("unexpected body accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        let untouched = HouseholdAPI(config: config) { _ in fatalError("invalid token reached transport") }
        do { try await untouched.revokeCurrentSession(token: "bad token"); fatalError("invalid bearer accepted") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        print("RemoteLogoutSmoke PASS: local-only Auth revocation contract, exact acknowledgement, redirect/error/input refusal. Mock transport; no live session changed.")
    }
}
