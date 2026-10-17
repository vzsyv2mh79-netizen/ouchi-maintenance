import Foundation
import XCTest
@testable import OuchiCore

private let handoffRequest = UUID(uuidString: "66666666-6666-4666-8666-666666666666")!
private let handoffHome = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
private let handoffEpoch = UUID(uuidString: "99999999-9999-4999-8999-999999999999")!
private let handoffOwner = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
private let handoffRecipient = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
private func handoffBody(_ state: String = "pending", expiry: String = "2099-01-01T00:00:00Z") -> Data {
    Data("{\"requestID\":\"\(handoffRequest.uuidString.lowercased())\",\"homeID\":\"\(handoffHome.uuidString.lowercased())\",\"state\":\"\(state)\",\"expiresAt\":\"\(expiry)\"}".utf8)
}
private actor HandoffScript {
    var requests: [URLRequest] = []
    let failAt: Int?
    let finalState: String
    init(failAt: Int? = nil, finalState: String = "completed") { self.failAt = failAt; self.finalState = finalState }
    func reply(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        if requests.count == failAt { throw URLError(.networkConnectionLost) }
        let state = requests.count > 2 ? finalState : "pending"
        return (handoffBody(state), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
    }
}
private actor DelayedHandoffReply {
    private var arrived = false
    private var arrival: CheckedContinuation<Void, Never>?
    private var release: CheckedContinuation<Void, Never>?
    func waitForArrival() async {
        if arrived { return }
        await withCheckedContinuation { arrival = $0 }
    }
    func reply(_ request: URLRequest) async -> (Data, HTTPURLResponse) {
        await withCheckedContinuation { continuation in
            release = continuation; arrived = true; arrival?.resume(); arrival = nil
        }
        return (handoffBody("completed"), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
    }
    func finish() { release?.resume(); release = nil }
}

final class HomeHandoffTests: XCTestCase {
    func testCompletedResultRequiresPrivateJSONAndConsistentBoundedLength() async throws {
        let bytes = handoffBody("completed")
        let cases: [[String: String]] = [
            [:],
            ["Content-Type": "text/html", "Cache-Control": "no-store"],
            ["Content-Type": "application/json", "Cache-Control": "public, max-age=3600"],
            ["Content-Type": "application/json", "Cache-Control": "no-store", "Content-Length": "5000"],
            ["Content-Type": "application/json", "Cache-Control": "no-store", "Content-Length": "-1"],
            ["Content-Type": "application/json", "Cache-Control": "no-store", "Content-Length": "unknown"],
            ["Content-Type": "application/json", "Cache-Control": "no-store", "Content-Length": String(bytes.count - 1)]
        ]
        for headers in cases {
            let api = HomeHandoffAPI(transport: { request in
                (bytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: headers)!)
            })
            do { _ = try await api.read(requestID: handoffRequest, homeID: handoffHome, epochID: handoffEpoch, token: "synthetic"); XCTFail("Unconfirmed private result must not report completed") }
            catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
        }
    }

    @MainActor func testInvalidRecipientDoesNotPersistOrPoisonTheValidRequest() async throws {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        for invalidRecipient in [zero, handoffOwner] {
            let script = HandoffScript()
            var writes = 0
            let flow = HomeHandoffFlow(api: HomeHandoffAPI(transport: { try await script.reply($0) }), persist: { binding, recipient in
                writes += 1
                // Match the real vault's rejection of invalid recipient IDs.
                if recipient == zero || recipient == binding.accountID { throw CloudError.invalidInput }
                return .init(binding: binding, recipientID: recipient, createdAt: Date())
            })
            flow.bind(HomeHandoffBinding(accountID: handoffOwner, epochID: handoffEpoch, homeID: handoffHome, requestID: handoffRequest))
            do { _ = try await flow.request(recipientID: invalidRecipient, token: "synthetic"); XCTFail("Invalid recipient must be rejected") }
            catch { XCTAssertEqual(error as? CloudError, .invalidInput) }
            XCTAssertEqual(writes, 0, "Invalid input must not touch the intent vault")
            let before = await script.requests; XCTAssertTrue(before.isEmpty); XCTAssertFalse(flow.busy)
            let requested = try await flow.request(recipientID: handoffRecipient, token: "synthetic")
            XCTAssertEqual(requested.state, .pending); XCTAssertEqual(writes, 1)
            let after = await script.requests; XCTAssertEqual(after.map(\.httpMethod), ["POST"])
        }
    }

    @MainActor func testPersistenceFailureOrForeignReadbackPreventsNetworkMutation() async throws {
        for wrongScope in [false,true] {
            let script = HandoffScript()
            let flow = HomeHandoffFlow(api: HomeHandoffAPI(transport: { try await script.reply($0) }), persist: { binding, recipient in
                if !wrongScope { throw CloudError.unavailable }
                return .init(binding: .init(accountID: UUID(), epochID: binding.epochID, homeID: binding.homeID, requestID: binding.requestID), recipientID: recipient, createdAt: Date())
            })
            flow.bind(HomeHandoffBinding(accountID: handoffOwner, epochID: handoffEpoch, homeID: handoffHome, requestID: handoffRequest))
            do { _ = try await flow.request(recipientID: handoffRecipient, token: "synthetic"); XCTFail("Must fail before POST") }
            catch { XCTAssertEqual(error as? CloudError, wrongScope ? .invalidInput : .unavailable) }
            let requests = await script.requests; XCTAssertTrue(requests.isEmpty); XCTAssertFalse(flow.busy)
        }
        let script = HandoffScript()
        let flow = HomeHandoffFlow(api: HomeHandoffAPI(transport: { try await script.reply($0) }))
        flow.bind(HomeHandoffBinding(accountID: handoffRecipient, epochID: handoffEpoch, homeID: handoffHome, requestID: handoffRequest))
        do { _ = try await flow.decide(accept: true, token: "synthetic"); XCTFail("No default persistence") }
        catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        let reads = await script.requests; XCTAssertEqual(reads.map(\.httpMethod), ["GET"])
    }
    func testScopedTransportAndStrictResponse() async throws {
        let api = HomeHandoffAPI(transport: { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/api/family/handoff/" + handoffRequest.uuidString.lowercased())
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Ouchi-App-Epoch"), handoffEpoch.uuidString.lowercased())
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer synthetic")
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
            XCTAssertEqual(body, ["homeID": handoffHome.uuidString.lowercased(), "recipientID": handoffRecipient.uuidString.lowercased()])
            return (handoffBody(), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
        })
        let result = try await api.create(requestID: handoffRequest, homeID: handoffHome, recipientID: handoffRecipient, epochID: handoffEpoch, token: "synthetic")
        XCTAssertEqual(result.state, .pending)
        for mode in 0..<4 {
            let bad = HomeHandoffAPI(transport: { request in
                let data = mode == 0 ? Data(repeating: 65, count: 4097) : mode == 1 ? handoffBody("invented") : mode == 2 ? handoffBody().replacingUUID() : handoffBody()
                let url = mode == 3 ? URL(string: "https://example.invalid/redirect")! : request.url!
                return (data, HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
            })
            do { _ = try await bad.read(requestID: handoffRequest, homeID: handoffHome, epochID: handoffEpoch, token: "synthetic"); XCTFail("Must reject foreign/malformed response") }
            catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
        }
    }
    @MainActor func testLostDecisionAcknowledgementRecoversByReadWithoutRepeatedMutation() async throws {
        let script = HandoffScript(failAt: 2)
        let flow = HomeHandoffFlow(api: HomeHandoffAPI(transport: { try await script.reply($0) }), persist: { .init(binding: $0, recipientID: $1, createdAt: Date()) })
        flow.bind(HomeHandoffBinding(accountID: handoffRecipient, epochID: handoffEpoch, homeID: handoffHome, requestID: handoffRequest))
        do { _ = try await flow.decide(accept: true, token: "synthetic"); XCTFail("Expected lost acknowledgement") } catch { XCTAssertTrue(error is URLError) }
        XCTAssertEqual(flow.status?.state, .pending); XCTAssertFalse(flow.busy)
        let recovered = try await flow.recover(token: "synthetic"); XCTAssertEqual(recovered.state, .completed)
        let requests = await script.requests
        XCTAssertEqual(requests.map(\.httpMethod), ["GET", "PUT", "GET"])
        XCTAssertEqual(Set(requests.map { $0.url!.absoluteString }).count, 1)
    }
    @MainActor func testFailedReadNeverSubmitsDecisionAndAmbiguousCreateKeepsOriginalRecipient() async throws {
        let script = HandoffScript(failAt: 1)
        let flow = HomeHandoffFlow(api: HomeHandoffAPI(transport: { try await script.reply($0) }), persist: { .init(binding: $0, recipientID: $1, createdAt: Date()) })
        flow.bind(HomeHandoffBinding(accountID: handoffOwner, epochID: handoffEpoch, homeID: handoffHome, requestID: handoffRequest))
        do { _ = try await flow.decide(accept: false, token: "synthetic"); XCTFail("Expected outage") } catch { XCTAssertTrue(error is URLError) }
        let onlyRead = await script.requests; XCTAssertEqual(onlyRead.map(\.httpMethod), ["GET"])
        let createScript = HandoffScript(failAt: 1)
        let creating = HomeHandoffFlow(api: HomeHandoffAPI(transport: { try await createScript.reply($0) }), persist: { .init(binding: $0, recipientID: $1, createdAt: Date()) })
        creating.bind(HomeHandoffBinding(accountID: handoffOwner, epochID: handoffEpoch, homeID: handoffHome, requestID: handoffRequest))
        do { _ = try await creating.request(recipientID: handoffRecipient, token: "synthetic"); XCTFail("Expected outage") } catch { XCTAssertTrue(error is URLError) }
        creating.bind(HomeHandoffBinding(accountID: handoffOwner, epochID: handoffEpoch, homeID: handoffHome, requestID: handoffRequest), revision: UUID())
        do { _ = try await creating.request(recipientID: UUID(), token: "synthetic"); XCTFail("Must retain recipient") } catch { XCTAssertEqual(error as? CloudError, .invalidInput) }
        _ = try await creating.request(recipientID: handoffRecipient, token: "synthetic")
        let retries = await createScript.requests
        XCTAssertEqual(retries.count, 2); XCTAssertEqual(retries[0].httpBody, retries[1].httpBody); XCTAssertEqual(retries[0].url, retries[1].url)
    }
    @MainActor func testExpiredAcceptanceDoesNotWrite() async throws {
        let script = HandoffScript()
        let flow = HomeHandoffFlow(api: HomeHandoffAPI(transport: { try await script.reply($0) }), persist: { .init(binding: $0, recipientID: $1, createdAt: Date()) })
        flow.bind(HomeHandoffBinding(accountID: handoffRecipient, epochID: handoffEpoch, homeID: handoffHome, requestID: handoffRequest))
        do { _ = try await flow.decide(accept: true, token: "synthetic", now: { Date(timeIntervalSince1970: 4_102_444_800) }); XCTFail("Expired") }
        catch { XCTAssertEqual(error as? CloudError, .invalidInput) }
        let requests = await script.requests; XCTAssertEqual(requests.map(\.httpMethod), ["GET"])
    }
    @MainActor func testLateResponseAfterAccountOrSessionBindingChangeIsDiscarded() async throws {
        let delayed = DelayedHandoffReply()
        let flow = HomeHandoffFlow(api: HomeHandoffAPI(transport: { await delayed.reply($0) }))
        flow.bind(HomeHandoffBinding(accountID: handoffRecipient, epochID: handoffEpoch, homeID: handoffHome, requestID: handoffRequest))
        let pending = Task { try await flow.recover(token: "synthetic") }
        await delayed.waitForArrival()
        flow.bind(HomeHandoffBinding(accountID: handoffOwner, epochID: handoffEpoch, homeID: handoffHome, requestID: handoffRequest), revision: UUID())
        await delayed.finish()
        do { _ = try await pending.value; XCTFail("Discard old account/session result") }
        catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
        XCTAssertNil(flow.status); XCTAssertFalse(flow.busy)
    }
}
private extension Data {
    func replacingUUID() -> Data { Data(String(decoding: self, as: UTF8.self).replacingOccurrences(of: handoffHome.uuidString.lowercased(), with: handoffOwner.uuidString.lowercased()).utf8) }
}
