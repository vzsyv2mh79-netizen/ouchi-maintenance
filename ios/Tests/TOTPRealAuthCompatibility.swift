// Isolated real-GoTrue compatibility proof; no production URL or Keychain.
import Foundation
import OuchiCore

private struct Input: Decodable {
    let origin: URL; let email: String; let password: String; let account: UUID
    let stale: Session; let code: String
}
private final class MemorySession: SessionStorage, @unchecked Sendable {
    private let lock = NSLock(); private var value: Data?
    init(_ data: Data) { value = data }
    func read() throws -> Data? { lock.lock(); defer { lock.unlock() }; return value }
    func write(_ data: Data?) throws { lock.lock(); defer { lock.unlock() }; value = data }
}
private final class NoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
@main struct Compatibility {
    static func main() async throws {
        let input = try JSONDecoder().decode(Input.self, from: FileHandle.standardInput.readDataToEndOfFile())
        precondition(input.origin.scheme == "http" && input.origin.host == "127.0.0.1" && input.origin.port != nil)
        let config = try CloudConfiguration(url: URL(string: "https://hphifiqyypwyxkzfanod.supabase.co")!, publishableKey: "sb_publishable_disposable_fixture_only")
        let transport: HouseholdAPI.Transport = { original in
            guard let url = original.url, url.host == config.url.host, url.path.hasPrefix("/auth/v1/") else { throw CloudError.invalidConfiguration }
            var parts = URLComponents(url: input.origin, resolvingAgainstBaseURL: false)!
            parts.path = String(url.path.dropFirst("/auth/v1".count)); parts.percentEncodedQuery = URLComponents(url: url, resolvingAgainstBaseURL: false)!.percentEncodedQuery
            var request = original; request.url = parts.url
            let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (data, raw) = try await session.data(for: request)
            guard let response = raw as? HTTPURLResponse, response.url == request.url else { throw CloudError.malformedResponse }
            // Test-only fixed-origin proxy, real status/body. Shipping origin and
            // redirect checks remain intact; this is not a hosted TLS proof.
            return (data, HTTPURLResponse(url: url, statusCode: response.statusCode, httpVersion: nil, headerFields: nil)!)
        }
        let api = HouseholdAPI(config: config, transport: transport), mfa = TOTPVerificationAPI(config: config, transport: transport)
        let storage = MemorySession(try JSONEncoder().encode(input.stale))
        let controller = SessionController(api: api, storage: storage)
        let restored = try await controller.restore(); precondition(restored)
        do { _ = try await api.currentUser(token: input.stale.access_token, expectedUser: input.account); preconditionFailure("Revoked session accepted") }
        catch { precondition(error as? CloudError == .authenticationRequired || error as? CloudError == .rejected(403)) }
        print("CHECK: stale Native session rejected")
        try await controller.signIn(email: input.email, password: input.password)
        print("CHECK: password re-login returned")
        let fresh = try await controller.credentials(); precondition(fresh.user.id == input.account && fresh.access_token != input.stale.access_token)
        let factors = try await controller.totpFactors(api: mfa, expectedAccount: input.account); precondition(factors.count == 1)
        print("CHECK: existing verified factor returned")
        let challenge = try await controller.totpChallenge(api: mfa, factorID: factors[0].id, expectedAccount: input.account)
        print("CHECK: TOTP challenge returned")
        try await controller.verifyTOTP(api: mfa, challenge: challenge, code: input.code, expectedAccount: input.account)
        let promoted = try await controller.credentials(); precondition(promoted.user.id == input.account && promoted.access_token != fresh.access_token)
        let persisted = try JSONDecoder().decode(Session.self, from: storage.read()!)
        precondition(persisted.access_token == promoted.access_token)
        _ = try await api.currentUser(token: promoted.access_token, expectedUser: input.account)
        print("PASS: actual Swift SessionController re-login and registered TOTP challenge/verify after real low-AAL session revocation; memory custody readback only")
    }
}
