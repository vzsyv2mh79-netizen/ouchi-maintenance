import XCTest
@testable import OuchiCore

@MainActor final class DeletionReceiptRegistrationFlowTests: XCTestCase {
    private func binding() -> DeletionReceiptRegistrationFlow.Binding {
        .init(requestID: UUID(), userID: UUID(), inventoryDigest: String(repeating: "a", count: 64),
              revision: UUID(), expiresAt: Date(timeIntervalSince1970: 2000000000))
    }
    func testPersistenceFailurePreventsNetworkAndReadiness() async {
        let api = DeletionReceiptAPI(transport: { _ in XCTFail("Network before persistence"); throw CloudError.unavailable })
        let flow = DeletionReceiptRegistrationFlow(api: api, persist: { _ in throw CloudError.unavailable })
        flow.bind(binding())
        do { try await flow.register(bearer: "synthetic"); XCTFail("Persistence failure ignored") } catch {}
        XCTAssertNil(flow.registered); XCTAssertFalse(flow.busy)
    }
    func testCustodyForAnotherAccountPreventsNetwork() async {
        let api = DeletionReceiptAPI(transport: { _ in XCTFail("Mismatched custody reached network"); throw CloudError.unavailable })
        let flow = DeletionReceiptRegistrationFlow(api: api, persist: { b in
            .init(requestID: b.requestID, userID: UUID(), inventoryDigest: b.inventoryDigest,
                  expiresAt: b.expiresAt, token: String(repeating: "A", count: 43))
        })
        flow.bind(binding())
        do { try await flow.register(bearer: nil); XCTFail("Wrong account accepted") } catch {}
        XCTAssertNil(flow.registered)
    }
    func testLostReplyRetriesPersistedCredentialWithoutExtendingDeadline() async throws {
        actor Server {
            var first: URLRequest?
            func receive(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
                if first == nil { first = request; throw CloudError.unavailable }
                XCTAssertEqual(first?.httpBody, request.httpBody)
                XCTAssertEqual(first?.value(forHTTPHeaderField: "X-Deletion-Receipt"), request.value(forHTTPHeaderField: "X-Deletion-Receipt"))
                let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
                return (try JSONSerialization.data(withJSONObject: ["registered": true, "expiresAt": body["expiresAt"]!] as [String: Any]),
                        HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
        }
        let server = Server(), b = binding()
        let durable = DeletionReceiptRegistrationFlow.PersistedReceipt(requestID: b.requestID, userID: b.userID,
            inventoryDigest: b.inventoryDigest, expiresAt: b.expiresAt, token: String(repeating: "A", count: 43))
        let flow = DeletionReceiptRegistrationFlow(api: .init(transport: { try await server.receive($0) }), persist: { _ in durable })
        flow.bind(b)
        do { try await flow.register(bearer: "synthetic"); XCTFail("Lost response accepted") } catch {}
        XCTAssertNil(flow.registered); XCTAssertFalse(flow.busy)
        try await flow.register(bearer: "synthetic")
        XCTAssertEqual(flow.registered, b)
        flow.bind(nil)
        XCTAssertNil(flow.registered)
    }
    func testAccountSwitchWhileRegistrationInFlightDiscardsAcknowledgement() async throws {
        actor Server {
            var continuation: CheckedContinuation<Void, Never>?
            var waiting = false
            func receive(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
                await withCheckedContinuation { continuation = $0; waiting = true }
                let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
                return (try JSONSerialization.data(withJSONObject: ["registered": true, "expiresAt": body["expiresAt"]!] as [String: Any]),
                        HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            func resume() { continuation?.resume(); continuation = nil }
        }
        let server = Server(), b = binding()
        let flow = DeletionReceiptRegistrationFlow(api: .init(transport: { try await server.receive($0) }), persist: { b in
            .init(requestID: b.requestID, userID: b.userID, inventoryDigest: b.inventoryDigest, expiresAt: b.expiresAt, token: String(repeating: "A", count: 43))
        })
        flow.bind(b)
        let operation = Task { try await flow.register(bearer: "synthetic") }
        while !(await server.waiting) { await Task.yield() }
        flow.bind(binding())
        await server.resume()
        do { try await operation.value; XCTFail("Old account response accepted") } catch {}
        XCTAssertNil(flow.registered); XCTAssertFalse(flow.busy)
    }
}
