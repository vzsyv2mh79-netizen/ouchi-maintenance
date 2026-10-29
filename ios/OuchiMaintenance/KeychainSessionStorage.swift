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
@MainActor struct HouseholdSnapshotStorage {
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
    /// Prepared account-scoped cleanup. General logout write(nil) stays separate.
    func remove(account: UUID) throws {
        guard account != UUID(uuidString: "00000000-0000-0000-0000-000000000000"),
              directory.isFileURL, !namespace.isEmpty, !namespace.contains("/"), !namespace.contains("\\") else {
            throw CloudError.invalidInput
        }
        do {
            let rootAttributes = try FileManager.default.attributesOfItem(atPath: directory.path)
            guard rootAttributes[.type] as? FileAttributeType == .typeDirectory else { throw CloudError.invalidInput }
            let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
            guard attributes[.type] as? FileAttributeType == .typeRegular,
                  let size = attributes[.size] as? NSNumber, size.intValue <= 10 * 1024 * 1024 else { throw CloudError.invalidInput }
            _ = try OfflineSnapshot.decode(Data(contentsOf: file), account: account)
            try FileManager.default.removeItem(at: file)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile {
            return
        }
        // Durable absence must be confirmed, rather than inferred from a call.
        do {
            _ = try FileManager.default.attributesOfItem(atPath: file.path)
            throw CocoaError(.fileWriteUnknown)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile {
            return
        }
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
@MainActor struct PendingAttachmentStorage {
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
    /// Prepared scoped cleanup; does not run automatically on owner data.
    func remove(account: UUID, epoch: UUID) throws {
        try removeOwnedPendingFile(file, account: account, epoch: epoch, limit: 7 * 1024 * 1024) { data in
            _ = try PendingAttachment.decode(data, account: account, epoch: epoch)
        }
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

@MainActor struct PendingAttachmentRemovalStorage {
    private let file: URL
    init(directory: URL? = nil) {
        let root = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ouchi-isolated-attachment-retry", isDirectory: true)
        file = root.appendingPathComponent("pending-removal.json")
    }
    func read(account: UUID, epoch: UUID) throws -> PendingAttachmentRemoval? {
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max
        guard size <= 4096 else { throw CloudError.invalidInput }
        return try PendingAttachmentRemoval.decode(Data(contentsOf: file), account: account, epoch: epoch)
    }
    func remove(account: UUID, epoch: UUID) throws {
        try removeOwnedPendingFile(file, account: account, epoch: epoch, limit: 4096) { data in
            _ = try PendingAttachmentRemoval.decode(data, account: account, epoch: epoch)
        }
    }
    func write(_ value: PendingAttachmentRemoval?) throws {
        guard let value else {
            if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
            return
        }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        #if os(iOS)
        let options: Data.WritingOptions = [.atomic, .completeFileProtection]
        #else
        let options: Data.WritingOptions = [.atomic]
        #endif
        try value.encode().write(to: file, options: options)
        var location = file; var attributes = URLResourceValues(); attributes.isExcludedFromBackup = true
        try location.setResourceValues(attributes)
    }
}

/// Serial with in-app writes; foreign/corrupt/linked files require recovery,
/// never unconditional removal. Not an external-process filesystem lock.
@MainActor private func removeOwnedPendingFile(_ file: URL, account: UUID, epoch: UUID, limit: Int,
                                               validate: (Data) throws -> Void) throws {
    let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
    guard file.isFileURL, account != zero, epoch != zero else { throw CloudError.invalidInput }
    let manager = FileManager.default
    do {
        let root = try manager.attributesOfItem(atPath: file.deletingLastPathComponent().path)
        guard root[.type] as? FileAttributeType == .typeDirectory else { throw CloudError.invalidInput }
        let attributes = try manager.attributesOfItem(atPath: file.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular,
              let size = attributes[.size] as? NSNumber, size.intValue <= limit else { throw CloudError.invalidInput }
        try validate(Data(contentsOf: file))
        try manager.removeItem(at: file)
    } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile {
        return
    }
    do {
        _ = try manager.attributesOfItem(atPath: file.path)
        throw CocoaError(.fileWriteUnknown)
    } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile {
        return
    }
}

/// Account-scoped handoff intent only. No password, bearer, ownership flag or
/// server expiry is stored. Logout does not silently remove an uncertain intent.
struct HomeHandoffIntentVault {
    enum Failure: Error { case invalidInput, unavailable, scopeMismatch, capacity }
    let service: String
    private func query(_ requestID: UUID) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: "home-handoff-" + requestID.uuidString.lowercased(),
         kSecAttrSynchronizable as String: false]
    }
    private func validate(_ value: HomeHandoffIntent) throws {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        let binding = value.binding
        guard !service.isEmpty, [binding.accountID, binding.epochID, binding.homeID, binding.requestID].allSatisfy({ $0 != zero }),
              value.recipientID != zero, value.recipientID != binding.accountID,
              value.createdAt.timeIntervalSince1970.isFinite else { throw Failure.invalidInput }
    }
    func read(requestID: UUID) throws -> HomeHandoffIntent? {
        guard !service.isEmpty else { throw Failure.invalidInput }
        var q = query(requestID); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data, data.count <= 4096 else { throw Failure.unavailable }
        let saved = try JSONDecoder().decode(HomeHandoffIntent.self, from: data)
        try validate(saved)
        guard saved.binding.requestID == requestID else { throw Failure.scopeMismatch }
        return saved
    }
    /// Reads existing intents after restart; never creates a fresh request ID.
    func references(accountID: UUID) throws -> [HomeHandoffIntent] {
        guard !service.isEmpty, accountID != UUID(uuidString: "00000000-0000-0000-0000-000000000000") else { throw Failure.invalidInput }
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrSynchronizable as String: false, kSecReturnAttributes as String: true, kSecMatchLimit as String: kSecMatchLimitAll]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return [] }
        guard status == errSecSuccess, let items = result as? [[String: Any]], items.count <= 32 else { throw Failure.unavailable }
        var saved: [HomeHandoffIntent] = []; var seen = Set<UUID>()
        for item in items {
            guard let name = item[kSecAttrAccount as String] as? String, name.hasPrefix("home-handoff-"),
                  let id = UUID(uuidString: String(name.dropFirst("home-handoff-".count))), seen.insert(id).inserted,
                  let value = try read(requestID: id) else { throw Failure.invalidInput }
            if value.binding.accountID == accountID { saved.append(value) }
        }
        return saved.sorted { $0.binding.requestID.uuidString < $1.binding.requestID.uuidString }
    }
    func prepare(binding: HomeHandoffBinding, recipientID: UUID?) throws -> HomeHandoffIntent {
        let proposal = HomeHandoffIntent(binding: binding, recipientID: recipientID, createdAt: Date())
        try validate(proposal)
        func checked(_ saved: HomeHandoffIntent) throws -> HomeHandoffIntent {
            guard saved.binding == binding, recipientID == nil || saved.recipientID == recipientID else { throw Failure.scopeMismatch }
            return saved
        }
        if let saved = try read(requestID: binding.requestID) { return try checked(saved) }
        // Count every account's records without silently deleting older intents.
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrSynchronizable as String: false, kSecReturnAttributes as String: true, kSecMatchLimit as String: kSecMatchLimitAll]
        var result: CFTypeRef?; let countStatus = SecItemCopyMatching(q as CFDictionary, &result)
        guard countStatus == errSecItemNotFound || countStatus == errSecSuccess else { throw Failure.unavailable }
        if countStatus == errSecSuccess {
            guard let items = result as? [[String: Any]], items.count < 32 else { throw Failure.capacity }
        }
        var add = query(binding.requestID)
        add[kSecValueData as String] = try JSONEncoder().encode(proposal)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess || status == errSecDuplicateItem else { throw Failure.unavailable }
        guard let stored = try read(requestID: binding.requestID) else { throw Failure.unavailable }
        return try checked(stored)
    }
    /// Explicit dismissal only; this never cancels a remote pending operation.
    func remove(binding: HomeHandoffBinding) throws {
        guard let saved = try read(requestID: binding.requestID) else { return }
        guard saved.binding == binding else { throw Failure.scopeMismatch }
        let status = SecItemDelete(query(binding.requestID) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound,
              try read(requestID: binding.requestID) == nil else { throw Failure.unavailable }
    }
}
