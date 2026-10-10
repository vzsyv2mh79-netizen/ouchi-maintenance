import XCTest
@testable import OuchiCore

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
