import Foundation

/// App-owned exports stay discoverable after restart, separate from user-saved copies.
public struct ManagedExportStorage {
    private let root: URL
    public init(root: URL) { self.root = root.standardizedFileURL }

    private func directory(account: UUID) throws -> URL {
        guard root.isFileURL else { throw CocoaError(.fileWriteInvalidFileName) }
        let result = root.appendingPathComponent(account.uuidString.lowercased(), isDirectory: true)
        // Never follow a replaced app-owned directory into another location.
        for url in [root, result] {
            do {
                // URL resource values can remain cached after a directory is replaced.
                let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
                guard attributes[.type] as? FileAttributeType == .typeDirectory else {
                    throw CocoaError(.fileReadNoPermission)
                }
            } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile {
                // A missing app-owned directory may be created by write().
            }
        }
        return result
    }

    public func write(_ data: Data, account: UUID, extension suffix: String) throws -> URL {
        guard ["json", "ics", "pdf", "jpg", "png"].contains(suffix) else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
        let folder = try directory(account: account)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent(UUID().uuidString.lowercased()).appendingPathExtension(suffix)
        try data.write(to: file, options: [.atomic, .completeFileProtection])
        return file
    }

    public func files(account: UUID) throws -> [URL] {
        let folder = try directory(account: account)
        guard FileManager.default.fileExists(atPath: folder.path) else { return [] }
        let items = try FileManager.default.contentsOfDirectory(at: folder,
            includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        return try items.filter { item in
            let values = try item.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isSymbolicLink != true, values.isRegularFile == true,
                  UUID(uuidString: item.deletingPathExtension().lastPathComponent) != nil else { return false }
            return ["json", "ics", "pdf", "jpg", "png"].contains(item.pathExtension)
        }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    /// Removes only discoverable app-owned exports for one account. This is not
    /// a complete device wipe and never removes directories or user-saved copies.
    public func removeFiles(account: UUID) throws {
        let owned = try files(account: account)
        for file in owned {
            // Revalidate directory ownership before each operation; do not rely
            // on URL resource values cached by the initial enumeration.
            let folder = try directory(account: account)
            guard file.deletingLastPathComponent().standardizedFileURL == folder.standardizedFileURL else {
                throw CocoaError(.fileReadNoPermission)
            }
            do {
                let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
                guard attributes[.type] as? FileAttributeType == .typeRegular else {
                    throw CocoaError(.fileReadNoPermission)
                }
                try FileManager.default.removeItem(at: file)
            } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile {
                // Already absent: a retry must remain safe after partial cleanup.
            }
        }
        guard try files(account: account).isEmpty else { throw CocoaError(.fileWriteUnknown) }
    }
}
