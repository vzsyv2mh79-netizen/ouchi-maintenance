import Foundation
import CryptoKit
import Security
import LocalAuthentication
import OuchiCore

// Every operation is an in-memory fixture. No system Keychain call executes.
final class SyntheticKeychain: @unchecked Sendable {
    let lock = NSLock()
    var items: [String: [String: Any]] = [:]
    var readFailure: OSStatus?; var deleteFailure = false; var malformed = false
    var duplicateRace = false; var randomCount = 0; var addCount = 0
    var weakPolicy = false; var synchronized = false
    func identity(_ q: [String: Any]) -> String { (q[kSecAttrService as String] as! String) + "|" + (q[kSecAttrAccount as String] as! String) }
    func check(_ q: [String: Any]) {
        precondition(q[kSecClass as String] as? String == kSecClassGenericPassword as String)
        precondition(q[kSecAttrSynchronizable as String] as? Bool == false)
        precondition(q[kSecUseDataProtectionKeychain as String] as? Bool == true)
        precondition((q[kSecUseAuthenticationContext as String] as? LAContext)?.interactionNotAllowed == true)
        precondition(q[kSecAttrAccessGroup as String] == nil)
        precondition((q[kSecAttrService as String] as! String).contains(".attest-encryption.v1."))
    }
    var operations: AppAttestEncryptionKeyStorage.Operations {
        .init(copy: { [self] q in
            lock.lock(); defer { lock.unlock() }; check(q)
            if let readFailure { return (readFailure, nil) }
            let service = q[kSecAttrService as String] as! String
            let item = q[kSecAttrAccount as String] == nil ? items.values.first(where: { $0[kSecAttrService as String] as? String == service }) : items[identity(q)]
            guard var item else { return (errSecItemNotFound,nil) }
            if malformed { item[kSecValueData as String] = Data([1]) }
            if weakPolicy { item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlocked }
            if synchronized { item[kSecAttrSynchronizable as String] = true }
            return (errSecSuccess,item)
        }, add: { [self] q in
            lock.lock(); defer { lock.unlock() }; check(q); addCount += 1
            precondition(q[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
            let id = identity(q)
            if items[id] != nil { return errSecDuplicateItem }
            var item = q
            if duplicateRace { item[kSecValueData as String] = Data(repeating: 9,count:32); items[id] = item; return errSecDuplicateItem }
            items[id] = item; return errSecSuccess
        }, delete: { [self] q in
            lock.lock(); defer { lock.unlock() }; check(q)
            if deleteFailure { return errSecSuccess } // False acknowledgement must fail confirmation.
            let service = q[kSecAttrService as String] as! String
            if q[kSecAttrAccount as String] != nil { items.removeValue(forKey: identity(q)) }
            else { items = items.filter { $0.value[kSecAttrService as String] as? String != service } }
            return errSecSuccess
        }, random: { [self] in lock.lock(); defer { lock.unlock() }; randomCount += 1; return Data(repeating:7,count:32) })
    }
}
@main struct AppAttestEncryptionKeySmoke {
    static func bytes(_ key: SymmetricKey) -> Data { key.withUnsafeBytes { Data($0) } }
    static func refused(_ f: () throws -> Void) { do { try f(); fatalError("unsafe key operation accepted") } catch {} }
    static func main() throws {
        let fixture = SyntheticKeychain()
        let account = UUID(), epoch = UUID(), foreign = UUID(), epoch2 = UUID()
        let store = try AppAttestEncryptionKeyStorage(namespace:"dev.synthetic.ouchi",operations:fixture.operations)
        let absent = try store.read(account:account,epoch:epoch); precondition(absent == nil && fixture.randomCount == 0)
        let key = try store.provision(account:account,epoch:epoch); precondition(bytes(key) == Data(repeating:7,count:32))
        let restarted = try AppAttestEncryptionKeyStorage(namespace:"dev.synthetic.ouchi",operations:fixture.operations)
        let same = try restarted.provision(account:account,epoch:epoch); precondition(bytes(same) == bytes(key) && fixture.addCount == 1 && fixture.randomCount == 1)
        fixture.readFailure = errSecInteractionNotAllowed
        refused { _ = try store.provision(account:account,epoch:epoch2) }; precondition(fixture.addCount == 1)
        fixture.readFailure = nil; fixture.malformed = true
        refused { _ = try store.provision(account:account,epoch:epoch) }; precondition(fixture.addCount == 1)
        fixture.malformed = false; fixture.weakPolicy = true
        refused { _ = try store.read(account:account,epoch:epoch) }
        fixture.weakPolicy = false; fixture.synchronized = true
        refused { _ = try store.read(account:account,epoch:epoch) }
        fixture.synchronized = false; fixture.duplicateRace = true
        let winner = try store.provision(account:account,epoch:epoch2); precondition(bytes(winner) == Data(repeating:9,count:32))
        fixture.duplicateRace = false
        _ = try store.provision(account:foreign,epoch:UUID())
        fixture.deleteFailure = true; refused { try store.erase(account:account) }
        fixture.deleteFailure = false
        try store.erase(account:account,epoch:epoch)
        let removed = try store.read(account:account,epoch:epoch); precondition(removed == nil)
        let retained = try store.read(account:account,epoch:epoch2); precondition(retained != nil)
        try store.erase(account:account); try store.erase(account:account)
        precondition(fixture.items.count == 1, "foreign owner key must survive")
        let zero = UUID(uuidString:"00000000-0000-0000-0000-000000000000")!
        refused { _ = try store.provision(account:zero,epoch:epoch) }
        refused { _ = try store.read(account:account,epoch:account) }
        refused { _ = try AppAttestEncryptionKeyStorage(namespace:"bad/service",operations:fixture.operations) }
        print("PASS: synthetic-only device-key policy, read without creation, restart reuse, locked/corrupt refusal, duplicate winner readback and confirmed account-only erasure. No owner Keychain, DeviceCheck or purchase.")
    }
}
