import XCTest
@testable import OuchiCore

@MainActor final class DeletionReceiptRecoveryFlowTests: XCTestCase {
    private func binding() -> DeletionReceiptRecoveryFlow.Binding {
        .init(requestID: UUID(), userID: UUID(), inventoryDigest: String(repeating: "a", count: 64),
              revision: UUID(), expiresAt: Date(timeIntervalSince1970: 2000000000))
    }
    private func saved(_ b: DeletionReceiptRecoveryFlow.Binding) -> DeletionReceiptRecoveryFlow.Receipt {
        .init(requestID: b.requestID, userID: b.userID, inventoryDigest: b.inventoryDigest,
              expiresAt: b.expiresAt, token: String(repeating: "A", count: 43))
    }
    func testMissingOrForeignRecordNeverReachesNetwork() async {
        let b = binding()
        for receipt in [nil, saved(binding())] {
            let flow = DeletionReceiptRecoveryFlow(api: .init(transport: { _ in XCTFail("Unexpected HTTP"); throw CloudError.unavailable }), read: { _ in receipt })
            flow.bind(b)
            do { try await flow.recover(); XCTFail("Missing or foreign credential accepted") } catch {}
            XCTAssertNil(flow.state); XCTAssertFalse(flow.busy)
        }
    }
    func testStatusUsesOnlyExactSavedTokenWithoutLoginOrMutation() async throws {
        let b = binding(), stored = saved(binding())
        let own = DeletionReceiptRecoveryFlow.Receipt(requestID: b.requestID, userID: b.userID,
            inventoryDigest: b.inventoryDigest, expiresAt: b.expiresAt, token: stored.token)
        let flow = DeletionReceiptRecoveryFlow(api: .init(transport: { request in
            XCTAssertEqual(request.httpMethod, "GET"); XCTAssertNil(request.httpBody)
            XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Deletion-Receipt"), own.token)
            XCTAssertTrue(request.url!.path.contains(b.requestID.uuidString.lowercased()))
            return (Data("{\"state\":\"complete\",\"notification\":\"unconfirmed\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }), read: { _ in own })
        flow.bind(b); let state = try await flow.recover()
        XCTAssertEqual(state, .complete); XCTAssertEqual(flow.state, .complete); XCTAssertFalse(flow.busy)
        flow.bind(nil); XCTAssertNil(flow.state)
    }
    func testExpiredBindingNeverReadsVaultOrNetwork() async {
        let b = binding()
        let flow = DeletionReceiptRecoveryFlow(api: .init(transport: { _ in XCTFail("Unexpected HTTP"); throw CloudError.unavailable }),
            now: { b.expiresAt }, read: { _ in XCTFail("Expired vault read"); return nil })
        flow.bind(b)
        do { try await flow.recover(); XCTFail("Expired recovery accepted") } catch {}
        XCTAssertNil(flow.state)
    }
    func testBindingChangeDiscardsLateCompletion() async {
        actor Server {
            var waiting = false
            var continuation: CheckedContinuation<Void, Never>?
            func receive(_ request: URLRequest) async -> (Data, HTTPURLResponse) {
                await withCheckedContinuation { continuation = $0; waiting = true }
                return (Data("{\"state\":\"complete\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            func resume() { continuation?.resume(); continuation = nil }
        }
        let server = Server(), b = binding(), receipt = saved(binding())
        let flow = DeletionReceiptRecoveryFlow(api: .init(transport: { await server.receive($0) }), read: { b in
            .init(requestID: b.requestID, userID: b.userID, inventoryDigest: b.inventoryDigest, expiresAt: b.expiresAt, token: receipt.token)
        })
        flow.bind(b); let task = Task { try await flow.recover() }
        while !(await server.waiting) { await Task.yield() }
        flow.bind(binding()); await server.resume()
        do { try await task.value; XCTFail("Late foreign completion accepted") } catch {}
        XCTAssertNil(flow.state); XCTAssertFalse(flow.busy)
    }
    func testCancellationDiscardsTransportReply() async {
        let b = binding(), own = saved(binding())
        let flow = DeletionReceiptRecoveryFlow(api: .init(transport: { request in
            withUnsafeCurrentTask { $0?.cancel() }
            return (Data("{\"state\":\"complete\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }), read: { b in
            .init(requestID: b.requestID, userID: b.userID, inventoryDigest: b.inventoryDigest, expiresAt: b.expiresAt, token: own.token)
        })
        flow.bind(b); let task = Task { try await flow.recover() }
        do { try await task.value; XCTFail("Cancelled response accepted") } catch {}
        XCTAssertNil(flow.state); XCTAssertFalse(flow.busy)
    }
    func testExpiryDuringTransportDiscardsCompletion() async {
        @MainActor final class Clock { var now = Date(timeIntervalSince1970: 1900000000) }
        let clock = Clock(), b = binding(), own = saved(binding())
        let flow = DeletionReceiptRecoveryFlow(api: .init(transport: { request in
            await MainActor.run { clock.now = b.expiresAt }
            return (Data("{\"state\":\"complete\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }), now: { clock.now }, read: { b in
            .init(requestID: b.requestID, userID: b.userID, inventoryDigest: b.inventoryDigest, expiresAt: b.expiresAt, token: own.token)
        })
        flow.bind(b)
        do { try await flow.recover(); XCTFail("Expired reply accepted") } catch {}
        XCTAssertNil(flow.state); XCTAssertFalse(flow.busy)
    }

}
