import Foundation
import OuchiCore

@main struct AuthSmoke {
    static func main() async throws {
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_only")
        let signup = HouseholdAPI(config: config) { request in
            precondition(request.url?.path == "/auth/v1/signup" && request.httpMethod == "POST")
            precondition(request.value(forHTTPHeaderField: "Authorization") == nil)
            precondition(request.value(forHTTPHeaderField: "apikey") == config.publishableKey)
            let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
            precondition(body == ["email": "synthetic@example.invalid", "password": "synthetic-password"])
            return (Data("{\"user\":{\"id\":\"synthetic-confirmation\"}}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let value = try await signup.signUp(email: "synthetic@example.invalid", password: "synthetic-password")
        precondition(value == nil)
        do { _ = try await signup.signUp(email: "synthetic@example.invalid", password: "short"); fatalError("invalid input sent") }
        catch { precondition(error as? CloudError == .invalidInput) }
        let recover = HouseholdAPI(config: config) { request in
            precondition(request.url?.path == "/auth/v1/recover")
            let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            precondition(query.first?.name == "redirect_to" && query.first?.value == "https://ouchi-maintenance.vercel.app/reset-password")
            let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
            precondition(body == ["email": "synthetic@example.invalid"])
            return (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        try await recover.requestPasswordReset(email: "synthetic@example.invalid")
        let limited = HouseholdAPI(config: config) { request in (Data("private error".utf8), HTTPURLResponse(url: request.url!, statusCode: 429, httpVersion: nil, headerFields: nil)!) }
        do { _ = try await limited.signUp(email: "synthetic@example.invalid", password: "synthetic-password"); fatalError("limited signup accepted") }
        catch { precondition(error as? CloudError == .rejected(429)) }
        print("AuthSmoke PASS: signup endpoint/body, confirmation requires login, short-password rejection, recovery redirect, rate limit. No email/network.")
    }
}
