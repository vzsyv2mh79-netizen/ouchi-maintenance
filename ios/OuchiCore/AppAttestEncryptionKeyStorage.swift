import Foundation
import Security
import CryptoKit
import LocalAuthentication

/// Narrow device-only encryption-key namespace. Never updates an existing key.
/// Not instantiated by the app until registration and cleanup are wired.
public final class AppAttestEncryptionKeyStorage: @unchecked Sendable {
    public struct Operations: Sendable {
        public let copy: @Sendable ([String: Any]) -> (OSStatus, [String: Any]?)
        public let add: @Sendable ([String: Any]) -> OSStatus
        public let delete: @Sendable ([String: Any]) -> OSStatus
        public let random: @Sendable () throws -> Data
        public init(copy: @escaping @Sendable ([String: Any]) -> (OSStatus, [String: Any]?), add: @escaping @Sendable ([String: Any]) -> OSStatus, delete: @escaping @Sendable ([String: Any]) -> OSStatus, random: @escaping @Sendable () throws -> Data) {
            self.copy = copy; self.add = add; self.delete = delete; self.random = random
        }
        public static let device = Operations(copy: { query in
            var value: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &value)
            return (status, value as? [String: Any])
        }, add: { SecItemAdd($0 as CFDictionary, nil) }, delete: { SecItemDelete($0 as CFDictionary) }, random: {
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw CloudError.unavailable }
            return Data(bytes)
        })
    }
    private let namespace: String
    private let operations: Operations
    private let lock = NSLock()
    public init(namespace: String, operations: Operations = .device) throws {
        guard !namespace.isEmpty, namespace.utf8.count <= 160,
              namespace.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-").contains($0) }) else { throw CloudError.invalidInput }
        self.namespace = namespace + ".attest-encryption.v1"; self.operations = operations
    }
    private func query(account: UUID, epoch: UUID? = nil) throws -> [String: Any] {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard account != zero, epoch == nil || (epoch != zero && epoch != account) else { throw CloudError.invalidInput }
        let context = LAContext(); context.interactionNotAllowed = true
        var q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: namespace + "." + account.uuidString.lowercased(),
            kSecAttrSynchronizable as String: false,
            kSecUseDataProtectionKeychain as String: true,
            kSecUseAuthenticationContext as String: context]
        if let epoch { q[kSecAttrAccount as String] = epoch.uuidString.lowercased() }
        return q
    }
    private func readUnlocked(account: UUID, epoch: UUID) throws -> SymmetricKey? {
        var q = try query(account: account, epoch: epoch)
        q[kSecReturnAttributes as String] = true; q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        let (status, item) = operations.copy(q)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let item,
              item[kSecAttrService as String] as? String == q[kSecAttrService as String] as? String,
              item[kSecAttrAccount as String] as? String == epoch.uuidString.lowercased(),
              item[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String,
              let sync = item[kSecAttrSynchronizable as String] as? NSNumber, sync == false,
              let bytes = item[kSecValueData as String] as? Data, bytes.count == 32 else { throw CloudError.unavailable }
        return SymmetricKey(data: bytes)
    }
    /// Reading a missing key never generates a replacement for old ciphertext.
    public func read(account: UUID, epoch: UUID) throws -> SymmetricKey? {
        lock.lock(); defer { lock.unlock() }
        return try readUnlocked(account: account, epoch: epoch)
    }
    /// Explicitly provision before staging a new proof; duplicate add reads back
    /// the winning key instead of overwriting an uncertain attempt.
    public func provision(account: UUID, epoch: UUID) throws -> SymmetricKey {
        lock.lock(); defer { lock.unlock() }
        if let existing = try readUnlocked(account: account, epoch: epoch) { return existing }
        var q = try query(account: account, epoch: epoch)
        let bytes = try operations.random(); guard bytes.count == 32 else { throw CloudError.unavailable }
        q[kSecValueData as String] = bytes
        q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = operations.add(q)
        guard status == errSecSuccess || status == errSecDuplicateItem,
              let persisted = try readUnlocked(account: account, epoch: epoch) else { throw CloudError.unavailable }
        return persisted
    }
    public func erase(account: UUID, epoch: UUID? = nil) throws {
        lock.lock(); defer { lock.unlock() }
        let q = try query(account: account, epoch: epoch)
        let status = operations.delete(q)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw CloudError.unavailable }
        var confirmation = q; confirmation[kSecMatchLimit as String] = kSecMatchLimitOne
        let (remaining, _) = operations.copy(confirmation)
        guard remaining == errSecItemNotFound else { throw CloudError.unavailable }
    }
}
