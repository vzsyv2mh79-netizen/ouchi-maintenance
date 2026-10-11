import Foundation
import OuchiCore
@main struct AccountDeletionLocalCleanupSmoke {
    @MainActor static func main() async throws {
        let account = UUID(), epoch = UUID(), revision = UUID(), request = UUID()
        func receipt(_ scope: UUID) throws -> AccountDeletionStatus {
            try AccountDeletionStatus.currentProgress(Data("{\"requestID\":\"\(request)\",\"epochID\":\"\(scope)\",\"state\":\"running\"}".utf8), httpStatus: 200)
        }
        var calls: [String] = [], bound = true, fail = false, changeDuringNotifications = false
        var registrationResult = AccountDeletionLocalCleanupResult.complete
        var changeDuringRegistration = false
        func perform(_ value: AccountDeletionStatus) async -> AccountDeletionLocalCleanupResult {
            await cleanAccountDeletionLocalData(receipt: value, account: account, epoch: epoch, revision: revision,
                stillBound: { bound }, stopNotifications: { calls.append("notifications"); if changeDuringNotifications { bound = false }; return true },
                erasePendingRegistration: { calls.append("registration"); if changeDuringRegistration { bound = false }; return registrationResult },
                eraseSnapshot: { calls.append("snapshot"); if fail { throw CloudError.unavailable } },
                erasePendingUpload: { calls.append("upload") }, erasePendingRemoval: { calls.append("removal") },
                eraseManagedExports: { calls.append("exports") }, clearVisibleData: { calls.append("visible") })
        }
        let current = try receipt(epoch)
        let wrong = try receipt(UUID()); let wrongResult = await perform(wrong); precondition(wrongResult == .staleBinding && calls.isEmpty)
        let successful = await perform(current); precondition(successful == .complete)
        precondition(calls == ["notifications", "registration", "snapshot", "upload", "removal", "exports", "visible"])
        calls = []; fail = true; let partial = await perform(current); precondition(partial == .pending && calls.last == "visible")
        calls = []; fail = false; let retry = await perform(current); precondition(retry == .complete)
        calls = []; registrationResult = .pending
        let pendingKeys = await perform(current); precondition(pendingKeys == .pending && calls.last == "visible")
        calls = []; registrationResult = .staleBinding
        let staleKeys = await perform(current); precondition(staleKeys == .staleBinding && calls == ["notifications","registration"])
        calls = []; registrationResult = .complete; changeDuringRegistration = true
        let changedKeys = await perform(current); precondition(changedKeys == .staleBinding && calls == ["notifications","registration"])
        bound = true; changeDuringRegistration = false
        calls = []; changeDuringNotifications = true; let stale = await perform(current); precondition(stale == .staleBinding && calls == ["notifications"])
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-deletion-local-fixture-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let snapshot = HouseholdSnapshotStorage(namespace: "synthetic", directory: folder.appendingPathComponent("snapshots"))
        let pending = PendingAttachmentStorage(directory: folder.appendingPathComponent("pending"))
        let removal = PendingAttachmentRemovalStorage(directory: folder.appendingPathComponent("pending"))
        let household = try JSONDecoder().decode(Household.self, from: Data(#"{"homes":[],"products":[],"tasks":[],"history":[]}"#.utf8))
        try snapshot.write(OfflineSnapshot(account: account, household: household))
        try pending.write(PendingAttachment(account: account, epoch: epoch, product: UUID(), id: UUID(), bytes: Data([137,80,78,71,13,10,26,10]), mime: "image/png"))
        try removal.write(PendingAttachmentRemoval(account: account, epoch: epoch, product: UUID(), id: UUID()))
        let exportsRoot = folder.appendingPathComponent("exports"), otherAccount = UUID()
        for owner in [account, otherAccount] {
            let directory = exportsRoot.appendingPathComponent(owner.uuidString.lowercased())
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try Data("synthetic export".utf8).write(to: directory.appendingPathComponent(UUID().uuidString).appendingPathExtension("json"))
        }
        let exports = ManagedExportStorage(root: exportsRoot)
        var notificationSuccess = false
        func cleanupFiles() async -> AccountDeletionLocalCleanupResult {
            await cleanAccountDeletionLocalData(receipt: current, account: account, epoch: epoch, revision: revision,
                stillBound: { true }, stopNotifications: { notificationSuccess },
                erasePendingRegistration: { .complete },
                eraseSnapshot: { try snapshot.remove(account: account) },
                erasePendingUpload: { try pending.remove(account: account, epoch: epoch) },
                erasePendingRemoval: { try removal.remove(account: account, epoch: epoch) },
                eraseManagedExports: { try exports.removeFiles(account: account) }, clearVisibleData: {})
        }
        let filesPending = await cleanupFiles(); precondition(filesPending == .pending)
        let snapshotAbsent = try snapshot.read(account: account), pendingAbsent = try pending.read(account: account, epoch: epoch), removalAbsent = try removal.read(account: account, epoch: epoch)
        precondition(snapshotAbsent == nil && pendingAbsent == nil && removalAbsent == nil)
        let ownExports = try exports.files(account: account), foreignExports = try exports.files(account: otherAccount)
        precondition(ownExports.isEmpty && foreignExports.count == 1)
        notificationSuccess = true; let filesComplete = await cleanupFiles(); precondition(filesComplete == .complete)
        print("AccountDeletionLocalCleanupSmoke PASS: receipt epoch refusal, ordered local cleanup, partial failure stays pending, retry and binding change before file erasure. Actual app storage adapters with synthetic temporary files also erased owned data, retained another account export and retried partial notification failure. No owner data erased.")
    }
}
