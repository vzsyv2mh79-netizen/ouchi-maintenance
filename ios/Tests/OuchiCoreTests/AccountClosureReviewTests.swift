import Foundation
import XCTest
@testable import OuchiCore

private let reviewAccount = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
private let reviewEpoch = UUID(uuidString: "99999999-9999-4999-8999-999999999999")!
private let reviewSubmission = UUID(uuidString: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!
private let reviewID = UUID(uuidString: "cccccccc-cccc-4ccc-8ccc-cccccccccccc")!
private func reviewData(_ request: URLRequest, state: String = "review_required", extra: [String: String] = [:]) throws -> Data {
    let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
    var result = ["kind": "app-closure-review/v2", "state": state, "epochID": body["expectedEpochID"]!, "submissionID": body["submissionID"]!]
    if state != "review_not_found" { result["reviewRequestID"] = reviewID.uuidString.lowercased() }
    for (key, value) in extra { result[key] = value }
    return try JSONEncoder().encode(result)
}
private actor ReviewScript {
    var requests: [URLRequest] = []
    let loseFirst: Bool
    init(loseFirst: Bool = false) { self.loseFirst = loseFirst }
    func reply(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        if loseFirst && requests.count == 1 { throw URLError(.networkConnectionLost) }
        let cancel = request.url!.path.hasSuffix("/cancel")
        let status = request.url!.path.hasSuffix("/request") ? 202 : 200
        return (try reviewData(request, state: cancel || requests.contains(where: { $0.url!.path.hasSuffix("/cancel") }) ? "cancelled" : "review_required"), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}
@MainActor private final class ReviewFlowHolder { weak var flow: AccountClosureReviewFlow? }
private actor ReviewGate {
    var arrived = false
    var arrival: CheckedContinuation<Void, Never>?
    var release: CheckedContinuation<Void, Never>?
    func wait() async { if arrived { return }; await withCheckedContinuation { arrival = $0 } }
    func reply(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        await withCheckedContinuation { release = $0; arrived = true; arrival?.resume(); arrival = nil }
        return (try reviewData(request), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
    func finish() { release?.resume(); release = nil }
}
final class AccountClosureReviewTests: XCTestCase {
    @MainActor func testSelectingAnotherSavedReferenceInvalidatesLateReply() async throws {
        let gate = ReviewGate()
        let flow = AccountClosureReviewFlow(api: .init(transport: { try await gate.reply($0) }))
        let revision = UUID()
        flow.bind(accountID: reviewAccount, epochID: reviewEpoch, revision: revision, restored: .init(accountID: reviewAccount, epochID: reviewEpoch, submissionID: reviewSubmission))
        let pending = Task { try await flow.recover(token: "synthetic") }
        await gate.wait()
        let selected = AccountClosureReviewBinding(accountID: reviewAccount, epochID: reviewEpoch, submissionID: UUID())
        flow.bind(accountID: reviewAccount, epochID: reviewEpoch, revision: revision, restored: selected)
        await gate.finish()
        do { _ = try await pending.value; XCTFail("Old reference result accepted") } catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
        XCTAssertEqual(flow.binding, selected); XCTAssertNil(flow.receipt); XCTAssertTrue(flow.resultUnconfirmed)
    }
    func testStrictTransportAndCancellationReceipt() async throws {
        let api = AccountClosureReviewAPI(transport: { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url!.path, "/api/account/closure-review/cancel")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer synthetic")
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
            XCTAssertEqual(body, ["confirmation": "CANCEL_OUCHI_DELETION_REVIEW", "expectedEpochID": reviewEpoch.uuidString.lowercased(), "submissionID": reviewSubmission.uuidString.lowercased()])
            return (try reviewData(request, state: "cancelled"), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let receipt = try await api.cancel(token: "synthetic", epochID: reviewEpoch, submissionID: reviewSubmission)
        XCTAssertEqual(receipt?.state, .cancelled); XCTAssertEqual(receipt?.reviewRequestID, reviewID)
    }
    func testForeignLegacyCompletedRedirectAndOversizedResponsesRejected() async throws {
        for mode in 0..<6 {
            let api = AccountClosureReviewAPI(transport: { request in
                let extras = mode == 0 ? ["kind": "app-closure-review/v1"] : mode == 1 ? ["submissionID": reviewEpoch.uuidString.lowercased()] : mode == 2 ? ["requestID": reviewSubmission.uuidString.lowercased()] : [:]
                let data = mode == 4 ? Data(repeating: 65, count: 4097) : try reviewData(request, state: mode == 3 ? "complete" : "review_required", extra: extras)
                return (data, HTTPURLResponse(url: mode == 5 ? URL(string: "https://example.invalid")! : request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            })
            do { _ = try await api.read(token: "synthetic", epochID: reviewEpoch, submissionID: reviewSubmission); XCTFail("Reject unverified response") }
            catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
        }
    }
    func testMissingReviewRequiresExactScoped404() async throws {
        let api = AccountClosureReviewAPI(transport: { request in (try reviewData(request, state: "review_not_found"), HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!) })
        let value = try await api.read(token: "synthetic", epochID: reviewEpoch, submissionID: reviewSubmission); XCTAssertNil(value)
    }
    @MainActor func testPersistenceFailureAndReentrantBindingChangePreventSubmission() async throws {
        let script = ReviewScript()
        let failed = AccountClosureReviewFlow(api: .init(transport: { try await script.reply($0) }))
        failed.bind(accountID: reviewAccount, epochID: reviewEpoch, revision: UUID())
        do { _ = try await failed.startNew(password: "synthetic", token: "synthetic"); XCTFail("Require durable save") }
        catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        let holder = ReviewFlowHolder()
        let flow = AccountClosureReviewFlow(api: .init(transport: { try await script.reply($0) }), persist: { value in holder.flow?.bind(accountID: UUID(), epochID: reviewEpoch, revision: UUID()); return value })
        holder.flow = flow
        flow.bind(accountID: reviewAccount, epochID: reviewEpoch, revision: UUID())
        do { _ = try await flow.startNew(password: "synthetic", token: "synthetic"); XCTFail("Reject changed binding") }
        catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
        let calls = await script.requests; XCTAssertTrue(calls.isEmpty)
    }
    @MainActor func testLostAcknowledgementRestoresSameSubmissionAndRequiresCancellationBeforeNewRequest() async throws {
        let script = ReviewScript(loseFirst: true)
        var saved: AccountClosureReviewBinding?
        let flow = AccountClosureReviewFlow(api: .init(transport: { try await script.reply($0) }), persist: { saved = $0; return $0 })
        flow.bind(accountID: reviewAccount, epochID: reviewEpoch, revision: UUID())
        do { _ = try await flow.startNew(password: "synthetic", token: "synthetic"); XCTFail("Lost reply") } catch { XCTAssertTrue(error is URLError) }
        XCTAssertTrue(flow.resultUnconfirmed); XCTAssertNotNil(saved)
        do { _ = try await flow.startNew(password: "synthetic", token: "synthetic"); XCTFail("Do not renew unknown request") } catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        let restored = AccountClosureReviewFlow(api: .init(transport: { try await script.reply($0) }), persist: { $0 })
        restored.bind(accountID: reviewAccount, epochID: reviewEpoch, revision: UUID(), restored: saved)
        let current = try await restored.recover(token: "synthetic"); XCTAssertEqual(current?.submissionID, saved?.submissionID); XCTAssertFalse(restored.resultUnconfirmed)
        do { _ = try await restored.startNew(password: "synthetic", token: "synthetic"); XCTFail("Pending must not renew") } catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        let cancelled = try await restored.cancel(token: "synthetic"); XCTAssertEqual(cancelled?.state, .cancelled)
        _ = try await restored.startNew(password: "synthetic", token: "synthetic")
        XCTAssertNotEqual(restored.binding?.submissionID, saved?.submissionID)
        let requests = await script.requests
        let bodies = try requests.map { try JSONSerialization.jsonObject(with: $0.httpBody!) as! [String: String] }
        XCTAssertEqual(bodies[0]["submissionID"], bodies[1]["submissionID"]); XCTAssertEqual(bodies[1]["submissionID"], bodies[2]["submissionID"])
        XCTAssertNotEqual(bodies[2]["submissionID"], bodies[3]["submissionID"])
        XCTAssertNil(bodies[1]["password"]); XCTAssertNil(bodies[2]["password"])
    }
    @MainActor func testLateReadAfterSessionRevisionChangeIsDiscarded() async throws {
        let gate = ReviewGate()
        let flow = AccountClosureReviewFlow(api: .init(transport: { try await gate.reply($0) }))
        let restored = AccountClosureReviewBinding(accountID: reviewAccount, epochID: reviewEpoch, submissionID: reviewSubmission)
        flow.bind(accountID: reviewAccount, epochID: reviewEpoch, revision: UUID(), restored: restored)
        let pending = Task { try await flow.recover(token: "synthetic") }
        await gate.wait()
        flow.bind(accountID: reviewAccount, epochID: reviewEpoch, revision: UUID())
        await gate.finish()
        do { _ = try await pending.value; XCTFail("Discard late result") } catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
        XCTAssertNil(flow.receipt); XCTAssertTrue(flow.resultUnconfirmed); XCTAssertFalse(flow.busy); XCTAssertEqual(flow.binding, restored)
    }
}
