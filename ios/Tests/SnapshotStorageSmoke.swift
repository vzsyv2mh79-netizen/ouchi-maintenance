import Foundation
import OuchiCore

@main struct SnapshotStorageSmoke {
    static func main() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-snapshot-test-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let storage = HouseholdSnapshotStorage(namespace: "synthetic", directory: folder)
        let account = UUID()
        let household = try JSONDecoder().decode(Household.self, from: Data(#"{"homes":[],"products":[],"tasks":[],"history":[]}"#.utf8))
        let empty = try storage.read(account: account); precondition(empty == nil)
        try storage.write(OfflineSnapshot(account: account, household: household))
        let copy = try storage.read(account: account); precondition(copy?.account == account)
        let file = folder.appendingPathComponent("synthetic.json")
        #if os(iOS)
        let flags = try file.resourceValues(forKeys: [.isExcludedFromBackupKey])
        precondition(flags.isExcludedFromBackup == true)
        #endif
        do { _ = try storage.read(account: UUID()); fatalError("another account read snapshot") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        try storage.write(nil)
        let deleted = try storage.read(account: account); precondition(deleted == nil)
        try storage.write(nil)
        let pendingStorage = PendingAttachmentStorage(directory: folder.appendingPathComponent("pending-test"))
        let epoch = UUID(), identifier = UUID(), bytes = Data([137,80,78,71,13,10,26,10])
        let pending = try PendingAttachment(account: account, epoch: epoch, product: UUID(), id: identifier, bytes: bytes, mime: "image/png")
        try pendingStorage.write(pending)
        let resumed = try pendingStorage.read(account: account, epoch: epoch)
        precondition(resumed?.id == identifier && resumed?.bytes == bytes)
        do { _ = try pendingStorage.read(account: account, epoch: UUID()); fatalError("old enrollment read pending file") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        let pendingFile = folder.appendingPathComponent("pending-test/pending.json")
        let validBytes = try Data(contentsOf: pendingFile)
        try Data("{invalid}".utf8).write(to: pendingFile)
        do { _ = try pendingStorage.read(account: account, epoch: epoch); fatalError("corrupt retry accepted") } catch {}
        try Data(count: 7 * 1024 * 1024 + 1).write(to: pendingFile)
        do { _ = try pendingStorage.read(account: account, epoch: epoch); fatalError("oversized retry read") }
        catch { precondition(error as? CloudError == .invalidInput) }
        try validBytes.write(to: pendingFile)
        let preserved = try pendingStorage.read(account: account, epoch: epoch); precondition(preserved?.id == identifier)
        try pendingStorage.write(nil)
        let cleared = try pendingStorage.read(account: account, epoch: epoch); precondition(cleared == nil)
        try pendingStorage.write(nil)
        print("SnapshotStorageSmoke PASS: actual temporary file roundtrip, other-account refusal, deletion and repeat deletion. No real records. iOS file protection/backup exclusion requires device verification.")
    }
}
