import XCTest
@testable import OuchiCore

@MainActor private final class DeletionFlowBindingBox { var flow: AccountDeletionFlow? }

final class HouseholdAPITests: XCTestCase {
    private func config() throws -> CloudConfiguration {
        try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_test_only")
    }
    func testRejectsInsecureOrSecretConfiguration() {
        for address in ["http://aaaaaaaaaaaaaaaaaaaa.supabase.co", "https://attacker.com", "https://aaaaaaaaaaaaaaaaaaaa.supabase.co/other", "https://aaaaaaaaaaaaaaaaaaaa.supabase.co?key=secret"] {
            XCTAssertThrowsError(try CloudConfiguration(url: URL(string: address)!, publishableKey: "sb_publishable_synthetic_test_only"))
        }
        XCTAssertThrowsError(try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_secret_never_native"))
    }
    func testIsolatedDevelopmentConfigurationIsExplicitAndExact() throws {
        let key = "sb_publishable_synthetic_test_only"
        let url = URL(string: "http://127.0.0.1:54321")!
        XCTAssertThrowsError(try CloudConfiguration(url: url, publishableKey: key))
        #if DEBUG
        XCTAssertEqual(try CloudConfiguration(url: url, publishableKey: key, isolatedDevelopment: true).url, url)
        #else
        XCTAssertThrowsError(try CloudConfiguration(url: url, publishableKey: key, isolatedDevelopment: true))
        #endif
        for address in ["http://localhost:54321", "http://127.0.0.1:54322", "http://127.0.0.1:54321/other", "http://127.0.0.1:54321?x=1", "https://aaaaaaaaaaaaaaaaaaaa.supabase.co"] {
            XCTAssertThrowsError(try CloudConfiguration(url: URL(string: address)!, publishableKey: key, isolatedDevelopment: true))
        }
        XCTAssertThrowsError(try CloudConfiguration(url: url, publishableKey: "sb_secret_forbidden", isolatedDevelopment: true))
    }
    func testRPCUsesUserJWTAndPublishableKey() async throws {
        let api = HouseholdAPI(config: try config()) { request in
            XCTAssertEqual(request.url?.path, "/rest/v1/rpc/load_household")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer synthetic-user-session")
            XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "sb_publishable_synthetic_test_only")
            return (Data(#"{"homes":[],"products":[],"tasks":[],"history":[]}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let data = try await api.load(token: "synthetic-user-session")
        XCTAssertTrue(data.homes.isEmpty)
    }
    func testCompletionUsesExistingAtomicRPC() async throws {
        let api = HouseholdAPI(config: try config()) { request in
            XCTAssertEqual(request.url?.path, "/rest/v1/rpc/complete_maintenance")
            XCTAssertEqual(try JSONDecoder().decode([String:String].self, from: request.httpBody!), ["task_id":"task-1"])
            return (Data("null".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        try await api.complete(task: "task-1", token: "synthetic-user-session")
    }
    func testUnauthorizedNeverBecomesSuccessfulCompletion() async throws {
        let api = HouseholdAPI(config: try config()) { request in
            (Data("sensitive Auth error".utf8), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
        }
        do { try await api.complete(task: "task-1", token: "synthetic-user-session"); XCTFail("must fail") }
        catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
    }
    func testHouseholdFilterKeepsOtherHomesOutAndExportRetainsEverything() throws {
        let json = #"{"homes":[{"id":"a","name":"家","kind":"home"},{"id":"b","name":"別宅","kind":"second"}],"products":[{"id":"p1","homeId":"a","categoryId":"washer","maker":"メーカー","name":"洗濯機","modelNumber":"A"},{"id":"p2","homeId":"b","categoryId":"washer","maker":"メーカー","name":"洗濯機","modelNumber":"B"}],"tasks":[{"id":"t1","productId":"p1","name":"掃除","kind":"掃除","intervalDays":7,"nextDueAt":"2026-10-12","sourceKind":"ユーザー設定"},{"id":"t2","productId":"p2","name":"掃除","kind":"掃除","intervalDays":7,"nextDueAt":"2026-10-11","sourceKind":"ユーザー設定"}],"history":[{"id":"h1","taskId":"t1","productId":"p1","completedAt":"2026-10-10"},{"id":"h2","taskId":"t2","productId":"p2","completedAt":"2026-10-09"}]}"#
        let data = try JSONDecoder().decode(Household.self, from: Data(json.utf8))
        XCTAssertEqual(data.tasks(in: "a").map(\.id), ["t1"])
        XCTAssertEqual(data.history(in: "a").map(\.id), ["h1"])
        XCTAssertTrue(data.products(in: "missing").isEmpty)
        let restored = try JSONDecoder().decode(Household.self, from: data.export())
        XCTAssertEqual(restored.products.count, 2)
        XCTAssertEqual(restored.history.count, 2)
    }
}

extension HouseholdAPITests {
    func testDeletionReceiptDistinguishesAcceptanceFromConfirmedCompletion() throws {
        let id = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        func payload(_ state: String) -> Data { Data("{\"requestID\":\"\(id.uuidString)\",\"state\":\"\(state)\",\"records_erased\":true}".utf8) }
        XCTAssertEqual(try AccountDeletionStatus.accepted(payload("pending"), httpStatus: 202).state, .pending)
        XCTAssertThrowsError(try AccountDeletionStatus.accepted(payload("complete"), httpStatus: 202))
        for state in ["pending", "running", "failed", "complete"] {
            XCTAssertEqual(try AccountDeletionStatus.progress(payload(state), httpStatus: 200, expectedRequestID: id).state.rawValue, state)
        }
        XCTAssertThrowsError(try AccountDeletionStatus.progress(payload("complete"), httpStatus: 503, expectedRequestID: id))
        XCTAssertThrowsError(try AccountDeletionStatus.progress(payload("complete"), httpStatus: 200, expectedRequestID: UUID()))
        XCTAssertThrowsError(try AccountDeletionStatus.progress(payload("unknown"), httpStatus: 200, expectedRequestID: id))
        XCTAssertThrowsError(try AccountDeletionStatus.accepted(Data("{\"requestID\":\"00000000-0000-0000-0000-000000000000\",\"state\":\"pending\"}".utf8), httpStatus: 202))
    }
}

extension HouseholdAPITests {
    func testDeletionAPIAcceptsOnlyServerReceiptAndExactProgressRequest() async throws {
        let id = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let api = AccountDeletionAPI { request in
            XCTAssertEqual(request.url?.host, "ouchi-maintenance.vercel.app")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer synthetic")
            if request.httpMethod == "POST" {
                let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
                XCTAssertEqual(body, ["confirmation": "DELETE_OUCHI_ACCOUNT", "password": "Synthetic-only"])
                return (Data("{\"requestID\":\"\(id.uuidString)\",\"state\":\"pending\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 202, httpVersion: nil, headerFields: nil)!)
            }
            XCTAssertEqual(request.url?.path, "/api/account/deletion/" + id.uuidString.lowercased())
            XCTAssertNil(request.httpBody)
            return (Data("{\"requestID\":\"\(id.uuidString)\",\"state\":\"running\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let accepted = try await api.request(password: "Synthetic-only", token: "synthetic")
        XCTAssertEqual(accepted.state, .pending)
        let progress = try await api.progress(requestID: accepted.requestID, token: "synthetic")
        XCTAssertEqual(progress.state, .running)
        let unavailable = AccountDeletionAPI { request in (Data(), HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!) }
        do { _ = try await unavailable.progress(requestID: id, token: "synthetic"); XCTFail("Must not return completion") }
        catch { XCTAssertEqual(error as? CloudError, .rejected(503)) }
    }
}

extension HouseholdAPITests {
    func testDeletionCurrentProgressRecoversLostReceiptWithoutAssumingCompletion() async throws {
        let id = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let api = AccountDeletionAPI { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/api/account/deletion")
            XCTAssertNil(request.httpBody)
            return (Data("{\"requestID\":\"\(id.uuidString)\",\"state\":\"running\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let result = try await api.currentProgress(token: "synthetic")
        XCTAssertEqual(result?.requestID, id)
        XCTAssertEqual(result?.state, .running)
        let absent = AccountDeletionAPI { request in (Data(), HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!) }
        let missing = try await absent.currentProgress(token: "synthetic")
        XCTAssertNil(missing)
    }
}

extension HouseholdAPITests {
    @MainActor func testDeletionFlowRecoversBeforeRetryingAndClearsReboundReceipt() async throws {
        let id = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let api = AccountDeletionAPI { request in
            XCTAssertEqual(request.httpMethod, "GET", "Existing receipt must prevent duplicate submission")
            return (Data("{\"requestID\":\"\(id.uuidString)\",\"state\":\"running\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let flow = AccountDeletionFlow(api: api)
        flow.bind(accountID: id)
        let receipt = try await flow.submit(password: "Synthetic-only", token: "synthetic")
        XCTAssertEqual(receipt?.state, .running)
        XCTAssertFalse(flow.busy)
        flow.bind(accountID: id, revision: UUID())
        XCTAssertNil(flow.receipt, "A new enrollment/session for the same user must clear the old receipt")
        let sameUserReceipt = try await flow.recover(token: "synthetic")
        XCTAssertNotNil(sameUserReceipt)
        flow.bind(accountID: UUID())
        XCTAssertNil(flow.receipt)
        let outage = AccountDeletionFlow(api: AccountDeletionAPI { request in
            XCTAssertEqual(request.httpMethod, "GET")
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!)
        })
        outage.bind(accountID: id)
        do { _ = try await outage.submit(password: "Synthetic-only", token: "synthetic"); XCTFail("Must not submit on uncertain state") }
        catch { XCTAssertEqual(error as? CloudError, .rejected(503)) }
        XCTAssertNil(outage.receipt)
    }
    @MainActor func testDeletionFlowRejectsInFlightResultAfterSameAccountRevisionChanges() async throws {
        let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let binding = DeletionFlowBindingBox()
        let api = AccountDeletionAPI { request in
            XCTAssertEqual(request.httpMethod, "GET")
            // Rebinding occurs after the old request started, before its response arrives.
            await MainActor.run { binding.flow?.bind(accountID: account, revision: UUID()) }
            let body = Data("{\"requestID\":\"\(account.uuidString)\",\"state\":\"running\"}".utf8)
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let flow = AccountDeletionFlow(api: api)
        binding.flow = flow
        flow.bind(accountID: account, revision: UUID())
        do {
            _ = try await flow.submit(password: "Synthetic-only", token: "synthetic")
            XCTFail("Old response must not bind to the new enrollment/session")
        } catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
        XCTAssertNil(flow.receipt)
        XCTAssertFalse(flow.busy)
    }

    @MainActor func testDeletionFlowCancellationAfterLookupNeverSubmits() async throws {
        let api = AccountDeletionAPI { request in
            XCTAssertEqual(request.httpMethod, "GET", "Cancelled lookup must never become a deletion POST")
            withUnsafeCurrentTask { $0?.cancel() }
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!)
        }
        let flow = AccountDeletionFlow(api: api)
        flow.bind(accountID: UUID())
        let operation = Task { @MainActor in
            do {
                _ = try await flow.submit(password: "Synthetic-only", token: "synthetic")
                XCTFail("Cancellation must stop submission")
            } catch { XCTAssertTrue(error is CancellationError) }
        }
        await operation.value
        XCTAssertNil(flow.receipt)
        XCTAssertFalse(flow.busy)
    }

    @MainActor func testDeletionFlowCancellationAfterAcceptanceDoesNotPublishReceipt() async throws {
        let requestID = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let api = AccountDeletionAPI { request in
            if request.httpMethod == "GET" {
                return (Data(), HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!)
            }
            XCTAssertEqual(request.httpMethod, "POST")
            withUnsafeCurrentTask { $0?.cancel() }
            let body = Data("{\"requestID\":\"\(requestID.uuidString)\",\"state\":\"pending\"}".utf8)
            return (body, HTTPURLResponse(url: request.url!, statusCode: 202, httpVersion: nil, headerFields: nil)!)
        }
        let flow = AccountDeletionFlow(api: api)
        flow.bind(accountID: UUID())
        let operation = Task { @MainActor in
            do {
                _ = try await flow.submit(password: "Synthetic-only", token: "synthetic")
                XCTFail("A cancelled screen must recover durable state later")
            } catch { XCTAssertTrue(error is CancellationError) }
        }
        await operation.value
        XCTAssertNil(flow.receipt)
        XCTAssertFalse(flow.busy)
    }

}
