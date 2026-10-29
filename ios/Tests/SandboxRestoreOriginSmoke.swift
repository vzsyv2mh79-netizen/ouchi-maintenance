import Foundation
import CryptoKit
import OuchiCore

private actor ReviewRestoreRequests {
    private var paths: [String] = []
    func record(_ path: String) { paths.append(path) }
    func recorded() -> [String] { paths }
}
@main struct SandboxRestoreOriginSmoke {
    static let now: Int64 = 1791727200001
    static let requestID = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    static let scope = AppAttestRegistrationScope(userID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
        sessionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!,
        keyID: Data(repeating: 1, count: 32).base64EncodedString(), appID: "SYNTHETIC1.dev.synthetic.ouchi", environment: "production")
    static let host = "ouchi-maintenance-7gmdv28id-gfgz4m9pkm-8942.vercel.app"
    static let registrationJSON = #"{"version":1,"purpose":"register_ouchi_attested_key","nonce":"AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM","issuedAt":1791727200000,"expiresAt":1791727500000,"userID":"11111111-1111-4111-8111-111111111111","sessionID":"22222222-2222-4222-8222-222222222222","epochID":"33333333-3333-4333-8333-333333333333","requestID":"44444444-4444-4444-8444-444444444444","keyID":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=","appID":"SYNTHETIC1.dev.synthetic.ouchi","attestEnvironment":"production"}"#
    static let restoreJSON = #"{"version":1,"purpose":"restore_ouchi_subscription","nonce":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc","issuedAt":1791727200000,"expiresAt":1791727500000,"userID":"11111111-1111-4111-8111-111111111111","sessionID":"22222222-2222-4222-8222-222222222222","epochID":"33333333-3333-4333-8333-333333333333","requestID":"44444444-4444-4444-8444-444444444444","keyID":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=","appID":"SYNTHETIC1.dev.synthetic.ouchi","attestEnvironment":"production","purchaseEnvironment":"Sandbox","proofSHA256":"ed30e17c16007492e113af953fdbe0387fc08b5f4b4cf5eae6f9f6bd7a2dec27"}"#
    static func session() throws -> AppAttestRegistrationSession {
        let claims = try JSONSerialization.data(withJSONObject: ["sub":scope.userID.uuidString,"session_id":scope.sessionID.uuidString,"exp":1799999999])
        let payload = claims.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return .init(scope: scope, bearer: "e30." + payload + ".synthetic")
    }
    static func pending(_ id: UUID) throws -> PendingRestore {
        let app = "合成app.jws", purchase = "合成purchase.jws"
        let expected = RestoreAssertionScope(userID: scope.userID, sessionID: scope.sessionID, epochID: scope.epochID,
            keyID: scope.keyID, appID: scope.appID, environment: scope.environment, requestID: id,
            proofSHA256: try RestoreAssertionChallenge.pairDigest(signedApp: app, signedTransaction: purchase))
        let text = restoreJSON.replacingOccurrences(of: requestID.uuidString.lowercased(), with: id.uuidString.lowercased())
        let challenge = try RestoreAssertionChallenge.parse(canonicalClientData: Data(text.utf8), expected: expected, nowMilliseconds: now)
        return try PendingRestore(scope: scope, challenge: challenge, signedAppTransaction: app,
            signedTransaction: purchase, assertion: Data("synthetic-assertion".utf8), nowMilliseconds: now)
    }
    static func rejects(_ error: CloudError, _ action: @Sendable () async throws -> Void) async {
        do { try await action(); fatalError("Unexpected restore acknowledgement") }
        catch let actual { precondition(actual as? CloudError == error, "Unexpected rejection: \(actual)") }
    }
    static func main() async throws {
        let captured = try session(), retained = try pending(requestID)
        let registration = try AppAttestRegistrationChallenge.parse(canonicalClientData: Data(registrationJSON.utf8), expected: scope, nowMilliseconds: now)
        for mode in 0...2 {
            let environment: BillingEnvironment = mode == 1 ? .production : .sandbox
            let error: CloudError = mode == 1 ? .invalidInput : mode == 2 ? .malformedResponse : .rejected(503)
            let transport: HouseholdAPI.Transport = { request in
                precondition(mode != 1, "Production proof reached Sandbox review transport")
                precondition(request.url?.host == host && request.url?.scheme == "https")
                precondition(request.httpMethod == "POST" && request.cachePolicy == .reloadIgnoringLocalCacheData)
                precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer " + captured.bearer)
                precondition(request.value(forHTTPHeaderField: "X-Ouchi-App-Epoch") == scope.epochID.uuidString.lowercased())
                let path = request.url!.path
                precondition(path.hasPrefix("/api/app-attest/registration/") || path.hasPrefix("/api/billing/restore/"))
                let url = mode == 2 ? URL(string: "https://ouchi-maintenance.vercel.app" + path)! : request.url!
                return (Data(), HTTPURLResponse(url: url, statusCode: 503, httpVersion: nil, headerFields: nil)!)
            }
            let device = AppAttestRegistrationAPI(server: .sandboxReview, environment: environment, currentSession: { captured }, transport: transport, now: { now })
            await rejects(error) { _ = try await device.challenge(for: captured, requestID: requestID) }
            await rejects(error) { _ = try await device.commit(registration, attestation: Data([1,2,3]), captured: captured) }
            let challenge = RestoreChallengeAPI(server: .sandboxReview, environment: environment, currentSession: { captured }, transport: transport, now: { now })
            await rejects(error) { _ = try await challenge.challenge(captured: captured, requestID: requestID, signedAppTransaction: retained.signedAppTransaction, signedTransaction: retained.signedTransaction) }
            let commit = RestoreCommitAPI(server: .sandboxReview, environment: environment, currentSession: { captured }, transport: transport, now: { now })
            await rejects(error) { _ = try await commit.submit(pending: retained, captured: captured) }
            let status = RestoreStatusAPI(server: .sandboxReview, environment: environment, currentSession: { captured }, transport: transport, now: { now })
            await rejects(error) { _ = try await status.status(captured: captured, requestID: requestID, pairSHA256: retained.pairSHA256, assertionSHA256: retained.assertionSHA256) }
            let process = RestoreProcessAPI(server: .sandboxReview, environment: environment, currentSession: { captured }, transport: transport, now: { now })
            await rejects(error) { _ = try await process.process(captured: captured, requestID: requestID, pairSHA256: retained.pairSHA256, assertionSHA256: retained.assertionSHA256) }
            let cancel = RestoreCancelAPI(server: .sandboxReview, environment: environment, currentSession: { captured }, transport: transport, now: { now })
            await rejects(error) { _ = try await cancel.cancelUnreserved(pending: retained, captured: captured) }
        }
        // Exercise the actual flow object across restart: commit lost/error,
        // scoped status -> process error, then cancellation error. Original
        // encrypted evidence survives every unknown result.
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-review-origin-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let key = SymmetricKey(data: Data(repeating: 7, count: 32)), requests = ReviewRestoreRequests()
        let transport: HouseholdAPI.Transport = { request in
            precondition(request.url?.host == host && request.httpMethod == "POST")
            let path = request.url!.lastPathComponent; await requests.record(path)
            if path == "status" {
                let input = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String:String]
                let body = try JSONEncoder().encode(["requestID":input["requestID"]!,"status":"pending"])
                return (body, HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
            }
            return (Data(), HTTPURLResponse(url:request.url!,statusCode:503,httpVersion:nil,headerFields:nil)!)
        }
        let storage = PendingRestoreStorage(root: root, keyProvider: { _, _ in key })
        let flow = SandboxRestoreFlow(server: .sandboxReview, environment: .sandbox, storage: storage, currentSession: { captured }, transport: transport, now: { now })
        await rejects(.rejected(503)) { _ = try await flow.startOrResume(captured: captured) { _, id in try pending(id) } }
        guard let original = try await storage.read(scope: scope) else { fatalError("Proof missing after failed commit") }
        let restartedStorage = PendingRestoreStorage(root: root, keyProvider: { _, _ in key })
        let restarted = SandboxRestoreFlow(server: .sandboxReview, environment: .sandbox, storage: restartedStorage, currentSession: { captured }, transport: transport, now: { now })
        await rejects(.rejected(503)) { _ = try await restarted.refresh(captured: captured) }
        await rejects(.rejected(503)) { _ = try await restarted.cancelUnreserved(captured: captured) }
        let after = try await restartedStorage.read(scope: scope)
        precondition(after == original)
        let paths = await requests.recorded(); precondition(paths == ["commit","status","process","cancel"])
        let wrong = SandboxRestoreFlow(server: .sandboxReview, environment: .production, storage: restartedStorage, currentSession: { captured }, transport: { _ in fatalError("Production flow sent credentials") }, now: { now })
        await rejects(.invalidInput) { _ = try await wrong.startOrResume(captured: captured) { _, _ in fatalError("Production flow prepared a new proof") } }
        print("PASS: attestation and five restore adapters pin review origin, refuse Production/foreign responses; actual flow retains encrypted evidence across restart and routes commit/status/process/cancel consistently. Synthetic only; no Apple, rights, registration or transfer.")
    }
}
