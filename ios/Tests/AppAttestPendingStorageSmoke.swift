import Foundation
import CryptoKit
import OuchiCore

@main struct AppAttestPendingStorageSmoke {
    static let now: Int64 = 1_791_727_200_000
    static let scope = AppAttestRegistrationScope(userID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!, sessionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, keyID: Data(repeating: 1, count: 32).base64EncodedString(), appID: "SYNTHETIC1.dev.synthetic.ouchi", environment: "production")
    static let key = SymmetricKey(data: Data(repeating: 7, count: 32))
    static func pending(_ scope: AppAttestRegistrationScope = scope, proof: Data = Data("synthetic-private-proof-marker-never-an-Apple-proof".utf8), issued: Int64 = now) throws -> AppAttestPendingRegistration {
        let nonce = Data(repeating: 3, count: 32).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let text = "{\"version\":1,\"purpose\":\"register_ouchi_attested_key\",\"nonce\":\"\(nonce)\",\"issuedAt\":\(issued),\"expiresAt\":\(issued+300000),\"userID\":\"\(scope.userID.uuidString.lowercased())\",\"sessionID\":\"\(scope.sessionID.uuidString.lowercased())\",\"epochID\":\"\(scope.epochID.uuidString.lowercased())\",\"requestID\":\"44444444-4444-4444-8444-444444444444\",\"keyID\":\"\(scope.keyID)\",\"appID\":\"\(scope.appID)\",\"attestEnvironment\":\"\(scope.environment)\"}"
        let c = try AppAttestRegistrationChallenge.parse(canonicalClientData: Data(text.utf8), expected: scope, nowMilliseconds: issued)
        return try AppAttestPendingRegistration(scope: scope, challenge: c, attestation: proof, nowMilliseconds: issued)
    }
    static func refused(_ operation: @Sendable () async throws -> Void) async { do { try await operation(); fatalError("accepted unsafe pending operation") } catch {} }
    static func acknowledgement(_ challenge: AppAttestRegistrationChallenge) async throws -> AppAttestRegistrationReceipt {
        let claims = try JSONSerialization.data(withJSONObject: ["sub":scope.userID.uuidString,"session_id":scope.sessionID.uuidString,"exp":Double(now+3600000)/1000])
        let encoded = claims.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let session = AppAttestRegistrationSession(scope: scope, bearer: "e30." + encoded + ".synthetic")
        let api = AppAttestRegistrationAPI(currentSession: { session }, transport: { request in
            let data = try JSONSerialization.data(withJSONObject: ["requestID":challenge.requestID.uuidString.lowercased(),"userID":scope.userID.uuidString.lowercased(),"sessionID":scope.sessionID.uuidString.lowercased(),"epochID":scope.epochID.uuidString.lowercased(),"keyID":scope.keyID,"appID":scope.appID,"attestEnvironment":scope.environment,"registered":true])
            return (data, HTTPURLResponse(url: request.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
        }, now: { now })
        return try await api.commit(challenge, attestation: Data([1,2,3]), captured: session)
    }
    static func main() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-attest-pending-synthetic-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = AppAttestPendingRegistrationStorage(root: root, keyProvider: { _,_ in key }, expiryAuthorization: { captured, _ in captured.userID == scope.userID }), value = try pending()
        let absent = try await store.hasPendingRecords(account: scope.userID)
        precondition(!absent && !FileManager.default.fileExists(atPath: root.path), "probe must not create storage")
        try await store.stage(value, nowMilliseconds: now)
        let file = root.appendingPathComponent(scope.userID.uuidString.lowercased()).appendingPathComponent(scope.epochID.uuidString.lowercased()+".attest-pending")
        let original = try Data(contentsOf: file)
        let permissions = try FileManager.default.attributesOfItem(atPath: file.path)[.posixPermissions] as! NSNumber; precondition(permissions.intValue & 0o777 == 0o600)
        precondition(original.range(of: value.attestation) == nil && original.range(of: value.challenge.clientData) == nil)
        let restarted = AppAttestPendingRegistrationStorage(root: root, keyProvider: { _,_ in key })
        let recovered = try await restarted.read(scope: scope, nowMilliseconds: now); precondition(recovered == value)
        try await restarted.stage(value, nowMilliseconds: now); let retriedBytes = try Data(contentsOf: file); precondition(retriedBytes == original, "exact retry must not rewrite or extend lifetime")
        let different = try pending(proof: Data("different synthetic proof".utf8))
        await refused { try await restarted.stage(different, nowMilliseconds: now) }
        let changedBytes = Data(String(data: value.challenge.clientData, encoding: .utf8)!.replacingOccurrences(of: value.challenge.requestID.uuidString.lowercased(), with: UUID().uuidString.lowercased()).utf8)
        let changedChallenge = try AppAttestRegistrationChallenge.parse(canonicalClientData: changedBytes, expected: scope, nowMilliseconds: now)
        let wrongReceipt = try await acknowledgement(changedChallenge)
        await refused { try await restarted.removeAcknowledged(wrongReceipt, scope: scope, nowMilliseconds: now) }
        let receipt = try await acknowledgement(value.challenge); try await restarted.removeAcknowledged(receipt, scope: scope, nowMilliseconds: now)
        precondition(!FileManager.default.fileExists(atPath: file.path))
        try await restarted.stage(value, nowMilliseconds: now)
        let restoredCipher = try Data(contentsOf: file)
        let wrongKey = AppAttestPendingRegistrationStorage(root: root, keyProvider: { _,_ in SymmetricKey(data: Data(repeating: 8, count: 32)) })
        await refused { _ = try await wrongKey.read(scope: scope, nowMilliseconds: now) }
        let changedSession = AppAttestRegistrationScope(userID: scope.userID, sessionID: UUID(), epochID: scope.epochID, keyID: scope.keyID, appID: scope.appID, environment: scope.environment)
        await refused { _ = try await restarted.read(scope: changedSession, nowMilliseconds: now) }
        var damaged = restoredCipher; damaged[0] ^= 1; try damaged.write(to: file)
        await refused { _ = try await restarted.read(scope: scope, nowMilliseconds: now) }
        await refused { try await restarted.stage(value, nowMilliseconds: now) }
        await refused { _ = try await restarted.pruneExpired(account: scope.userID, nowMilliseconds: now+300000) }
        let damagedBytes = try Data(contentsOf: file); precondition(damagedBytes == damaged, "corruption must not cause silent replacement")
        try Data(repeating: 1, count: 200001).write(to: file)
        await refused { _ = try await restarted.read(scope: scope, nowMilliseconds: now) }
        try original.write(to: file)
        let expired = try await restarted.read(scope: scope, nowMilliseconds: now+300000); precondition(expired == nil && !FileManager.default.fileExists(atPath: file.path))
        let race = AppAttestPendingRegistrationStorage(root: root.appendingPathComponent("race"), keyProvider: { _,_ in key })
        let tasks = [value,different].map { attempt in Task { do { try await race.stage(attempt, nowMilliseconds: now); return true } catch { return false } } }
        var outcomes: [Bool] = []; for task in tasks { outcomes.append(await task.value) }; precondition(outcomes.filter { $0 }.count == 1)
        let foreign = AppAttestRegistrationScope(userID: UUID(), sessionID: UUID(), epochID: UUID(), keyID: scope.keyID, appID: scope.appID, environment: scope.environment)
        try await store.stage(pending(foreign), nowMilliseconds: now)
        let foreignFile = root.appendingPathComponent(foreign.userID.uuidString.lowercased()).appendingPathComponent(foreign.epochID.uuidString.lowercased()+".attest-pending")
        let foreignBytes = try Data(contentsOf: foreignFile); try original.write(to: foreignFile)
        await refused { _ = try await store.read(scope: foreign, nowMilliseconds: now) }
        try foreignBytes.write(to: foreignFile)
        for _ in 0..<5 { let s = AppAttestRegistrationScope(userID: scope.userID, sessionID: scope.sessionID, epochID: UUID(), keyID: scope.keyID, appID: scope.appID, environment: scope.environment); try await store.stage(pending(s), nowMilliseconds: now) }
        await refused { let s = AppAttestRegistrationScope(userID: scope.userID, sessionID: scope.sessionID, epochID: UUID(), keyID: scope.keyID, appID: scope.appID, environment: scope.environment); try await store.stage(pending(s), nowMilliseconds: now) }
        let livePruned = try await store.pruneExpired(account: scope.userID, nowMilliseconds: now)
        precondition(livePruned == 0)
        let accountFolder = root.appendingPathComponent(scope.userID.uuidString.lowercased())
        let beforePrune = try FileManager.default.contentsOfDirectory(at: accountFolder, includingPropertiesForKeys: nil)
        precondition(beforePrune.count == 5)
        let unauthorizedPruning = AppAttestPendingRegistrationStorage(root: root, keyProvider: { _,_ in key })
        await refused { _ = try await unauthorizedPruning.pruneExpired(account: scope.userID, nowMilliseconds: now+300000) }
        let locked = AppAttestPendingRegistrationStorage(root: root, keyProvider: { _,_ in throw CloudError.unavailable })
        await refused { _ = try await locked.pruneExpired(account: scope.userID, nowMilliseconds: now+300000) }
        await refused { _ = try await store.pruneExpired(account: scope.userID, nowMilliseconds: 0) }
        let retainedAfterRefusal = try FileManager.default.contentsOfDirectory(at: accountFolder, includingPropertiesForKeys: nil)
        precondition(retainedAfterRefusal.count == 5)
        let nextScope = AppAttestRegistrationScope(userID: scope.userID, sessionID: scope.sessionID, epochID: UUID(), keyID: scope.keyID, appID: scope.appID, environment: scope.environment)
        try await store.stage(pending(nextScope, issued: now+300000), nowMilliseconds: now+300000)
        let afterPrune = try FileManager.default.contentsOfDirectory(at: accountFolder, includingPropertiesForKeys: nil)
        precondition(afterPrune.count == 1 && afterPrune[0].lastPathComponent == nextScope.epochID.uuidString.lowercased()+".attest-pending")
        precondition(FileManager.default.fileExists(atPath: foreignFile.path), "other account must remain untouched, even if expired")
        let removed = try await store.pruneExpired(account: scope.userID, nowMilliseconds: now+600000)
        precondition(removed == 1)
        let noOwnedPending = try await store.hasPendingRecords(account: scope.userID)
        let foreignPending = try await store.hasPendingRecords(account: foreign.userID)
        precondition(!noOwnedPending && foreignPending)
        let repeated = try await store.pruneExpired(account: scope.userID, nowMilliseconds: now+600000)
        precondition(repeated == 0)
        try await store.eraseAccount(scope.userID); try await store.eraseAccount(scope.userID)
        let remaining = try FileManager.default.contentsOfDirectory(atPath: root.appendingPathComponent(scope.userID.uuidString.lowercased()).path); precondition(remaining.isEmpty)
        let foreignRemaining = try await store.read(scope: foreign, nowMilliseconds: now); precondition(foreignRemaining != nil)
        let linkedRoot = root.appendingPathComponent("symlink"); try FileManager.default.createSymbolicLink(at: linkedRoot, withDestinationURL: root)
        let unsafe = AppAttestPendingRegistrationStorage(root: linkedRoot, keyProvider: { _,_ in key })
        await refused { _ = try await unsafe.read(scope: foreign, nowMilliseconds: now) }
        await refused { _ = try await unsafe.pruneExpired(account: foreign.userID, nowMilliseconds: now+600000) }
        print("PASS: encrypted bounded synthetic pending proof survives restart; exact retry, corruption/wrong-key/session/symlink refusal, actor conflict, expiry removal, five-file cap, scoped authenticated expiry pruning with locked-key refusal, and owner-only erasure. Synthetic key only; no Keychain, Apple attestation or purchase grant.")
    }
}
