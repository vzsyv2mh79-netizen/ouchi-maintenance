import Foundation
import OuchiCore

final class DeletionVault: SessionStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var data: Data?
    private var failing = false
    private var ignoreErase = false
    private var failingRead = false
    init(_ data: Data) { self.data = data }
    func read() throws -> Data? { try lock.withLock {
        if failingRead { throw CloudError.unavailable }
        return data
    } }
    func fail(_ enabled: Bool) { lock.withLock { failing = enabled } }
    func ignoreErasure(_ enabled: Bool) { lock.withLock { ignoreErase = enabled } }
    func failRead(_ enabled: Bool) { lock.withLock { failingRead = enabled } }
    func write(_ data: Data?) throws {
        try lock.withLock {
            if failing { throw CloudError.unavailable }
            if data == nil && ignoreErase { return }
            self.data = data
        }
    }
}
actor DeletionRefreshGate {
    private var started = false
    private var arrival: CheckedContinuation<Void, Never>?
    private var release: CheckedContinuation<Void, Never>?
    func waitForArrival() async {
        if started { return }
        await withCheckedContinuation { arrival = $0 }
    }
    func hold() async {
        started = true; arrival?.resume(); arrival = nil
        await withCheckedContinuation { release = $0 }
    }
    func finish() { release?.resume(); release = nil }
}
@main struct CompletedDeletionSessionSmoke {
    static func main() async throws {
        let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let epoch = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
        let other = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        let request = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        let data = Data(#"{"access_token":"synthetic","refresh_token":"synthetic-refresh","expires_at":2000000000,"user":{"id":"11111111-1111-4111-8111-111111111111"}}"#.utf8)
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_test_only")
        let api = HouseholdAPI(config: config) { _ in fatalError("No network expected") }
        let vault = DeletionVault(data), controller = SessionController(api: api, storage: vault)
        _ = try await controller.restore()
        func receipt(_ state: String, _ receiptEpoch: UUID = epoch, _ id: UUID = request) throws -> AccountDeletionStatus {
            try AccountDeletionStatus.currentProgress(Data("{\"requestID\":\"\(id)\",\"epochID\":\"\(receiptEpoch)\",\"state\":\"\(state)\"}".utf8), httpStatus: 200)
        }
        for state in ["pending", "running", "failed"] {
            do { _ = try await controller.prepareCompletedDeletionErasure(receipt: receipt(state), account: account, epoch: epoch); fatalError("Unfinished server state accepted") }
            catch { precondition(error as? CloudError == .authenticationRequired) }
        }
        for scope in [(other,epoch), (account,other), (account,account), (zero,epoch)] {
            do { _ = try await controller.prepareCompletedDeletionErasure(receipt: receipt("complete"), account: scope.0, epoch: scope.1); fatalError("Wrong scope accepted") }
            catch { precondition(error as? CloudError == .authenticationRequired) }
        }
        let permit = try await controller.prepareCompletedDeletionErasure(receipt: receipt("complete"), account: account, epoch: epoch)
        // Even restoring the same account replaces the local login generation.
        _ = try await controller.restore()
        do { try await controller.eraseCompletedDeletionSession(permit); fatalError("Old permit accepted after same-account restore") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        let persistedData = try vault.read(); precondition(persistedData == data)
        let current = try await controller.prepareCompletedDeletionErasure(receipt: receipt("complete"), account: account, epoch: epoch)
        vault.fail(true)
        do { try await controller.eraseCompletedDeletionSession(current); fatalError("Storage failure ignored") }
        catch { precondition(error as? CloudError == .unavailable) }
        let failedEraseData = try vault.read(); precondition(failedEraseData == data)
        let retainedAccount = await controller.localAccount(); precondition(retainedAccount == account)
        vault.fail(false)
        do { try await controller.eraseCompletedDeletionSession(current); fatalError("Failed-erasure generation reused") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        vault.ignoreErasure(true)
        do { try await controller.signOut(); fatalError("False erase acknowledgement accepted") }
        catch { precondition(error is SessionErasureError) }
        let afterFalseAck = await controller.localAccount(); precondition(afterFalseAck == account)
        let falseAckData = try vault.read(); precondition(falseAckData == data)
        vault.ignoreErasure(false); vault.failRead(true)
        do { try await controller.signOut(); fatalError("Readback failure accepted") }
        catch { precondition(error as? CloudError == .unavailable) }
        let afterReadFailure = await controller.localAccount(); precondition(afterReadFailure == account)
        vault.failRead(false)
        let retry = try await controller.prepareCompletedDeletionErasure(receipt: receipt("complete"), account: account, epoch: epoch)
        let confirmation=try await controller.eraseCompletedDeletionSession(retry)
        try await controller.withConfirmedErasure(confirmation) {}
        let absentData = try vault.read(); precondition(absentData == nil)
        let erasedAccount = await controller.localAccount(); precondition(erasedAccount == nil)
        do { _ = try await controller.credentials(); fatalError("Erased credentials available") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        do { try await controller.eraseCompletedDeletionSession(current); fatalError("Permit reused") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        try vault.write(data)
        _ = try await controller.restore()
        do { try await controller.withConfirmedErasure(confirmation) { fatalError("Stale confirmation finalized replacement login") }; fatalError("Stale confirmation accepted") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        try await controller.signOut()
        // A refresh already in flight cannot repopulate an erased session,
        // even when its transport continues after cancellation.
        let gate = DeletionRefreshGate()
        let slowAPI = HouseholdAPI(config: config) { request in
            await gate.hold()
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let expiredData = Data(String(decoding: data, as: UTF8.self).replacingOccurrences(of: "2000000000", with: "1").utf8)
        let refreshVault = DeletionVault(expiredData), refreshing = SessionController(api: slowAPI, storage: refreshVault)
        _ = try await refreshing.restore()
        let pending = Task { try await refreshing.credentials(now: Date(timeIntervalSince1970: 100)) }
        await gate.waitForArrival()
        let refreshPermit = try await refreshing.prepareCompletedDeletionErasure(receipt: receipt("complete"), account: account, epoch: epoch)
        try await refreshing.eraseCompletedDeletionSession(refreshPermit)
        await gate.finish()
        do { _ = try await pending.value; fatalError("Refresh resurrected erased session") }
        catch { precondition(error is CancellationError || error as? CloudError == .authenticationRequired) }
        let absentRefreshData = try refreshVault.read(); precondition(absentRefreshData == nil)
        // Failed erasure must also invalidate a refresh already in flight.
        let failedGate = DeletionRefreshGate()
        let failedAPI = HouseholdAPI(config: config) { request in
            await failedGate.hold()
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let failedVault = DeletionVault(expiredData)
        let failedController = SessionController(api: failedAPI, storage: failedVault)
        _ = try await failedController.restore()
        let late = Task { try await failedController.credentials(now: Date(timeIntervalSince1970: 100)) }
        await failedGate.waitForArrival()
        failedVault.fail(true)
        do { try await failedController.signOut(); fatalError("Erase failure accepted") }
        catch { precondition(error as? CloudError == .unavailable) }
        await failedGate.finish()
        do { _ = try await late.value; fatalError("Refresh accepted after failed erase") }
        catch { precondition(error is CancellationError) }
        let unchanged = try failedVault.read(); precondition(unchanged == expiredData)
        let retryAccount = await failedController.localAccount(); precondition(retryAccount == account)
        failedVault.fail(false)
        try await failedController.signOut()
        let finallyAbsent = try failedVault.read(); precondition(finallyAbsent == nil)
        print("PASS: only complete matching receipts issue local erasure permits; same-account restore rejects stale permit; storage failure retains retryable login; successful erasure clears storage and memory; reused permit rejected; delayed refresh cannot resurrect credentials. Synthetic storage/receipt, not server deletion or actual Keychain proof.")
    }
}
