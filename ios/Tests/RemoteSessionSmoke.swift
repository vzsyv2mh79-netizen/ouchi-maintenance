import Foundation
import OuchiCore
private final class LogoutVault: SessionStorage, @unchecked Sendable {
    private let lock = NSLock(); private var data: Data?
    init(_ value: Data) { data = value }
    func read() -> Data? { lock.withLock { data } }
    func write(_ value: Data?) { lock.withLock { data = value } }
}
private actor LogoutGate {
    private var pending: CheckedContinuation<(Data, HTTPURLResponse), Error>?
    private var request: URLRequest?
    private var started: [CheckedContinuation<Void, Never>] = []
    func receive(_ value: URLRequest) async throws -> (Data, HTTPURLResponse) {
        if value.url?.path == "/auth/v1/logout" {
            precondition(value.value(forHTTPHeaderField: "Authorization") == "Bearer original")
            request = value
            return try await withCheckedThrowingContinuation { continuation in
                pending = continuation; started.forEach { $0.resume() }; started = []
            }
        }
        precondition(value.url?.query == "grant_type=password")
        let body = Data(#"{"access_token":"replacement","refresh_token":"replacement-refresh","expires_at":2000000000,"user":{"id":"22222222-2222-4222-8222-222222222222"}}"#.utf8)
        return (body, HTTPURLResponse(url: value.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
    func waitUntilStarted() async {
        if pending != nil { return }
        await withCheckedContinuation { started.append($0) }
    }
    func finish() {
        pending?.resume(returning: (Data(), HTTPURLResponse(url: request!.url!, statusCode: 204, httpVersion: nil, headerFields: nil)!)); pending = nil
    }
}
@main struct RemoteSessionSmoke {
    static func main() async throws {
        let original = Data(#"{"access_token":"original","refresh_token":"original-refresh","expires_at":2000000000,"user":{"id":"11111111-1111-4111-8111-111111111111"}}"#.utf8)
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_test_only")
        let vault = LogoutVault(original), gate = LogoutGate()
        let controller = SessionController(api: HouseholdAPI(config: config) { try await gate.receive($0) }, storage: vault)
        _ = try await controller.restore()
        let pending = Task { try await controller.revokeRemoteSession() }
        await gate.waitUntilStarted()
        try await controller.signIn(email: "synthetic@example.invalid", password: "synthetic")
        await gate.finish()
        do { try await pending.value; fatalError("stale logout accepted") }
        catch { precondition(error is CancellationError) }
        let current = try await controller.credentials(); precondition(current.access_token == "replacement")
        let stored = try JSONDecoder().decode(Session.self, from: vault.read()!)
        precondition(stored.access_token == "replacement")
        let failedVault = LogoutVault(original)
        let failed = SessionController(api: HouseholdAPI(config: config) { request in (Data(), HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!) }, storage: failedVault)
        _ = try await failed.restore()
        do { try await failed.revokeRemoteSession(); fatalError("failed logout accepted") }
        catch { precondition(error as? CloudError == .rejected(503)) }
        precondition(failedVault.read() == original)
        let retained = try await failed.credentials(); precondition(retained.access_token == "original")
        print("RemoteSessionSmoke PASS: late revocation does not act on replacement login; failed remote revocation retains local session for retry. Mock only.")
    }
}
