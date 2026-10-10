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

/// One account-scoped file; logged-out copies are removed, never placed in backups.
struct HouseholdSnapshotStorage {
    let namespace: String
    private let directory: URL
    init(namespace: String, directory: URL? = nil) {
        self.namespace = namespace
        self.directory = directory ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ouchi-snapshots", isDirectory: true)
    }
    private var file: URL { directory.appendingPathComponent(namespace + ".json") }
    func read(account: UUID) throws -> OfflineSnapshot? {
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max
        guard size <= 10 * 1024 * 1024 else { throw CloudError.invalidInput }
        return try OfflineSnapshot.decode(Data(contentsOf: file), account: account)
    }
    func write(_ snapshot: OfflineSnapshot?) throws {
        guard let snapshot else {
            if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
            return
        }
        let directory = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        #if os(iOS)
        let options: Data.WritingOptions = [.atomic, .completeFileProtection]
        #else
        // macOS test hosts do not implement iOS data-protection attributes.
        let options: Data.WritingOptions = [.atomic]
        #endif
        try snapshot.encode().write(to: file, options: options)
        var location = file; var values = URLResourceValues(); values.isExcludedFromBackup = true
        try location.setResourceValues(values)
    }
}

/// One pending upload per isolated app environment. Not yet wired to production.
struct PendingAttachmentStorage {
    private let file: URL
    init(directory: URL? = nil) {
        let root = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ouchi-isolated-attachment-retry", isDirectory: true)
        file = root.appendingPathComponent("pending.json")
    }
    func read(account: UUID, epoch: UUID) throws -> PendingAttachment? {
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max
        guard size <= 7 * 1024 * 1024 else { throw CloudError.invalidInput }
        return try PendingAttachment.decode(Data(contentsOf: file), account: account, epoch: epoch)
    }
    func write(_ value: PendingAttachment?) throws {
        guard let value else {
            if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
            return
        }
        let bytes = try value.encode()
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        #if os(iOS)
        let options: Data.WritingOptions = [.atomic, .completeFileProtection]
        #else
        let options: Data.WritingOptions = [.atomic]
        #endif
        try bytes.write(to: file, options: options)
        var location = file; var attributes = URLResourceValues(); attributes.isExcludedFromBackup = true
        try location.setResourceValues(attributes)
    }
}
