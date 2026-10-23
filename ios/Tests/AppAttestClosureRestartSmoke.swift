import Foundation
import Security
import LocalAuthentication
import CryptoKit
import OuchiCore

// Test-owned file-backed substitute, never SecItemCopyMatching or owner credentials.
final class RestartFixtureKeychain: @unchecked Sendable {
    struct Item: Codable { let service: String; let account: String; let data: Data }
    private let file: URL
    private let lock = NSLock()
    private var items: [Item]
    let refuseClosureRemoval: Bool
    init(root: URL, refuseClosureRemoval: Bool = false) throws {
        file = root.appendingPathComponent("synthetic-keychain.json")
        self.refuseClosureRemoval = refuseClosureRemoval
        items = FileManager.default.fileExists(atPath: file.path)
            ? try JSONDecoder().decode([Item].self, from: Data(contentsOf: file)) : []
    }
    private func attributes(_ item: Item) -> [String: Any] {
        [kSecAttrService as String: item.service, kSecAttrAccount as String: item.account,
         kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
         kSecAttrSynchronizable as String: false, kSecValueData as String: item.data]
    }
    private func check(_ q: [String: Any]) {
        precondition((q[kSecAttrService as String] as? String)?.hasPrefix("dev.synthetic.restart.") == true)
        precondition(q[kSecAttrSynchronizable as String] as? Bool == false)
        precondition(q[kSecUseDataProtectionKeychain as String] as? Bool == true)
        precondition((q[kSecUseAuthenticationContext as String] as? LAContext)?.interactionNotAllowed == true)
    }
    private func save() throws { try JSONEncoder().encode(items).write(to: file, options: .atomic) }
    var operations: AppAttestEncryptionKeyStorage.Operations {
        .init(copy: { [self] q in
            lock.lock(); defer { lock.unlock() }; check(q)
            let service = q[kSecAttrService as String] as! String
            let item = items.first { $0.service == service && (q[kSecAttrAccount as String] == nil || $0.account == q[kSecAttrAccount as String] as? String) }
            return item.map { (errSecSuccess, attributes($0)) } ?? (errSecItemNotFound, nil)
        }, add: { [self] q in
            lock.lock(); defer { lock.unlock() }; check(q)
            let item = Item(service: q[kSecAttrService as String] as! String,
                            account: q[kSecAttrAccount as String] as! String, data: q[kSecValueData as String] as! Data)
            if items.contains(where: { $0.service == item.service && $0.account == item.account }) { return errSecDuplicateItem }
            items.append(item)
            do { try save(); return errSecSuccess } catch { return errSecNotAvailable }
        }, delete: { [self] q in
            lock.lock(); defer { lock.unlock() }; check(q)
            let service = q[kSecAttrService as String] as! String
            if refuseClosureRemoval && service.contains(".closing.") { return errSecSuccess }
            items.removeAll { $0.service == service && (q[kSecAttrAccount as String] == nil || $0.account == q[kSecAttrAccount as String] as? String) }
            do { try save(); return errSecSuccess } catch { return errSecNotAvailable }
        }, random: { Data(repeating: 7, count: 32) })
    }
    var listing: AppAttestKeyReferenceStorage.ClosureListingOperations {
        .init(copy: { [self] q in
            lock.lock(); defer { lock.unlock() }; check(q)
            precondition(q[kSecReturnData as String] == nil)
            let service = q[kSecAttrService as String] as! String
            let found = items.filter { $0.service == service }.map { item in
                var result = attributes(item); result.removeValue(forKey: kSecValueData as String); return result
            }
            return found.isEmpty ? (errSecItemNotFound, nil) : (errSecSuccess, found)
        })
    }
}

struct RestartEmptySession: SessionStorage {
    func read() throws -> Data? { nil }
    func write(_ data: Data?) throws { precondition(data == nil) }
}

