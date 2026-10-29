import XCTest
@testable import OuchiCore

private let custodyScope = ClosureReadScope(requestID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!, epochID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!, submissionID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!)
private let custodyID = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
private let custodyToken = Data(repeating: 17, count: 32).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
private func custodyReply(_ request: URLRequest, state: String? = nil, expiry: String? = nil, registered: Any? = nil) throws -> [String: Any] {
    let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
    var reply: [String: Any] = ["requestID": body["requestID"]!, "epochID": body["expectedEpochID"]!, "submissionID": body["submissionID"]!]
    if let id = body["credentialID"] { reply["credentialID"] = id }
    if let expiry { reply["expiresAt"] = expiry }
    if let registered { reply["registered"] = registered; reply["kind"] = "app-closure-read-registration/v1" }
    else if let state { reply["state"] = state; reply["kind"] = state == "unavailable" ? "app-closure-read-unavailable/v1" : "app-closure-read-status/v1" }
    else { reply["kind"] = "app-closure-read-window/v1" }
    return reply
}
private func custodyHTTP(_ request: URLRequest, _ value: [String: Any], status: Int = 200, headers: [String: String]? = nil, url: URL? = nil) throws -> (Data, HTTPURLResponse) {
    (try JSONSerialization.data(withJSONObject: value), HTTPURLResponse(url: url ?? request.url!, statusCode: status, httpVersion: nil,
        headerFields: headers ?? ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
}
final class ClosureReadCustodyAPITests: XCTestCase {
    func testFreshWindowAndExplicitSavedKeyRegistrationHaveSeparateScopeWithoutSharedAccountInventory() async throws {
        let expiry = "2099-01-01T00:00:00.000Z"
        // A date beyond the finite server policy is refused, even if scoped.
        let future = ClosureReadCustodyAPI(transport: { request in try custodyHTTP(request, custodyReply(request, expiry: expiry)) })
        do { _ = try await future.window(scope: custodyScope, bearer: "synthetic"); XCTFail("No unbounded window") } catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let deadline = formatter.string(from: Date().addingTimeInterval(3600))
        let api = ClosureReadCustodyAPI(transport: { request in
            let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
            XCTAssertNil(body["userID"]); XCTAssertNil(body["inventoryDigest"]); XCTAssertNil(body["token"])
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer synthetic")
            if request.url!.lastPathComponent == "window" {
                XCTAssertNil(request.value(forHTTPHeaderField: "X-Ouchi-Closure-Read"))
                return try custodyHTTP(request, custodyReply(request, expiry: deadline))
            }
            XCTAssertEqual(request.url!.path, "/api/account/closure-review/custody/register")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Ouchi-Closure-Read"), custodyToken)
            XCTAssertEqual(body["credentialID"], custodyID.uuidString.lowercased()); XCTAssertEqual(body["expiresAt"], deadline)
            return try custodyHTTP(request, custodyReply(request, expiry: deadline, registered: true))
        })
        let window = try await api.window(scope: custodyScope, bearer: "synthetic")
        XCTAssertEqual(window?.scope, custodyScope)
        try await api.register(scope: custodyScope, credentialID: custodyID, token: custodyToken, expiresAt: window!.expiresAt, bearer: "synthetic")
    }
    func testStatusUsesOnlySavedCredentialAndUnavailableNeverMeansCompletedOrRenewed() async throws {
        for state in ["pending", "running", "failed", "complete", "unavailable"] {
            let api = ClosureReadCustodyAPI(transport: { request in
                XCTAssertEqual(request.url!.path, "/api/account/closure-review/custody/status")
                XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
                XCTAssertEqual(request.value(forHTTPHeaderField: "X-Ouchi-Closure-Read"), custodyToken)
                return try custodyHTTP(request, custodyReply(request, state: state), status: state == "unavailable" ? 404 : 200)
            })
            let result = try await api.status(scope: custodyScope, credentialID: custodyID, token: custodyToken)
            if state == "unavailable" { XCTAssertNil(result) }
            else { XCTAssertEqual(result?.scope, custodyScope); XCTAssertEqual(result?.credentialID, custodyID); XCTAssertEqual(result?.state.rawValue, state) }
        }
    }
    func testWrongScopeOldKindRedirectUnknownFlagsAndCacheableResponsesCannotConfirmStatus() async throws {
        for mode in 0..<7 {
            let api = ClosureReadCustodyAPI(transport: { request in
                var value = try custodyReply(request, state: "complete")
                if mode == 0 { value["credentialID"] = UUID().uuidString.lowercased() }
                if mode == 1 { value["epochID"] = UUID().uuidString.lowercased() }
                if mode == 2 { value["kind"] = "app-closure-progress/v1" }
                if mode == 3 { value["localCleanupComplete"] = true }
                if mode == 4 { value["state"] = "unavailable" }
                return try custodyHTTP(request, value,
                    headers: mode == 5 ? ["Content-Type": "application/json", "Cache-Control": "public"] : nil,
                    url: mode == 6 ? URL(string: "https://foreign.invalid") : nil)
            })
            do { _ = try await api.status(scope: custodyScope, credentialID: custodyID, token: custodyToken); XCTFail("Reject unverified status") }
            catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
        }
    }
    func testRegistrationRequiresBooleanAcknowledgementExactDeadlineAndFiniteWindow() async throws {
        let date = Date(timeIntervalSince1970: floor(Date().addingTimeInterval(3600).timeIntervalSince1970))
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let expiry = formatter.string(from: date)
        let alteredExpiry = formatter.string(from: date.addingTimeInterval(1))
        for mode in 0..<3 {
            let api = ClosureReadCustodyAPI(transport: { request in
                let value = try custodyReply(request, expiry: mode == 2 ? alteredExpiry : expiry,
                    registered: mode == 0 ? 1 : mode == 1 ? false : true)
                return try custodyHTTP(request, value)
            })
            do { try await api.register(scope: custodyScope, credentialID: custodyID, token: custodyToken, expiresAt: date, bearer: "synthetic"); XCTFail("Require exact acknowledgement") }
            catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
        }
    }
    func testNoncanonicalTokenAndCancelledTaskNeverReachTransport() async throws {
        let api = ClosureReadCustodyAPI(transport: { _ in XCTFail("No request allowed"); throw CloudError.unavailable })
        for token in ["", String(repeating: "A", count: 42) + "B"] {
            do { _ = try await api.status(scope: custodyScope, credentialID: custodyID, token: token); XCTFail("Reject bad token") }
            catch { XCTAssertEqual(error as? CloudError, .invalidInput) }
        }
        let task = Task { withUnsafeCurrentTask { $0?.cancel() }; return try await api.status(scope: custodyScope, credentialID: custodyID, token: custodyToken) }
        do { _ = try await task.value; XCTFail("Cancelled request") } catch { XCTAssertTrue(error is CancellationError) }
    }
}
