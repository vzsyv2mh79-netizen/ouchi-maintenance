import Foundation
import CryptoKit
import OuchiCore

@main struct PendingRestoreStorageSmoke {
    @MainActor static func refused(_ operation: () async throws -> Void) async {
        do { try await operation(); fatalError("Unsafe pending restore accepted") } catch {}
    }
    static func main() async throws {
        let now:Int64 = 1791727200001
        let user=UUID(uuidString:"11111111-1111-4111-8111-111111111111")!,session=UUID(uuidString:"22222222-2222-4222-8222-222222222222")!,epoch=UUID(uuidString:"33333333-3333-4333-8333-333333333333")!
        let keyID=Data(repeating:1,count:32).base64EncodedString()
        let canonical = #"{"version":1,"purpose":"restore_ouchi_subscription","nonce":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc","issuedAt":1791727200000,"expiresAt":1791727500000,"userID":"11111111-1111-4111-8111-111111111111","sessionID":"22222222-2222-4222-8222-222222222222","epochID":"33333333-3333-4333-8333-333333333333","requestID":"44444444-4444-4444-8444-444444444444","keyID":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=","appID":"SYNTHETIC1.dev.synthetic.ouchi","attestEnvironment":"development","purchaseEnvironment":"Sandbox","proofSHA256":"ed30e17c16007492e113af953fdbe0387fc08b5f4b4cf5eae6f9f6bd7a2dec27"}"#
        func pending(_ e:UUID=epoch,_ account:UUID=user,_ assertion:Data=Data("synthetic-assertion".utf8)) throws -> PendingRestore {
            let scope=AppAttestRegistrationScope(userID:account,sessionID:session,epochID:e,keyID:keyID,appID:"SYNTHETIC1.dev.synthetic.ouchi",environment:"development")
            let text=canonical.replacingOccurrences(of:epoch.uuidString.lowercased(),with:e.uuidString.lowercased()).replacingOccurrences(of:user.uuidString.lowercased(),with:account.uuidString.lowercased())
            let expected=RestoreAssertionScope(userID:account,sessionID:session,epochID:e,keyID:keyID,appID:scope.appID,environment:scope.environment,requestID:UUID(uuidString:"44444444-4444-4444-8444-444444444444")!,proofSHA256:try RestoreAssertionChallenge.pairDigest(signedApp:"合成app.jws",signedTransaction:"合成purchase.jws"))
            let challenge=try RestoreAssertionChallenge.parse(canonicalClientData:Data(text.utf8),expected:expected,nowMilliseconds:now)
            return try PendingRestore(scope:scope,challenge:challenge,signedAppTransaction:"合成app.jws",signedTransaction:"合成purchase.jws",assertion:assertion,nowMilliseconds:now)
        }
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-restore-synthetic-"+UUID().uuidString,isDirectory:true)
        defer { try? FileManager.default.removeItem(at:root) }
        let key=SymmetricKey(data:Data(repeating:7,count:32)),storage=PendingRestoreStorage(root:root,keyProvider:{ _,_ in key })
        let absentProbe=try await storage.hasPendingRecords(account:user);precondition(!absentProbe && !FileManager.default.fileExists(atPath:root.path))
        let original=try pending()
        try await storage.stage(original,nowMilliseconds:now)
        try await storage.stage(original,nowMilliseconds:now)
        let folder=root.appendingPathComponent(user.uuidString.lowercased()),file=folder.appendingPathComponent(epoch.uuidString.lowercased()+".restore-pending")
        let presentProbe=try await storage.hasPendingRecords(account:user);precondition(presentProbe)
        let encrypted=try Data(contentsOf:file)
        precondition(encrypted.range(of:Data("合成app.jws".utf8)) == nil && encrypted.range(of:original.assertion) == nil)
        let permissions=try FileManager.default.attributesOfItem(atPath:file.path)[.posixPermissions] as? NSNumber
        precondition(permissions?.intValue == 0o600)
        let restart=PendingRestoreStorage(root:root,keyProvider:{ _,_ in key })
        let restored=try await restart.read(scope:original.scope);precondition(restored == original)
        await refused { try await restart.stage(original,nowMilliseconds:original.challenge.expiresAtMilliseconds) }
        let afterExpiry=try await restart.read(scope:original.scope);precondition(afterExpiry == original,"expired proof remains available for unknown-result status recovery")
        let changed=AppAttestRegistrationScope(userID:user,sessionID:UUID(),epochID:epoch,keyID:keyID,appID:original.scope.appID,environment:original.scope.environment)
        await refused { _ = try await restart.read(scope:changed) }
        let wrongKey=PendingRestoreStorage(root:root,keyProvider:{ _,_ in SymmetricKey(data:Data(repeating:8,count:32)) })
        await refused { _ = try await wrongKey.read(scope:original.scope) }
        let different=try pending(epoch,user,Data("different-proof".utf8))
        await refused { try await restart.stage(different,nowMilliseconds:now) }
        await refused { try await restart.removeCompleted(different) }
        let unchanged=try Data(contentsOf:file);precondition(unchanged == encrypted)
        let lease=try AppAttestMutationLease.acquire(root:root)
        await refused { _ = try await restart.read(scope:original.scope) }
        await refused { try await restart.removeCompleted(original) }
        lease.release()
        let other=try pending(UUID(),UUID());try await storage.stage(other,nowMilliseconds:now)
        for _ in 0..<4 { try await storage.stage(pending(UUID()),nowMilliseconds:now) }
        await refused { try await storage.stage(pending(UUID()),nowMilliseconds:now) }
        let saved=try Data(contentsOf:file);try Data(repeating:0,count:40).write(to:file)
        await refused { _ = try await restart.read(scope:original.scope) }
        precondition(FileManager.default.fileExists(atPath:file.path));try saved.write(to:file)
        try FileManager.default.removeItem(at:file)
        try FileManager.default.createSymbolicLink(at:file,withDestinationURL:root.appendingPathComponent("missing"))
        await refused { _ = try await restart.read(scope:original.scope) }
        try FileManager.default.removeItem(at:file);try saved.write(to:file)
        try await restart.removeCompleted(original)
        let removed=try await restart.read(scope:original.scope);precondition(removed == nil)
        try await restart.eraseAccount(user)
        let preserved=try await restart.read(scope:other.scope);precondition(preserved == other)
        print("PASS: actual AES-GCM temporary file restart, exact retention after expiry, wrong key/session/corruption/symlink/competing-process refusal, cap and scoped cleanup. Synthetic key only; no Keychain, Apple, rights or network.")
    }
}
