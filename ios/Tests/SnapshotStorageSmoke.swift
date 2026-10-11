import Foundation
import OuchiCore

@main @MainActor struct SnapshotStorageSmoke {
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
        do { try storage.remove(account: UUID()); fatalError("another account removed snapshot") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        precondition(FileManager.default.fileExists(atPath: file.path))
        let originalSnapshot = try Data(contentsOf: file)
        try Data("{invalid}".utf8).write(to: file)
        do { try storage.remove(account: account); fatalError("corrupt snapshot removed without ownership proof") } catch {}
        let corruptSnapshot = try Data(contentsOf: file)
        precondition(corruptSnapshot == Data("{invalid}".utf8))
        try originalSnapshot.write(to: file)
        let linkedDirectory = folder.appendingPathComponent("linked-directory")
        try FileManager.default.createSymbolicLink(at: linkedDirectory, withDestinationURL: folder)
        let replacedStorage = HouseholdSnapshotStorage(namespace: "synthetic", directory: linkedDirectory)
        do { try replacedStorage.remove(account: account); fatalError("linked directory accepted") }
        catch { precondition(error as? CloudError == .invalidInput) }
        precondition(FileManager.default.fileExists(atPath: file.path))
        let traversing = HouseholdSnapshotStorage(namespace: "../synthetic", directory: folder)
        do { try traversing.remove(account: account); fatalError("traversing namespace accepted") }
        catch { precondition(error as? CloudError == .invalidInput) }
        let linked = HouseholdSnapshotStorage(namespace: "link", directory: folder)
        let link = folder.appendingPathComponent("link.json")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: file)
        do { try linked.remove(account: account); fatalError("linked snapshot removed") }
        catch { precondition(error as? CloudError == .invalidInput) }
        precondition(FileManager.default.fileExists(atPath: file.path))
        try storage.remove(account: account)
        try storage.remove(account: account)
        precondition(!FileManager.default.fileExists(atPath: file.path))
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
        for scope in [(UUID(), epoch), (account, UUID())] {
            do { try pendingStorage.remove(account: scope.0, epoch: scope.1); fatalError("foreign pending removed") }
            catch { precondition(error as? CloudError == .authenticationRequired) }
            precondition(FileManager.default.fileExists(atPath: pendingFile.path))
        }
        try Data("{invalid}".utf8).write(to: pendingFile)
        do { try pendingStorage.remove(account: account, epoch: epoch); fatalError("corrupt pending removed") } catch {}
        precondition(FileManager.default.fileExists(atPath: pendingFile.path))
        try validBytes.write(to: pendingFile)
        try pendingStorage.remove(account: account, epoch: epoch)
        try pendingStorage.remove(account: account, epoch: epoch)
        let cleared = try pendingStorage.read(account: account, epoch: epoch); precondition(cleared == nil)
        try pendingStorage.write(nil)
        let removalDirectory = folder.appendingPathComponent("removal-test")
        let removalStorage = PendingAttachmentRemovalStorage(directory: removalDirectory)
        let removal = try PendingAttachmentRemoval(account: account, epoch: epoch, product: UUID(), id: UUID())
        try removalStorage.write(removal)
        let recoveredRemoval = try removalStorage.read(account: account, epoch: epoch)
        precondition(recoveredRemoval?.id == removal.id && recoveredRemoval?.product == removal.product)
        for scope in [(UUID(), epoch), (account, UUID())] {
            do { _ = try removalStorage.read(account: scope.0, epoch: scope.1); fatalError("foreign removal recovered") }
            catch { precondition(error as? CloudError == .authenticationRequired) }
        }
        let removalFile = removalDirectory.appendingPathComponent("pending-removal.json")
        let receipt = try Data(contentsOf: removalFile)
        try Data(count: 4097).write(to: removalFile)
        do { _ = try removalStorage.read(account: account, epoch: epoch); fatalError("oversized removal recovered") }
        catch { precondition(error as? CloudError == .invalidInput) }
        try receipt.write(to: removalFile)
        let stillPending = try removalStorage.read(account: account, epoch: epoch)
        precondition(stillPending?.id == removal.id)
        for scope in [(UUID(), epoch), (account, UUID())] {
            do { try removalStorage.remove(account: scope.0, epoch: scope.1); fatalError("foreign removal file erased") }
            catch { precondition(error as? CloudError == .authenticationRequired) }
        }
        try Data("{invalid}".utf8).write(to: removalFile)
        do { try removalStorage.remove(account: account, epoch: epoch); fatalError("corrupt removal erased") } catch {}
        precondition(FileManager.default.fileExists(atPath: removalFile.path))
        try receipt.write(to: removalFile)
        let removalLink = folder.appendingPathComponent("removal-link")
        try FileManager.default.createSymbolicLink(at: removalLink, withDestinationURL: removalDirectory)
        do { try PendingAttachmentRemovalStorage(directory: removalLink).remove(account: account, epoch: epoch); fatalError("linked retry directory erased") }
        catch { precondition(error as? CloudError == .invalidInput) }
        precondition(FileManager.default.fileExists(atPath: removalFile.path))
        try removalStorage.remove(account: account, epoch: epoch)
        try removalStorage.remove(account: account, epoch: epoch)
        let noRemoval = try removalStorage.read(account: account, epoch: epoch)
        precondition(noRemoval == nil)
        try removalStorage.write(nil)
        print("SnapshotStorageSmoke PASS: actual temporary file roundtrip, other-account refusal, deletion and repeat deletion. No real records. iOS file protection/backup exclusion requires device verification.")
    }
}
