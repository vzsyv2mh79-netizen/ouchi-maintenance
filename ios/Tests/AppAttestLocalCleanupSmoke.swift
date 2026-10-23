import Foundation
import CryptoKit
import OuchiCore

@main struct AppAttestLocalCleanupSmoke {
    @MainActor static func main() async throws {
        let account = UUID(), foreign = UUID()
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-attest-cleanup-synthetic-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let epoch = UUID()
        for owner in [account, foreign] {
            let folder = root.appendingPathComponent(owner.uuidString.lowercased())
            try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
            try Data("corrupted synthetic ciphertext".utf8).write(to:folder.appendingPathComponent(epoch.uuidString.lowercased()+".attest-pending"))
        }
        let storage = AppAttestPendingRegistrationStorage(root:root,keyProvider:{ _,_ in fatalError("erasure must not request a decryption key") })
        var failClosure = true, changeDuringClosure = false
        var bound = true, failProofs = true, failKeys = false, changeDuringProofs = false
        var calls: [String] = []
        func run() async -> AccountDeletionLocalCleanupResult {
            await eraseAppAttestLocalRegistration(account:account,stillBound:{ bound },prepareClosure:{
                calls.append("closure")
                if failClosure { throw CloudError.unavailable }
                if changeDuringClosure { bound = false }
            },erasePendingProofs:{
                calls.append("proofs")
                if failProofs { throw CloudError.unavailable }
                try await storage.eraseAccount(account)
                if changeDuringProofs { bound = false }
            },eraseEncryptionKeys:{
                calls.append("keys")
                if failKeys { throw CloudError.unavailable }
            })
        }
        let journalFailed = await run()
        precondition(journalFailed == .pending && calls == ["closure"])
        let retained = try FileManager.default.contentsOfDirectory(at:root.appendingPathComponent(account.uuidString.lowercased()),includingPropertiesForKeys:nil)
        precondition(retained.count == 1)
        failClosure = false; calls = []; changeDuringClosure = true
        let journalStale = await run(); precondition(journalStale == .staleBinding && calls == ["closure"])
        bound = true; changeDuringClosure = false; calls = []
        let failed = await run(); precondition(failed == .pending && calls == ["closure","proofs"])
        failProofs = false; failKeys = true; calls = []
        let partial = await run(); precondition(partial == .pending && calls == ["closure","proofs","keys"])
        let own = root.appendingPathComponent(account.uuidString.lowercased())
        let ownFiles = try FileManager.default.contentsOfDirectory(at:own,includingPropertiesForKeys:nil)
        let other = root.appendingPathComponent(foreign.uuidString.lowercased())
        let foreignFiles = try FileManager.default.contentsOfDirectory(at:other,includingPropertiesForKeys:nil)
        precondition(ownFiles.isEmpty && foreignFiles.count == 1)
        failKeys = false; calls = []
        let retried = await run(); precondition(retried == .complete && calls == ["closure","proofs","keys"])
        calls = []; changeDuringProofs = true
        let stale = await run(); precondition(stale == .staleBinding && calls == ["closure","proofs"])
        calls = []; let unbound = await run(); precondition(unbound == .staleBinding && calls.isEmpty)
        bound = true; changeDuringProofs = false; calls = []
        let task = Task { @MainActor in await run() }; task.cancel()
        let cancelled = await task.value; precondition(cancelled == .staleBinding && calls.isEmpty)
        print("PASS: synthetic durable closure preparation precedes pending-proof cleanup and key erasure, never decrypts, retains pending on each failure, retries safely, refuses changed binding/cancellation and preserves foreign files. No owner Keychain or data touched.")
    }
}
