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
        print("SnapshotStorageSmoke PASS: actual temporary file roundtrip, other-account refusal, deletion and repeat deletion. No real records. iOS file protection/backup exclusion requires device verification.")
    }
}
