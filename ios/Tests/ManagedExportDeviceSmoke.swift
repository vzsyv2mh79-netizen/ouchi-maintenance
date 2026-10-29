import Foundation

enum ManagedExportSmoke {
    enum Failure: Error { case invalidResult; case checkFailed(String) }
    static func check(_ value: Bool, _ label: String = "scope check") throws { guard value else { throw Failure.checkFailed(label) } }
    static func run() throws {
        let fm = FileManager.default
        let root = fm.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: root) }
        let account = UUID(), other = UUID()
        let storage = ManagedExportStorage(root: root)
        let own = try storage.write(Data("synthetic owned".utf8), account: account, extension: "json")
        let foreign = try storage.write(Data("synthetic foreign".utf8), account: other, extension: "ics")
        for file in [own, foreign] {
            let attributes = try fm.attributesOfItem(atPath: file.path)
            print("PROTECTION ATTRIBUTE: \(String(describing: attributes[.protectionKey]))")
            if let raw = attributes[.protectionKey] as? String {
                try check(raw == FileProtectionType.complete.rawValue, "complete file protection attribute")
            } else { print("UNCONFIRMED: simulator does not expose file protection; physical-device lock verification required") }
        }
        let reopened = ManagedExportStorage(root: root)
        try check(try reopened.files(account: account).map(\.lastPathComponent) == [own.lastPathComponent])
        try check(try Data(contentsOf: own) == Data("synthetic owned".utf8))
        let unowned = own.deletingLastPathComponent().appendingPathComponent("user-saved.json")
        try Data("user copy".utf8).write(to: unowned)
        let link = own.deletingLastPathComponent().appendingPathComponent(UUID().uuidString + ".pdf")
        try fm.createSymbolicLink(at: link, withDestinationURL: foreign)
        try reopened.removeFiles(account: account)
        try check(!fm.fileExists(atPath: own.path))
        try check(try Data(contentsOf: foreign) == Data("synthetic foreign".utf8))
        try check(try Data(contentsOf: unowned) == Data("user copy".utf8))
        try reopened.removeFiles(account: account)
        let moved = root.deletingLastPathComponent().appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: moved) }
        try fm.moveItem(at: root, to: moved)
        try fm.createSymbolicLink(at: root, withDestinationURL: moved)
        do { _ = try reopened.write(Data(), account: other, extension: "pdf"); throw Failure.invalidResult }
        catch is Failure { throw Failure.invalidResult }
        catch {}
        print("PASS: protected write/readback/reopen/scoped cleanup/foreign preservation/symlink refusal")
    }
}
