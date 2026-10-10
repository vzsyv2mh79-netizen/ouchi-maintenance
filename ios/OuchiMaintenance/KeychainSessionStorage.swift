import Foundation
import Security
import OuchiCore

struct KeychainSessionStorage: SessionStorage {
    let service: String
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: "cloud-session"]
    }
    func read() throws -> Data? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw VaultError.unavailable }
        return data
    }
    func write(_ data: Data?) throws {
        if let data {
            let attributes = [kSecValueData as String: data,
                              kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly] as [String: Any]
            let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
            if status == errSecItemNotFound {
                let inserted = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
                guard inserted == errSecSuccess else { throw VaultError.unavailable }
            } else if status != errSecSuccess { throw VaultError.unavailable }
        } else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw VaultError.unavailable }
        }
    }
    enum VaultError: Error { case unavailable }
}
