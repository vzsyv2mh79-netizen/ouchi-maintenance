import XCTest
@testable import OuchiCore

private actor CustodyFlowServer {
    let expiry: String
    private(set) var paths: [String] = []
    var registered = false
    var loseRegistration = false
    var unavailable = false
    var holdStatus = false
    var progressState = "running"
    var arrived = false
    var arrival: CheckedContinuation<Void, Never>?
    var release: CheckedContinuation<Void, Never>?
    init() {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        expiry = formatter.string(from: Date().addingTimeInterval(3600))
    }
    func configure(registered: Bool = false, lose: Bool = false, unavailable: Bool = false, hold: Bool = false, state: String = "running") {
        self.registered = registered; loseRegistration = lose; self.unavailable = unavailable; holdStatus = hold; progressState = state
    }
    func wait() async { if arrived { return }; await withCheckedContinuation { arrival = $0 } }
    func finish() { release?.resume(); release = nil }
    func reply(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let action = request.url!.lastPathComponent; paths.append(action)
        let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
        var result: [String: Any] = ["requestID": body["requestID"]!, "epochID": body["expectedEpochID"]!, "submissionID": body["submissionID"]!]
        var status = 200
        if action == "window" { result["kind"] = "app-closure-read-window/v1"; result["expiresAt"] = expiry }
        else {
            result["credentialID"] = body["credentialID"]!
            if action == "register" {
                registered = true
                if loseRegistration { loseRegistration = false; throw URLError(.networkConnectionLost) }
                result["kind"] = "app-closure-read-registration/v1"; result["registered"] = true; result["expiresAt"] = body["expiresAt"]!
            } else {
                XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
                if holdStatus { await withCheckedContinuation { release = $0; arrived = true; arrival?.resume(); arrival = nil } }
                result["kind"] = registered && !unavailable ? "app-closure-read-status/v1" : "app-closure-read-unavailable/v1"
                result["state"] = registered && !unavailable ? progressState : "unavailable"
                status = registered && !unavailable ? 200 : 404
            }
        }
        return (try JSONSerialization.data(withJSONObject: result), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
    }
}
@MainActor private final class CustodyMemory {
    var saved: ClosureReadCredential?
    var preparations = 0
    weak var flow: ClosureReadCustodyFlow?
    var changeBinding = false
    var rejectWrite = false
    var rejectRead = false
    var wrongScope = false
    func read(_ binding: ClosureReadCustodyFlow.Binding) throws -> ClosureReadCredential? {
        if rejectRead { throw CloudError.unavailable }; return saved
    }
    func prepare(_ binding: ClosureReadCustodyFlow.Binding, _ window: ClosureReadWindow) throws -> ClosureReadCredential {
        preparations += 1
        if rejectWrite { throw CloudError.unavailable }
        let token = Data(repeating: 19, count: 32).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let value = ClosureReadCredential(accountID: wrongScope ? UUID() : binding.accountID, scope: window.scope, credentialID: UUID(), expiresAt: window.expiresAt, token: token)
        saved = value
        if changeBinding { flow?.bind(.init(accountID: UUID(), scope: binding.scope, revision: UUID())) }
        return value
    }
}
final class ClosureReadCustodyFlowTests: XCTestCase {
    @MainActor private func fixture() -> (CustodyFlowServer, CustodyMemory, ClosureReadCustodyFlow, ClosureReadCustodyFlow.Binding) {
        let server = CustodyFlowServer(), memory = CustodyMemory()
        let binding = ClosureReadCustodyFlow.Binding(accountID: UUID(), scope: .init(requestID: UUID(), epochID: UUID(), submissionID: UUID()), revision: UUID())
        let flow = ClosureReadCustodyFlow(api: .init(transport: { try await server.reply($0) }), read: { try memory.read($0) }, prepare: { try memory.prepare($0, $1) })
        memory.flow = flow; flow.bind(binding); return (server, memory, flow, binding)
    }
    @MainActor func testDurableReadbackPrecedesRegistrationAndRecoveryNeverSendsAuth() async throws {
        let (server, memory, flow, binding) = fixture()
        try await flow.prepareAndRegister(bearer: "synthetic")
        XCTAssertEqual(memory.preparations, 1); XCTAssertEqual(flow.confirmed?.binding, binding); XCTAssertNil(flow.status)
        XCTAssertFalse(flow.resultUnconfirmed)
        let saved = memory.saved
        let progress = try await flow.recover()
        XCTAssertEqual(progress?.state, .running); XCTAssertEqual(flow.confirmed?.credentialID, saved?.credentialID)
        XCTAssertEqual(memory.saved, saved)
        let paths = await server.paths; XCTAssertEqual(paths, ["window", "status", "register", "status"])
    }
    @MainActor func testLostRegistrationReplyRestartsWithOriginalProtectedRecordAndReadOnlyProbe() async throws {
        let (server, memory, flow, binding) = fixture(); await server.configure(lose: true)
        do { try await flow.prepareAndRegister(bearer: "synthetic"); XCTFail("Lost reply must remain unconfirmed") } catch { XCTAssertTrue(error is URLError) }
        let saved = memory.saved; XCTAssertNotNil(saved); XCTAssertNil(flow.confirmed); XCTAssertTrue(flow.resultUnconfirmed)
        let restored = ClosureReadCustodyFlow(api: .init(transport: { try await server.reply($0) }), read: { try memory.read($0) }, prepare: { try memory.prepare($0, $1) })
        restored.bind(.init(accountID: binding.accountID, scope: binding.scope, revision: UUID()))
        let status = try await restored.recover()
        XCTAssertEqual(status?.state, .running); XCTAssertNotNil(restored.confirmed); XCTAssertEqual(memory.saved, saved); XCTAssertEqual(memory.preparations, 1)
        let paths = await server.paths; XCTAssertEqual(paths, ["window", "status", "register", "status"])
    }
    @MainActor func testReadFailureWriteFailureAndMismatchedReadbackCannotRegister() async throws {
        for mode in 0..<4 {
            let (server, memory, flow, _) = fixture()
            memory.rejectRead = mode == 0; memory.rejectWrite = mode == 1; memory.wrongScope = mode == 2; memory.changeBinding = mode == 3
            do { try await flow.prepareAndRegister(bearer: "synthetic"); XCTFail("Untrusted custody cannot register") } catch {}
            XCTAssertNil(flow.confirmed)
            let paths = await server.paths; XCTAssertFalse(paths.contains("register")); XCTAssertFalse(paths.contains("status"))
            if mode == 0 { XCTAssertTrue(paths.isEmpty) }
        }
    }
    @MainActor func testUnavailableClearsConfirmationButRetainsOriginalKeyAndDeadline() async throws {
        let (server, memory, flow, _) = fixture(); try await flow.prepareAndRegister(bearer: "synthetic")
        let saved = memory.saved; await server.configure(registered: true, unavailable: true)
        let status = try await flow.recover()
        XCTAssertNil(status); XCTAssertNil(flow.confirmed); XCTAssertNil(flow.status); XCTAssertTrue(flow.resultUnconfirmed)
        XCTAssertEqual(memory.saved, saved); XCTAssertEqual(memory.preparations, 1)
    }
    @MainActor func testExpiredSavedRecordCannotMintReplacementOrExtendWindow() async throws {
        let (server, memory, flow, _) = fixture(); try await flow.prepareAndRegister(bearer: "synthetic")
        let prior = memory.saved!
        memory.saved = .init(accountID: prior.accountID, scope: prior.scope, credentialID: prior.credentialID, expiresAt: Date().addingTimeInterval(-1), token: prior.token)
        let saved = memory.saved, pathsBefore = await server.paths
        do { try await flow.prepareAndRegister(bearer: "synthetic"); XCTFail("Expired record must not rotate") } catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        XCTAssertEqual(memory.saved, saved); XCTAssertEqual(memory.preparations, 1); XCTAssertNil(flow.confirmed)
        let paths = await server.paths; XCTAssertEqual(paths, pathsBefore)
    }
    @MainActor func testLateReadAfterRevisionChangeAndTaskCancellationCannotConfirm() async throws {
        for cancelled in [false, true] {
            let (server, memory, flow, binding) = fixture(); try await flow.prepareAndRegister(bearer: "synthetic")
            let saved = memory.saved; await server.configure(registered: true, hold: true)
            let pending = Task { try await flow.recover() }; await server.wait()
            if cancelled { pending.cancel() } else { flow.bind(.init(accountID: binding.accountID, scope: binding.scope, revision: UUID())) }
            await server.finish()
            do { _ = try await pending.value; XCTFail("Stale/cancelled read must not confirm") }
            catch { if cancelled { XCTAssertTrue(error is CancellationError) } else { XCTAssertEqual(error as? CloudError, .authenticationRequired) } }
            XCTAssertNil(flow.confirmed); XCTAssertTrue(flow.resultUnconfirmed); XCTAssertEqual(memory.saved, saved); XCTAssertFalse(flow.busy)
        }
    }
    @MainActor func testCleanupRequiresFreshCompleteAndRetainsCustodyAfterPartialFailureAndRetry() async throws {
        let (server, memory, flow, binding) = fixture(); try await flow.prepareAndRegister(bearer: "synthetic")
        let original = memory.saved; await server.configure(registered: true, state: "complete")
        var calls = 0
        let partial = try await flow.cleanupLocalData { confirmation, receipt, current in
            XCTAssertEqual(confirmation.binding, binding); XCTAssertEqual(receipt.requestID, binding.scope.requestID)
            XCTAssertEqual(receipt.epochID, binding.scope.epochID); XCTAssertEqual(receipt.state, .complete); XCTAssertTrue(current.isCurrent())
            calls += 1; return .pending
        }
        XCTAssertEqual(partial, .pending); XCTAssertEqual(memory.saved, original)
        let done = try await flow.cleanupLocalData { _, _, current in XCTAssertTrue(current.isCurrent()); calls += 1; return .complete }
        XCTAssertEqual(done, .complete); XCTAssertEqual(calls, 2); XCTAssertEqual(memory.saved, original)
        let paths = await server.paths; XCTAssertEqual(paths, ["window", "status", "register", "status", "status"])
    }
    @MainActor func testCachedCompleteCannotAuthorizeCleanupWhenFreshReadIsUnavailableOrNotComplete() async throws {
        for state in ["pending", "running", "failed", "unavailable"] {
            let (server, memory, flow, _) = fixture(); try await flow.prepareAndRegister(bearer: "synthetic")
            await server.configure(registered: true, state: "complete"); _ = try await flow.recover()
            XCTAssertEqual(flow.status?.state, .complete)
            let saved = memory.saved; await server.configure(registered: true, unavailable: state == "unavailable", state: state)
            let result = try await flow.cleanupLocalData { _, _, _ in XCTFail("Only fresh canonical complete can invoke cleanup"); return .complete }
            XCTAssertEqual(result, .pending); XCTAssertEqual(memory.saved, saved)
            XCTAssertNotEqual(flow.status?.state, .complete)
        }
    }
    @MainActor func testRetainedCleanupAuthorizationExpiresWhenOperationReturns() async throws {
        let (server, _, flow, _) = fixture(); try await flow.prepareAndRegister(bearer: "synthetic")
        await server.configure(registered: true, state: "complete")
        var held: ClosureReadCustodyFlow.CleanupAuthorization?
        _ = try await flow.cleanupLocalData { _, _, current in held = current; XCTAssertTrue(current.isCurrent()); return .complete }
        XCTAssertNotNil(held); XCTAssertFalse(held!.isCurrent())
    }
    @MainActor func testKeyLossWhileFreshCleanupStatusWaitsPreventsEveryEraser() async throws {
        let (server, memory, flow, _) = fixture(); try await flow.prepareAndRegister(bearer: "synthetic")
        await server.configure(registered: true, hold: true, state: "complete")
        let pending = Task { try await flow.cleanupLocalData { _, _, _ in XCTFail("Lost key cannot authorize cleanup"); return .complete } }
        await server.wait(); memory.saved = nil; await server.finish()
        do { _ = try await pending.value; XCTFail("Retained readback required") } catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        XCTAssertNil(flow.confirmed)
    }
    @MainActor func testBindingChangeDuringNotificationCleanupStopsSubsequentFileAndSessionErasers() async throws {
        let (server, memory, flow, binding) = fixture(); try await flow.prepareAndRegister(bearer: "synthetic")
        await server.configure(registered: true, state: "complete"); let saved = memory.saved
        var calls: [String] = []
        do {
            _ = try await flow.cleanupLocalData { _, receipt, current in
                await cleanAccountDeletionLocalData(receipt: receipt, account: binding.accountID, epoch: binding.scope.epochID, revision: binding.revision,
                    stillBound: { current.isCurrent() }, stopNotifications: {
                        calls.append("notifications"); flow.bind(.init(accountID: UUID(), scope: binding.scope, revision: UUID())); return true
                    }, erasePendingRegistration: { calls.append("registration"); return .complete },
                    eraseSnapshot: { calls.append("snapshot") }, erasePendingUpload: { calls.append("upload") },
                    erasePendingRemoval: { calls.append("removal") }, eraseManagedExports: { calls.append("exports") }, clearVisibleData: { calls.append("visible") })
            }
            XCTFail("Old account callback cannot confirm cleanup")
        } catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
        XCTAssertEqual(calls, ["notifications"]); XCTAssertEqual(memory.saved, saved); XCTAssertNil(flow.confirmed)
    }
    @MainActor func testRemovedKeyDuringPositiveReadCannotEnableLocalCleanup() async throws {
        let (server, memory, flow, _) = fixture(); try await flow.prepareAndRegister(bearer: "synthetic")
        await server.configure(registered: true, hold: true)
        let pending = Task { try await flow.recover() }; await server.wait(); memory.saved = nil; await server.finish()
        do { _ = try await pending.value; XCTFail("Positive server status is insufficient without retained custody") } catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        XCTAssertNil(flow.confirmed); XCTAssertTrue(flow.resultUnconfirmed)
    }
}
