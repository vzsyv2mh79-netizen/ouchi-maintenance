import Foundation
import OuchiCore

final class SyntheticAttestCallback: @unchecked Sendable {
    private let lock = NSLock()
    private var callback: AppAttestDeviceService.ProofCompletion?
    func install(_ completion: @escaping AppAttestDeviceService.ProofCompletion) { lock.lock(); callback = completion; lock.unlock() }
    func ready() -> Bool { lock.lock(); defer { lock.unlock() }; return callback != nil }
    func finish(_ data: Data) {
        lock.lock(); let completion = callback; callback = nil; lock.unlock()
        precondition(completion != nil); completion!(data,nil)
    }
}
@main struct AppAttestDeviceSmoke {
    static let now: Int64 = 1_791_727_200_000
    static let scope = AppAttestRegistrationScope(userID:UUID(uuidString:"11111111-1111-4111-8111-111111111111")!,sessionID:UUID(uuidString:"22222222-2222-4222-8222-222222222222")!,epochID:UUID(uuidString:"33333333-3333-4333-8333-333333333333")!,keyID:Data(repeating:1,count:32).base64EncodedString(),appID:"SYNTHETIC1.dev.synthetic.ouchi",environment:"production")
    static func refused(_ f: @Sendable () async throws -> Void) async { do { try await f(); fatalError("unsafe DeviceCheck boundary accepted") } catch {} }
    static func main() async throws {
        let nonce = Data(repeating:3,count:32).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        let text = "{\"version\":1,\"purpose\":\"register_ouchi_attested_key\",\"nonce\":\"\(nonce)\",\"issuedAt\":\(now),\"expiresAt\":\(now+300000),\"userID\":\"\(scope.userID.uuidString.lowercased())\",\"sessionID\":\"\(scope.sessionID.uuidString.lowercased())\",\"epochID\":\"\(scope.epochID.uuidString.lowercased())\",\"requestID\":\"44444444-4444-4444-8444-444444444444\",\"keyID\":\"\(scope.keyID)\",\"appID\":\"\(scope.appID)\",\"attestEnvironment\":\"\(scope.environment)\"}"
        let challenge = try AppAttestRegistrationChallenge.parse(canonicalClientData:Data(text.utf8),expected:scope,nowMilliseconds:now)
        let unsupported = AppAttestDeviceService(operations:.init(supported:{ false },generate:{ _ in fatalError("unsupported generation") },attest:{ _,_,_ in fatalError("unsupported attestation") }))
        await refused { _ = try await unsupported.generateKey() }
        await refused { _ = try await unsupported.attest(challenge,scope:scope,nowMilliseconds:now) }
        let proof = Data("synthetic-opaque-attestation".utf8)
        let valid = AppAttestDeviceService(operations:.init(supported:{ true },generate:{ $0(scope.keyID,nil) },attest:{ key,hash,done in
            precondition(key == scope.keyID && hash == challenge.clientDataHash && hash.count == 32)
            done(proof,nil)
        }))
        let key = try await valid.generateKey(); precondition(key == scope.keyID)
        let attested = try await valid.attest(challenge,scope:scope,nowMilliseconds:now); precondition(attested == proof)
        let invalidKey = AppAttestDeviceService(operations:.init(supported:{ true },generate:{ $0("bad",nil) },attest:{ _,_,_ in fatalError("unexpected") }))
        await refused { _ = try await invalidKey.generateKey() }
        let missing = AppAttestDeviceService(operations:.init(supported:{ true },generate:{ $0(nil,nil) },attest:{ _,_,done in done(nil,nil) }))
        await refused { _ = try await missing.generateKey() }
        await refused { _ = try await missing.attest(challenge,scope:scope,nowMilliseconds:now) }
        for invalid in [Data(), Data(repeating:1,count:131073)] {
            let oversized = AppAttestDeviceService(operations:.init(supported:{ true },generate:{ $0(scope.keyID,nil) },attest:{ _,_,done in done(invalid,nil) }))
            await refused { _ = try await oversized.attest(challenge,scope:scope,nowMilliseconds:now) }
        }
        let neverCalled = AppAttestDeviceService(operations:.init(supported:{ fatalError("expired challenge reached service") },generate:{ _ in fatalError("unexpected") },attest:{ _,_,_ in fatalError("unexpected") }))
        await refused { _ = try await neverCalled.attest(challenge,scope:scope,nowMilliseconds:now+300000) }
        let other = AppAttestRegistrationScope(userID:UUID(),sessionID:scope.sessionID,epochID:scope.epochID,keyID:scope.keyID,appID:scope.appID,environment:scope.environment)
        await refused { _ = try await neverCalled.attest(challenge,scope:other,nowMilliseconds:now) }
        let callback = SyntheticAttestCallback()
        let delayed = AppAttestDeviceService(operations:.init(supported:{ true },generate:{ $0(scope.keyID,nil) },attest:{ _,_,done in callback.install(done) }))
        let task = Task { try await delayed.attest(challenge,scope:scope,nowMilliseconds:now) }
        for _ in 0..<10000 { if callback.ready() { break }; await Task.yield() }
        precondition(callback.ready()); task.cancel(); callback.finish(proof)
        let completedAfterCancellation = try await task.value; precondition(completedAfterCancellation == proof,"completed Apple result must remain available for durable staging")
        let cancelled = Task {
            while !Task.isCancelled { await Task.yield() }
            return try await neverCalled.generateKey()
        }; cancelled.cancel()
        await refused { _ = try await cancelled.value }
        print("PASS: injected DeviceCheck callbacks only: support/key/hash/scope/expiry/size validation, missing callback values, pre-cancellation refusal and completed proof preservation after in-flight cancellation. No Apple service, Secure Enclave key, owner secret or entitlement.")
    }
}
