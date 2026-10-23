import Foundation
import XCTest
@testable import OuchiCore

private let managementAccount = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
private let managementHome = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
private let managementEpoch = UUID(uuidString: "99999999-9999-4999-8999-999999999999")!
private let managementGeneration = UUID(uuidString: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!
private let managementRequest = UUID(uuidString: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")!
private let managementIntent = HomeManagementIntent(accountID: managementAccount, epochID: managementEpoch, homeID: managementHome, generation: managementGeneration, requestID: managementRequest)
private func managementStatusData(_ patch: [String: Any] = [:]) throws -> Data {
    var value: [String: Any] = ["kind": "ownerless-home-status/v1", "homeID": managementHome.uuidString.lowercased(), "epochID": managementEpoch.uuidString.lowercased(), "state": "awaiting_management", "generation": managementGeneration.uuidString.lowercased(), "canClaim": true]
    value.merge(patch) { _, next in next }; return try JSONSerialization.data(withJSONObject: value)
}
private func managementClaimData(request: String, generation: String, state: String = "claimed") throws -> Data {
    try JSONSerialization.data(withJSONObject: ["kind": "ownerless-home-claim/v1", "homeID": managementHome.uuidString.lowercased(), "epochID": managementEpoch.uuidString.lowercased(), "generation": generation, "requestID": request, "state": state])
}
private actor ManagementScript {
    var requests: [URLRequest] = []
    let loseFirstPost: Bool
    let committedOnLoss: Bool
    var postCount = 0
    var didCommit = false
    init(loseFirstPost: Bool = false, committedOnLoss: Bool = true) { self.loseFirstPost = loseFirstPost; self.committedOnLoss = committedOnLoss }
    func reply(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let data: Data
        if request.httpMethod == "POST" {
            postCount += 1
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
            if loseFirstPost && postCount == 1 { didCommit = committedOnLoss; throw URLError(.networkConnectionLost) }
            didCommit = true
            data = try managementClaimData(request: body["requestID"]!, generation: body["generation"]!)
        } else if let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems, !query.isEmpty {
            data = try managementClaimData(request: query.first(where: { $0.name == "requestID" })!.value!, generation: query.first(where: { $0.name == "generation" })!.value!, state: didCommit ? "claimed" : "not_recorded")
        } else { data = try managementStatusData() }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
    }
}
private actor DelayedManagementRead {
    private var arrived = false
    private var arrival: CheckedContinuation<Void, Never>?
    private var release: CheckedContinuation<Void, Never>?
    func waitForArrival() async { if !arrived { await withCheckedContinuation { arrival = $0 } } }
    func reply(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        await withCheckedContinuation { release = $0; arrived = true; arrival?.resume(); arrival = nil }
        let bytes = try managementClaimData(request: managementRequest.uuidString, generation: managementGeneration.uuidString)
        return (bytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
    }
    func finish() { release?.resume(); release = nil }
}
final class HomeManagementTests: XCTestCase {
    @MainActor func testLateReceiptFromPreviousAccountCannotChangeCurrentScreen() async throws {
        let server = DelayedManagementRead()
        let flow = HomeManagementFlow(api: HomeManagementAPI(transport: { try await server.reply($0) }))
        flow.bind(accountID: managementAccount, epochID: managementEpoch, homeID: managementHome, revision: UUID(), restored: managementIntent)
        let task = Task { try await flow.recover(token: "synthetic") }
        await server.waitForArrival()
        flow.bind(accountID: UUID(), epochID: UUID(), homeID: UUID(), revision: UUID())
        await server.finish()
        do { _ = try await task.value; XCTFail("Old account response must be ignored") } catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
        XCTAssertNil(flow.receipt); XCTAssertNil(flow.intent); XCTAssertNil(flow.status); XCTAssertFalse(flow.busy)
    }
    func testClaimTransportUsesOnlyServerScopedIntentAndExactResponse() async throws {
        let api = HomeManagementAPI(transport: { request in
            XCTAssertEqual(request.httpMethod, "POST"); XCTAssertEqual(request.url?.path, "/api/family/management/" + managementHome.uuidString.lowercased())
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Ouchi-App-Epoch"), managementEpoch.uuidString.lowercased())
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
            XCTAssertEqual(body, ["requestID": managementRequest.uuidString.lowercased(), "generation": managementGeneration.uuidString.lowercased(), "confirmation": "CLAIM_HOME_MANAGEMENT"])
            let bytes = try managementClaimData(request: body["requestID"]!, generation: body["generation"]!)
            return (bytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
        })
        let result = try await api.claim(managementIntent, token: "synthetic"); XCTAssertEqual(result.state, .claimed)
    }
    func testStatusRejectsNumericBooleanMismatchedScopeAndImpossibleManagedClaim() async throws {
        for patch: [String: Any] in [["canClaim": 1], ["homeID": managementAccount.uuidString], ["state": "managed", "generation": NSNull(), "canClaim": true], ["generation": NSNull()], ["extra": "untrusted"]] {
            let bytes = try managementStatusData(patch)
            let api = HomeManagementAPI(transport: { request in (bytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!) })
            do { _ = try await api.status(homeID: managementHome, epochID: managementEpoch, token: "synthetic"); XCTFail("Malformed status must fail") } catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
        }
    }
    func testCacheableRedirectedAndAbsentMutationResultsAreNotSuccess() async throws {
        let good = try managementClaimData(request: managementRequest.uuidString, generation: managementGeneration.uuidString)
        for mode in 0..<4 {
            let bytes = mode == 3 ? try managementClaimData(request: managementRequest.uuidString, generation: managementGeneration.uuidString, state: "not_recorded") : good
            let api = HomeManagementAPI(transport: { request in
                let url = mode == 0 ? URL(string: "https://example.invalid/redirect")! : request.url!
                let fields = ["Content-Type": mode == 1 ? "text/html" : "application/json", "Cache-Control": mode == 2 ? "public" : "no-store"]
                return (bytes, HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: fields)!)
            })
            do { _ = try await api.claim(managementIntent, token: "synthetic"); XCTFail("Unconfirmed result must fail") } catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
        }
    }
    @MainActor func testLostCommittedResponseRecoversOnlyByGetAndRetainsDurableRequest() async throws {
        let script = ManagementScript(loseFirstPost: true); var saved: HomeManagementIntent?
        let flow = HomeManagementFlow(api: HomeManagementAPI(transport: { try await script.reply($0) }), persist: { saved = $0; return $0 })
        flow.bind(accountID: managementAccount, epochID: managementEpoch, homeID: managementHome, revision: UUID())
        _ = try await flow.load(token: "synthetic")
        do { _ = try await flow.start(token: "synthetic"); XCTFail("Expected lost acknowledgement") } catch { XCTAssertTrue(error is URLError) }
        XCTAssertNotNil(saved); XCTAssertEqual(flow.intent, saved); XCTAssertTrue(flow.resultUnconfirmed)
        do { try flow.forgetConfirmedReference(remove: { _ in XCTFail("Unknown reference must remain") }); XCTFail("Unknown reference removed") } catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        do { _ = try await flow.retry(token: "synthetic"); XCTFail("Unknown outcome must recover first") } catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        let recovered = try await flow.recover(token: "synthetic"); XCTAssertEqual(recovered.state, .claimed)
        let requests = await script.requests; XCTAssertEqual(requests.map(\.httpMethod), ["GET", "GET", "POST", "GET"])
        let query = URLComponents(url: requests.last!.url!, resolvingAgainstBaseURL: false)!.queryItems!
        XCTAssertEqual(query.first(where: { $0.name == "requestID" })?.value, saved!.requestID.uuidString.lowercased())
        var removed: HomeManagementIntent?
        try flow.forgetConfirmedReference(remove: { removed = $0 })
        XCTAssertEqual(removed, saved); XCTAssertNil(flow.intent); XCTAssertNil(flow.receipt); XCTAssertNil(flow.status)
        let after = await script.requests; XCTAssertEqual(after.count, requests.count, "Local reference cleanup makes no server mutation")
    }
    @MainActor func testAbsentRecoveryRequiresExplicitRetryWithSameBody() async throws {
        let script = ManagementScript(loseFirstPost: true, committedOnLoss: false)
        let flow = HomeManagementFlow(api: HomeManagementAPI(transport: { try await script.reply($0) }), persist: { $0 })
        flow.bind(accountID: managementAccount, epochID: managementEpoch, homeID: managementHome, revision: UUID())
        _ = try await flow.load(token: "synthetic")
        do { _ = try await flow.start(token: "synthetic"); XCTFail("Expected lost acknowledgement") } catch {}
        let absent = try await flow.recover(token: "synthetic"); XCTAssertEqual(absent.state, .notRecorded)
        let before = await script.requests; XCTAssertEqual(before.filter({ $0.httpMethod == "POST" }).count, 1)
        _ = try await flow.retry(token: "synthetic")
        let after = await script.requests; let posts = after.filter { $0.httpMethod == "POST" }
        XCTAssertEqual(posts.count, 2)
        let originalBody = try JSONSerialization.jsonObject(with: posts[0].httpBody!) as! [String: String]
        let retriedBody = try JSONSerialization.jsonObject(with: posts[1].httpBody!) as! [String: String]
        XCTAssertEqual(originalBody, retriedBody); XCTAssertEqual(posts[0].url, posts[1].url)
    }
    @MainActor func testPersistenceFailurePreventsPostAndForeignRestorationIsIgnored() async throws {
        let script = ManagementScript()
        let flow = HomeManagementFlow(api: HomeManagementAPI(transport: { try await script.reply($0) }), persist: { _ in throw CloudError.unavailable })
        flow.bind(accountID: managementAccount, epochID: managementEpoch, homeID: managementHome, revision: UUID())
        _ = try await flow.load(token: "synthetic")
        do { _ = try await flow.start(token: "synthetic"); XCTFail("No durable custody") } catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        let requests = await script.requests; XCTAssertEqual(requests.map(\.httpMethod), ["GET", "GET"])
        flow.bind(accountID: UUID(), epochID: managementEpoch, homeID: managementHome, revision: UUID(), restored: managementIntent)
        XCTAssertNil(flow.intent); XCTAssertNil(flow.status); XCTAssertNil(flow.receipt)
    }
    func testAuthenticationRefusalRequiresExactPrivateJson() async throws {
        let bytes = Data("{\"error\":\"Additional verification required\",\"code\":\"additional_verification_required\"}".utf8)
        let api = HomeManagementAPI(transport: { request in (bytes, HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!) })
        do { _ = try await api.claim(managementIntent, token: "synthetic"); XCTFail("Must require authentication") } catch { XCTAssertEqual(error as? HomeManagementAuthenticationError, .additionalVerificationRequired) }
    }
}
