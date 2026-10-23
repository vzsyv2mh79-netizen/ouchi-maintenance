import Foundation
import OuchiCore

final class SyntheticRestoreCallback: @unchecked Sendable {
    private let lock = NSLock()
    private var callback: RestoreAssertionDeviceService.Completion?
    func install(_ completion: @escaping RestoreAssertionDeviceService.Completion) { lock.lock(); callback = completion; lock.unlock() }
    func ready() -> Bool { lock.lock(); defer { lock.unlock() }; return callback != nil }
    func finish(_ data: Data) { lock.lock(); let completion = callback; callback = nil; lock.unlock(); precondition(completion != nil); completion!(data,nil) }
}
actor SyntheticRestoreScopeProbe {
    private var checks = 0
    func validate() throws { checks += 1; if checks == 2 { throw CloudError.authenticationRequired } }
}
final class SyntheticRestoreClock: @unchecked Sendable {
    private let lock = NSLock()
    private var checks = 0
    func now() -> Int64 { lock.lock(); defer { lock.unlock() }; checks += 1; return checks == 1 ? 1791727200001 : 1791727500000 }
}
@main struct RestoreAssertionDeviceSmoke {
    static func refused(_ operation: @Sendable () async throws -> Void) async { do { try await operation(); fatalError("Unsafe restore assertion accepted") } catch {} }
    static func main() async throws {
        let text = #"{"version":1,"purpose":"restore_ouchi_subscription","nonce":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc","issuedAt":1791727200000,"expiresAt":1791727500000,"userID":"11111111-1111-4111-8111-111111111111","sessionID":"22222222-2222-4222-8222-222222222222","epochID":"33333333-3333-4333-8333-333333333333","requestID":"44444444-4444-4444-8444-444444444444","keyID":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=","appID":"SYNTHETIC1.dev.synthetic.ouchi","attestEnvironment":"development","purchaseEnvironment":"Sandbox","proofSHA256":"ed30e17c16007492e113af953fdbe0387fc08b5f4b4cf5eae6f9f6bd7a2dec27"}"#
        let scope = RestoreAssertionScope(userID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!, sessionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, keyID: Data(repeating: 1, count: 32).base64EncodedString(), appID: "SYNTHETIC1.dev.synthetic.ouchi", environment: "development", requestID: UUID(uuidString: "44444444-4444-4444-8444-444444444444")!, proofSHA256: "ed30e17c16007492e113af953fdbe0387fc08b5f4b4cf5eae6f9f6bd7a2dec27")
        let now: Int64 = 1791727200001
        let challenge = try RestoreAssertionChallenge.parse(canonicalClientData: Data(text.utf8), expected: scope, nowMilliseconds: now)
        let proof = Data("synthetic-not-a-signed-assertion".utf8)
        let valid = RestoreAssertionDeviceService(operations: .init(supported: { true }, generate: { key,hash,done in
            precondition(key == scope.keyID && hash == challenge.clientDataHash && hash.count == 32); done(proof,nil)
        }))
        let result = try await valid.generate(challenge: challenge, scope: scope, validateCurrentScope: {}, now: { now })
        precondition(result == proof)
        let changed = SyntheticRestoreScopeProbe()
        await refused { _ = try await valid.generate(challenge: challenge, scope: scope,
            validateCurrentScope: { try await changed.validate() }, now: { now }) }
        let clock = SyntheticRestoreClock()
        await refused { _ = try await valid.generate(challenge: challenge, scope: scope,
            validateCurrentScope: {}, now: { clock.now() }) }
        let never = RestoreAssertionDeviceService(operations: .init(supported: { fatalError("Invalid scope reached device") }, generate: { _,_,_ in fatalError("Invalid proof reached device") }))
        await refused { _ = try await never.generate(challenge: challenge, scope: scope, validateCurrentScope: { throw CloudError.authenticationRequired }, now: { now }) }
        await refused { _ = try await never.generate(challenge: challenge, scope: scope, validateCurrentScope: {}, now: { 1791727500000 }) }
        let unsupported = RestoreAssertionDeviceService(operations: .init(supported: { false }, generate: { _,_,_ in fatalError("Unsupported device invoked") }))
        await refused { _ = try await unsupported.generate(challenge: challenge, scope: scope, validateCurrentScope: {}, now: { now }) }
        for bad in [Data(), Data(repeating: 1, count: 131073)] {
            let service = RestoreAssertionDeviceService(operations: .init(supported: { true }, generate: { _,_,done in done(bad,nil) }))
            await refused { _ = try await service.generate(challenge: challenge, scope: scope, validateCurrentScope: {}, now: { now }) }
        }
        let missing = RestoreAssertionDeviceService(operations: .init(supported: { true }, generate: { _,_,done in done(nil,nil) }))
        await refused { _ = try await missing.generate(challenge: challenge, scope: scope, validateCurrentScope: {}, now: { now }) }
        let failure = RestoreAssertionDeviceService(operations: .init(supported: { true }, generate: { _,_,done in done(proof,CloudError.unavailable) }))
        await refused { _ = try await failure.generate(challenge: challenge, scope: scope, validateCurrentScope: {}, now: { now }) }
        let callback = SyntheticRestoreCallback()
        let delayed = RestoreAssertionDeviceService(operations: .init(supported: { true }, generate: { _,_,done in callback.install(done) }))
        let task = Task { try await delayed.generate(challenge: challenge, scope: scope, validateCurrentScope: {}, now: { now }) }
        for _ in 0..<10000 { if callback.ready() { break }; await Task.yield() }
        precondition(callback.ready()); task.cancel(); callback.finish(proof)
        await refused { _ = try await task.value }
        print("PASS: mocked restore DeviceCheck key/hash, unavailable device, changed context, expiry, callback errors, size and cancellation; no real key/signature/network/rights")
    }
}

