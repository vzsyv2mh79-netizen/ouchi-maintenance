import Foundation
import OuchiCore

final class MemoryVault: SessionStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var data: Data?
    init(_ data: Data?) { self.data = data }
    func read() -> Data? { lock.withLock { data } }
    func write(_ data: Data?) { lock.withLock { self.data = data } }
}
actor Requests {
    var count = 0
    func receive(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        count += 1
        precondition(request.url?.query == "grant_type=refresh_token")
        let body = try JSONDecoder().decode([String:String].self, from: request.httpBody!)
        precondition(body == ["refresh_token":"expired-refresh"])
        try await Task.sleep(for: .milliseconds(30))
        return (Data(#"{"access_token":"rotated","refresh_token":"rotated-refresh","expires_at":2000000000,"user":{"id":"11111111-1111-4111-8111-111111111111"}}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}

@main struct SessionSmoke {
    static func main() async throws {
        let expired = Data(#"{"access_token":"expired","refresh_token":"expired-refresh","expires_at":1,"user":{"id":"11111111-1111-4111-8111-111111111111"}}"#.utf8)
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_test_only")
        let requests = Requests()
        let api = HouseholdAPI(config: config) { try await requests.receive($0) }
        let vault = MemoryVault(expired)
        let controller = SessionController(api: api, storage: vault)
        let restored = try await controller.restore()
        precondition(restored)
        try await withThrowingTaskGroup(of: String.self) { group in
            for _ in 0..<25 { group.addTask { try await controller.credentials(now: Date(timeIntervalSince1970:100)).access_token } }
            for try await token in group { precondition(token == "rotated") }
        }
        let count = await requests.count
        precondition(count == 1)
        let saved = try JSONDecoder().decode(Session.self, from: vault.read()!)
        precondition(saved.refresh_token == "rotated-refresh")
        try await controller.signOut()
        precondition(vault.read() == nil)
        do { _ = try await controller.credentials(); fatalError("logged out session") }
        catch { precondition(error as? CloudError == .authenticationRequired) }

        // A cancelled refresh must not repopulate storage after logout, even if transport ignores cancellation.
        let slowAPI = HouseholdAPI(config: config) { request in
            try? await Task.sleep(for: .milliseconds(50))
            return (Data(#"{"access_token":"late","refresh_token":"late-refresh","expires_at":2000000000,"user":{"id":"11111111-1111-4111-8111-111111111111"}}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let secondVault = MemoryVault(expired)
        let second = SessionController(api: slowAPI, storage: secondVault)
        _ = try await second.restore()
        let pending = Task { try await second.credentials(now: Date(timeIntervalSince1970:100)) }
        try await Task.sleep(for: .milliseconds(10))
        try await second.signOut()
        do { _ = try await pending.value; fatalError("late refresh accepted") }
        catch { precondition(error is CancellationError || error as? CloudError == .authenticationRequired) }
        precondition(secondVault.read() == nil)
        print("PASS: 25 concurrent consumers use one refresh, rotated token persists, logout clears storage, late refresh cannot resurrect session. Mock transport only.")
    }
}