@main struct AppAttestClosureRestartSmoke {
    static let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    static let other = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    static let epoch = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    static let now: Int64 = 1_791_727_200_000
    static func phase(_ name: String, root: URL) async throws {
        let fixture = try RestartFixtureKeychain(root: root, refuseClosureRemoval: name == "uncertain")
        let references = try AppAttestKeyReferenceStorage(namespace: "dev.synthetic.restart", operations: fixture.operations, closureListing: fixture.listing)
        let keys = try AppAttestEncryptionKeyStorage(namespace: "dev.synthetic.restart", operations: fixture.operations)
        let pending = AppAttestPendingRegistrationStorage(root: root.appendingPathComponent("pending"), keyProvider: { a, e in
            guard let key = try keys.read(account: a, epoch: e) else { throw CloudError.unavailable }; return key
        })
        let restoreRoot = root.appendingPathComponent("restore-pending", isDirectory: true)
        let restore = PendingRestoreStorage(root: restoreRoot, keyProvider: { _, _ in fatalError("Cleanup must not decrypt or read a device key") })
        let restoreFile = restoreRoot.appendingPathComponent(account.uuidString.lowercased()).appendingPathComponent(epoch.uuidString.lowercased() + ".restore-pending")
        if name == "stage" {
            for a in [account, other] {
                _ = try keys.provision(account: a, epoch: epoch)
                _ = try references.beginClosure(AppAttestAccountClosure(accountID: a, requestID: UUID(), createdAtMilliseconds: now, retainUntilMilliseconds: now + 3600000))
                let scope = AppAttestRegistrationScope(userID: a, sessionID: UUID(), epochID: epoch,
                    keyID: Data(repeating: 1, count: 32).base64EncodedString(), appID: "SYNTHETIC1.dev.synthetic.restart", environment: "production")
                let nonce = Data(repeating: 3, count: 32).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
                let text = "{\"version\":1,\"purpose\":\"register_ouchi_attested_key\",\"nonce\":\"\(nonce)\",\"issuedAt\":\(now),\"expiresAt\":\(now+300000),\"userID\":\"\(a.uuidString.lowercased())\",\"sessionID\":\"\(scope.sessionID.uuidString.lowercased())\",\"epochID\":\"\(epoch.uuidString.lowercased())\",\"requestID\":\"\(UUID().uuidString.lowercased())\",\"keyID\":\"\(scope.keyID)\",\"appID\":\"\(scope.appID)\",\"attestEnvironment\":\"production\"}"
                let challenge = try AppAttestRegistrationChallenge.parse(canonicalClientData: Data(text.utf8), expected: scope, nowMilliseconds: now)
                try await pending.stage(AppAttestPendingRegistration(scope: scope, challenge: challenge, attestation: Data("synthetic-opaque-proof".utf8), nowMilliseconds: now), nowMilliseconds: now)
            }
            for a in [account, other] {
                let folder = restoreRoot.appendingPathComponent(a.uuidString.lowercased())
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
                try Data("synthetic-opaque-pending-bytes".utf8).write(to: folder.appendingPathComponent(epoch.uuidString.lowercased() + ".restore-pending"))
            }
            let records = try references.pendingClosures(); precondition(records.count == 2)
            try JSONEncoder().encode(records).write(to: root.appendingPathComponent("original-closures.json"), options: .atomic)
            return
        }
        let original = try JSONDecoder().decode([AppAttestAccountClosure].self, from: Data(contentsOf: root.appendingPathComponent("original-closures.json")))
        let expected = original.first { $0.accountID == account }!
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_restart_only")
        let api = HouseholdAPI(config: config) { _ in fatalError("restart fixture reached network") }
        let session = SessionController(api: api, storage: RestartEmptySession())
        let before = try references.pendingClosures()
        precondition(before == original, "new process must recover exact durable intent without extending its deadline")
        if name == "uncertain" || name == "contended" || name == "additional_failure" || name == "restore_contended" {
            do {
                try await references.recoverAbandonedLocalClosure(expected: expected, session: session, pending: pending, encryptionKeys: keys, eraseAdditionalPending: { a in
                    if name == "additional_failure" { throw CloudError.unavailable }
                    try await restore.eraseAccount(a)
                })
                fatalError("false deletion acknowledgement was accepted")
            } catch { }
            let retained = try references.pendingClosures(); precondition(retained == original)
            if name == "additional_failure" || name == "restore_contended" {
                precondition(FileManager.default.fileExists(atPath: restoreFile.path))
                let retainedKey = try keys.read(account: account, epoch: epoch)
                precondition(retainedKey != nil, "Additional-proof cleanup failure must retain key and closure for retry")
            }
            if name == "contended" {
                let proofStillPresent = try await pending.hasPendingRecord(account: account, epoch: epoch)
                let keyStillPresent = try keys.read(account: account, epoch: epoch)
                precondition(proofStillPresent && keyStillPresent != nil, "overlapping process must refuse before erasure")
            }
        } else {
            try await references.recoverAbandonedLocalClosure(expected: expected, session: session, pending: pending, encryptionKeys: keys, eraseAdditionalPending: { a in
                    if name == "additional_failure" { throw CloudError.unavailable }
                    try await restore.eraseAccount(a)
                })
            let remaining = try references.pendingClosures(); precondition(remaining == original.filter { $0.accountID == other })
            let removed = try await pending.hasPendingRecord(account: account, epoch: epoch)
            let preserved = try await pending.hasPendingRecord(account: other, epoch: epoch)
            let removedKey = try keys.read(account: account, epoch: epoch)
            let otherKey = try keys.read(account: other, epoch: epoch)
            precondition(!removed && preserved && removedKey == nil && otherKey != nil)
            precondition(!FileManager.default.fileExists(atPath: restoreFile.path))
            precondition(FileManager.default.fileExists(atPath: restoreRoot.appendingPathComponent(other.uuidString.lowercased()).appendingPathComponent(epoch.uuidString.lowercased() + ".restore-pending").path))
        }
    }
    static func main() async throws {
        if CommandLine.arguments.count == 3 {
            try await phase(CommandLine.arguments[1], root: URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)); return
        }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-restart-synthetic-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        defer { try? FileManager.default.removeItem(at: root) }
        for name in ["stage", "contended", "additional_failure", "restore_contended", "uncertain", "recover"] {
            let reservation = name == "contended" ? try AppAttestMutationLease.acquire(root: root.appendingPathComponent("pending")) : name == "restore_contended" ? try AppAttestMutationLease.acquire(root: root.appendingPathComponent("restore-pending")) : nil
            defer { reservation?.release() }
            let child = Process(); child.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
            child.arguments = [name, root.path]; try child.run(); child.waitUntilExit()
            precondition(child.terminationStatus == 0, "restart phase failed: " + name)
        }
        print("PASS: separate processes preserve closure on disk, refuse competing cleanup before proof/key erasure, retain uncertain finalization and retry selected cleanup while preserving another account. Synthetic Keychain substitute; no owner credentials, Apple service or real account deletion.")
    }
}
