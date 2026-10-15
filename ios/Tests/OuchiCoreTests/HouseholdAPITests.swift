import XCTest
@testable import OuchiCore

@MainActor private final class DeletionFlowBindingBox { var flow: AccountDeletionFlow? }

final class HouseholdAPITests: XCTestCase {
    func testDeletionFamilyRefusalRequiresExactBodyAndSubmissionResponse() async throws {
        let epoch = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        let cases = [
            ("{\"error\":\"Family handoff required\",\"code\":\"family_handoff_required\"}", true),
            ("{\"error\":\"Family handoff required\"}", false),
            ("{\"error\":\"unknown\",\"code\":\"family_handoff_required\"}", false),
            ("{\"error\":\"Family handoff required\",\"code\":\"family_handoff_required\",\"requestID\":\"unexpected\"}", false)
        ]
        for (body, exact) in cases {
            let api = AccountDeletionAPI { request in
                (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: 409, httpVersion: nil, headerFields: nil)!)
            }
            do { _ = try await api.request(password: "synthetic", token: "synthetic", expectedEpochID: epoch); XCTFail("Refusal cannot accept deletion") }
            catch {
                if exact { XCTAssertEqual(error as? AccountDeletionError, .familyHandoffRequired) }
                else { XCTAssertEqual(error as? CloudError, .rejected(409)) }
            }
            do { _ = try await api.currentProgress(token: "synthetic"); XCTFail("GET refusal is not an empty current request") }
            catch { XCTAssertEqual(error as? CloudError, .rejected(409)) }
        }
    }

    @MainActor func testDeletionFamilyRefusalLeavesNoAcceptedReceiptOrBusyState() async throws {
        let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let epoch = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        let api = AccountDeletionAPI { request in
            let body = request.httpMethod == "GET"
                ? "{\"state\":\"not_requested\",\"userID\":\"\(account.uuidString)\",\"epochID\":\"\(epoch.uuidString)\"}"
                : "{\"error\":\"Family handoff required\",\"code\":\"family_handoff_required\"}"
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: request.httpMethod == "GET" ? 200 : 409, httpVersion: nil, headerFields: nil)!)
        }
        let flow = AccountDeletionFlow(api: api); flow.bind(accountID: account, epochID: epoch)
        do { _ = try await flow.submit(password: "synthetic", token: "synthetic"); XCTFail("Family refusal must not become a receipt") }
        catch { XCTAssertEqual(error as? AccountDeletionError, .familyHandoffRequired) }
        XCTAssertNil(flow.receipt); XCTAssertFalse(flow.busy)
    }

    func testRedirectedFamilyRefusalCannotBeTrusted() async throws {
        let api = AccountDeletionAPI { _ in
            (Data("{\"error\":\"Family handoff required\",\"code\":\"family_handoff_required\"}".utf8), HTTPURLResponse(url: URL(string: "https://example.invalid/redirected")!, statusCode: 409, httpVersion: nil, headerFields: nil)!)
        }
        do { _ = try await api.request(password: "synthetic", token: "synthetic", expectedEpochID: UUID()); XCTFail("Redirect refused") }
        catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
    }

    func testReminderCleanupKeepsForeignAccountAndUnknownLegacyNotifications() {
        let account = UUID(), other = UUID(), nonce = UUID().uuidString
        let owned = "ouchi.local.\(account.uuidString.lowercased()).\(nonce).0"
        let foreign = "ouchi.local.\(other.uuidString.lowercased()).\(nonce).1"
        let legacy = "ouchi.local.\(nonce).2"
        let malformed = "ouchi.local.\(account.uuidString.lowercased()).invalid.3"
        let unknown = ReminderCleanupPlan(identifiers: [owned, foreign, legacy, malformed, "other.app"], account: account)
        XCTAssertEqual(unknown.identifiers, [owned]); XCTAssertTrue(unknown.ambiguousLegacy)
        let known = ReminderCleanupPlan(identifiers: [owned, foreign], account: account)
        XCTAssertEqual(known.identifiers, [owned]); XCTAssertFalse(known.ambiguousLegacy)
        let rebound = ReminderCleanupPlan(identifiers: [owned, foreign, legacy], account: other)
        XCTAssertEqual(rebound.identifiers, [foreign]); XCTAssertTrue(rebound.ambiguousLegacy)
    }
    private func cleanupFixture(root: URL, account: UUID, suffix: String, contents: String) throws -> URL {
        // Scope-only test fixture. Protected write() and locked-device behavior
        // remain separate tests; do not change the production protection level.
        let folder = root.appendingPathComponent(account.uuidString.lowercased())
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent(UUID().uuidString.lowercased()).appendingPathExtension(suffix)
        try Data(contents.utf8).write(to: file, options: .atomic)
        return file
    }
    func testManagedExportCleanupAfterRestartPreservesOtherAccountsAndUnownedFiles() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let account = UUID(), other = UUID()
        let first = try cleanupFixture(root: root, account: account, suffix: "json", contents: "synthetic")
        let second = try cleanupFixture(root: root, account: other, suffix: "ics", contents: "other")
        let foreign = first.deletingLastPathComponent().appendingPathComponent("saved-copy.json")
        try Data("user copy".utf8).write(to: foreign)
        let link = first.deletingLastPathComponent().appendingPathComponent(UUID().uuidString + ".pdf")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: second)
        let reopened = ManagedExportStorage(root: root)
        try reopened.removeFiles(account: account)
        XCTAssertTrue(try reopened.files(account: account).isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: first.path))
        XCTAssertEqual(try Data(contentsOf: second), Data("other".utf8))
        XCTAssertEqual(try Data(contentsOf: foreign), Data("user copy".utf8))
        XCTAssertEqual(try FileManager.default.destinationOfSymbolicLink(atPath: link.path), second.path)
        try reopened.removeFiles(account: account)
        try reopened.removeFiles(account: UUID())
    }
    func testManagedExportCleanupRefusesReplacedRoot() throws {
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: temporary) }
        let root = temporary.appendingPathComponent("exports"), account = UUID()
        let storage = ManagedExportStorage(root: root)
        let file = try cleanupFixture(root: root, account: account, suffix: "pdf", contents: "synthetic")
        let moved = temporary.appendingPathComponent("moved")
        try FileManager.default.moveItem(at: root, to: moved)
        try FileManager.default.createSymbolicLink(at: root, withDestinationURL: moved)
        XCTAssertThrowsError(try storage.removeFiles(account: account))
        let preserved = moved.appendingPathComponent(account.uuidString.lowercased()).appendingPathComponent(file.lastPathComponent)
        XCTAssertEqual(try Data(contentsOf: preserved), Data("synthetic".utf8))
    }
    func testManagedExportsSurviveRestartAndRemainAccountScoped() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let account = UUID(), other = UUID()
        let first = try cleanupFixture(root: root, account: account, suffix: "json", contents: "synthetic")
        let second = try cleanupFixture(root: root, account: other, suffix: "ics", contents: "other")
        let reopened = ManagedExportStorage(root: root)
        XCTAssertEqual(try reopened.files(account: account).map { $0.resolvingSymlinksInPath() }, [first.resolvingSymlinksInPath()])
        XCTAssertEqual(try reopened.files(account: other).map { $0.resolvingSymlinksInPath() }, [second.resolvingSymlinksInPath()])
        XCTAssertEqual(try Data(contentsOf: first), Data("synthetic".utf8))
        XCTAssertThrowsError(try reopened.write(Data(), account: account, extension: "../json"))
        let link = root.appendingPathComponent(UUID().uuidString.lowercased())
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: first.deletingLastPathComponent())
        XCTAssertThrowsError(try reopened.files(account: UUID(uuidString: link.lastPathComponent)!))
    }
    func testManagedExportsExcludeUnownedEntriesAndRejectReplacedRoot() throws {
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: temporary) }
        let root = temporary.appendingPathComponent("exports"), account = UUID()
        let storage = ManagedExportStorage(root: root)
        XCTAssertTrue(try storage.files(account: account).isEmpty)
        let owned = try cleanupFixture(root: root, account: account, suffix: "pdf", contents: "synthetic")
        let folder = owned.deletingLastPathComponent()
        try Data("unowned".utf8).write(to: folder.appendingPathComponent("other.json"))
        try Data("unowned".utf8).write(to: folder.appendingPathComponent(UUID().uuidString + ".txt"))
        try FileManager.default.createDirectory(at: folder.appendingPathComponent(UUID().uuidString + ".pdf"), withIntermediateDirectories: false)
        try FileManager.default.createSymbolicLink(at: folder.appendingPathComponent(UUID().uuidString + ".pdf"), withDestinationURL: owned)
        XCTAssertEqual(try storage.files(account: account).map(\.lastPathComponent), [owned.lastPathComponent])
        let moved = temporary.appendingPathComponent("moved")
        try FileManager.default.moveItem(at: root, to: moved)
        try FileManager.default.createSymbolicLink(at: root, withDestinationURL: moved)
        XCTAssertThrowsError(try storage.files(account: account))
        XCTAssertThrowsError(try storage.write(Data(), account: account, extension: "pdf"))
    }
    func testPendingRemovalRefusesForeignScopeInvalidIdentifiersAndOversizedData() throws {
        let account = UUID(), epoch = UUID(), product = UUID(), id = UUID()
        let value = try PendingAttachmentRemoval(account: account, epoch: epoch, product: product, id: id)
        let bytes = try value.encode()
        XCTAssertEqual(try PendingAttachmentRemoval.decode(bytes, account: account, epoch: epoch).id, id)
        XCTAssertThrowsError(try PendingAttachmentRemoval.decode(bytes, account: UUID(), epoch: epoch))
        XCTAssertThrowsError(try PendingAttachmentRemoval.decode(bytes, account: account, epoch: UUID()))
        XCTAssertThrowsError(try PendingAttachmentRemoval.decode(Data(count: 4097), account: account, epoch: epoch))
        XCTAssertThrowsError(try PendingAttachmentRemoval.decode(Data("{}".utf8), account: account, epoch: epoch))
        XCTAssertThrowsError(try PendingAttachmentRemoval(account: account, epoch: account, product: product, id: id))
        XCTAssertThrowsError(try PendingAttachmentRemoval(account: account, epoch: epoch, product: product, id: UUID(uuidString: "00000000-0000-0000-0000-000000000000")!))
    }
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
    @MainActor func testDeletionFlowRejectsOldEpochEvenForSameUserAndRevision() async throws {
        let account = UUID(), oldEpoch = UUID(), newEpoch = UUID(), revision = UUID(), requestID = UUID()
        let api = AccountDeletionAPI { request in
            XCTAssertEqual(request.httpMethod, "GET", "A foreign-epoch receipt must never cause a POST")
            let body = Data("{\"epochID\":\"\(oldEpoch)\",\"requestID\":\"\(requestID)\",\"state\":\"complete\"}".utf8)
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let flow = AccountDeletionFlow(api: api)
        flow.bind(accountID: account, epochID: oldEpoch, revision: revision)
        let prior = try await flow.recover(token: "synthetic")
        XCTAssertEqual(prior?.epochID, oldEpoch)
        flow.bind(accountID: account, epochID: newEpoch, revision: revision)
        XCTAssertNil(flow.receipt)
        do { _ = try await flow.submit(password: "Synthetic-only", token: "synthetic"); XCTFail("Old epoch must not authorize cleanup of a new enrollment") }
        catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
        XCTAssertNil(flow.receipt)
        XCTAssertFalse(flow.busy)
    }

    func testDeletionReceiptDistinguishesAcceptanceFromConfirmedCompletion() throws {
        let id = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        func payload(_ state: String) -> Data { Data("{\"epochID\":\"33333333-3333-4333-8333-333333333333\",\"requestID\":\"\(id.uuidString)\",\"state\":\"\(state)\",\"records_erased\":true}".utf8) }
        XCTAssertEqual(try AccountDeletionStatus.accepted(payload("pending"), httpStatus: 202).state, .pending)
        XCTAssertThrowsError(try AccountDeletionStatus.accepted(payload("complete"), httpStatus: 202))
        for state in ["pending", "running", "failed", "complete"] {
            XCTAssertEqual(try AccountDeletionStatus.progress(payload(state), httpStatus: 200, expectedRequestID: id).state.rawValue, state)
        }
        XCTAssertThrowsError(try AccountDeletionStatus.progress(payload("complete"), httpStatus: 503, expectedRequestID: id))
        XCTAssertThrowsError(try AccountDeletionStatus.progress(payload("complete"), httpStatus: 200, expectedRequestID: UUID()))
        XCTAssertThrowsError(try AccountDeletionStatus.progress(payload("unknown"), httpStatus: 200, expectedRequestID: id))
        XCTAssertThrowsError(try AccountDeletionStatus.accepted(Data("{\"epochID\":\"33333333-3333-4333-8333-333333333333\",\"requestID\":\"00000000-0000-0000-0000-000000000000\",\"state\":\"pending\"}".utf8), httpStatus: 202))
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
                XCTAssertEqual(body, ["confirmation": "DELETE_OUCHI_ACCOUNT", "password": "Synthetic-only", "expectedEpochID": "33333333-3333-4333-8333-333333333333"])
                return (Data("{\"epochID\":\"33333333-3333-4333-8333-333333333333\",\"requestID\":\"\(id.uuidString)\",\"state\":\"pending\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 202, httpVersion: nil, headerFields: nil)!)
            }
            XCTAssertEqual(request.url?.path, "/api/account/deletion/" + id.uuidString.lowercased())
            XCTAssertNil(request.httpBody)
            return (Data("{\"epochID\":\"33333333-3333-4333-8333-333333333333\",\"requestID\":\"\(id.uuidString)\",\"state\":\"running\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let accepted = try await api.request(password: "Synthetic-only", token: "synthetic", expectedEpochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!)
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
            return (Data("{\"epochID\":\"33333333-3333-4333-8333-333333333333\",\"requestID\":\"\(id.uuidString)\",\"state\":\"running\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let result = try await api.currentProgress(token: "synthetic")
        XCTAssertEqual(result?.requestID, id)
        XCTAssertEqual(result?.state, .running)
        let absent = AccountDeletionAPI { request in (Data(), HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!) }
        do { _ = try await absent.currentProgress(token: "synthetic"); XCTFail("Unscoped 404 is not verified absence") } catch { XCTAssertEqual(error as? CloudError, .rejected(404)) }
    }
}

extension HouseholdAPITests {
    @MainActor func testDeletionFlowRecoversBeforeRetryingAndClearsReboundReceipt() async throws {
        let id = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let api = AccountDeletionAPI { request in
            XCTAssertEqual(request.httpMethod, "GET", "Existing receipt must prevent duplicate submission")
            return (Data("{\"epochID\":\"33333333-3333-4333-8333-333333333333\",\"requestID\":\"\(id.uuidString)\",\"state\":\"running\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let flow = AccountDeletionFlow(api: api)
        flow.bind(accountID: id, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!)
        let receipt = try await flow.submit(password: "Synthetic-only", token: "synthetic")
        XCTAssertEqual(receipt?.state, .running)
        XCTAssertFalse(flow.busy)
        flow.bind(accountID: id, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, revision: UUID())
        XCTAssertNil(flow.receipt, "A new enrollment/session for the same user must clear the old receipt")
        let sameUserReceipt = try await flow.recover(token: "synthetic")
        XCTAssertNotNil(sameUserReceipt)
        flow.bind(accountID: UUID(), epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!)
        XCTAssertNil(flow.receipt)
        let outage = AccountDeletionFlow(api: AccountDeletionAPI { request in
            XCTAssertEqual(request.httpMethod, "GET")
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!)
        })
        outage.bind(accountID: id, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!)
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
            await MainActor.run { binding.flow?.bind(accountID: account, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, revision: UUID()) }
            let body = Data("{\"epochID\":\"33333333-3333-4333-8333-333333333333\",\"requestID\":\"\(account.uuidString)\",\"state\":\"running\"}".utf8)
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let flow = AccountDeletionFlow(api: api)
        binding.flow = flow
        flow.bind(accountID: account, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, revision: UUID())
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
        flow.bind(accountID: UUID(), epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!)
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
                return (Data("{\"state\":\"not_requested\",\"userID\":\"22222222-2222-4222-8222-222222222222\",\"epochID\":\"33333333-3333-4333-8333-333333333333\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            XCTAssertEqual(request.httpMethod, "POST")
            withUnsafeCurrentTask { $0?.cancel() }
            let body = Data("{\"epochID\":\"33333333-3333-4333-8333-333333333333\",\"requestID\":\"\(requestID.uuidString)\",\"state\":\"pending\"}".utf8)
            return (body, HTTPURLResponse(url: request.url!, statusCode: 202, httpVersion: nil, headerFields: nil)!)
        }
        let flow = AccountDeletionFlow(api: api)
        flow.bind(accountID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!)
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


extension HouseholdAPITests {
    @MainActor func testDeletionUnknownOrForeignAbsenceNeverSubmits() async {
        let account = UUID(), epoch = UUID()
        let cases: [(Int, Data)] = [(404, Data()), (404, Data("<html>missing route</html>".utf8)),
            (200, try! JSONSerialization.data(withJSONObject: ["state": "not_requested", "userID": UUID().uuidString, "epochID": epoch.uuidString])),
            (200, try! JSONSerialization.data(withJSONObject: ["state": "not_requested", "userID": account.uuidString, "epochID": UUID().uuidString]))]
        for (status, data) in cases {
            let api = AccountDeletionAPI { request in
                XCTAssertEqual(request.httpMethod, "GET", "Unconfirmed absence must not issue a POST")
                return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
            let flow = AccountDeletionFlow(api: api); flow.bind(accountID: account, epochID: epoch)
            do { _ = try await flow.submit(password: "synthetic-only", token: "synthetic"); XCTFail("Unconfirmed absence accepted") } catch {}
            XCTAssertNil(flow.receipt); XCTAssertFalse(flow.busy)
        }
    }
    func testDeletionAbsenceRequiresExplicitCurrentAccountAndEpoch() async throws {
        let account = UUID(), epoch = UUID()
        let data = try JSONSerialization.data(withJSONObject: ["state": "not_requested", "userID": account.uuidString, "epochID": epoch.uuidString])
        let api = AccountDeletionAPI { request in (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
        let result = try await api.currentProgress(token: "synthetic", expectedAccountID: account, expectedEpochID: epoch)
        XCTAssertNil(result)
        do { _ = try await api.currentProgress(token: "synthetic"); XCTFail("Unbound absence accepted") } catch {}
    }
}


extension HouseholdAPITests {
    func testDeletionPostRefusesWrongEpochAcknowledgement() async {
        let expected = UUID(), other = UUID(), requestID = UUID()
        let api = AccountDeletionAPI { request in
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
            XCTAssertEqual(body["expectedEpochID"], expected.uuidString.lowercased())
            let reply = try JSONSerialization.data(withJSONObject: ["requestID": requestID.uuidString, "epochID": other.uuidString, "state": "pending"])
            return (reply, HTTPURLResponse(url: request.url!, statusCode: 202, httpVersion: nil, headerFields: nil)!)
        }
        do { _ = try await api.request(password: "synthetic", token: "synthetic", expectedEpochID: expected); XCTFail("Foreign epoch acknowledgement accepted") }
        catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
    }
    func testDeletionPostRejectsZeroEpochBeforeTransport() async {
        let api = AccountDeletionAPI { _ in XCTFail("Invalid epoch reached transport"); throw CloudError.unavailable }
        do { _ = try await api.request(password: "synthetic", token: "synthetic", expectedEpochID: UUID(uuidString: "00000000-0000-0000-0000-000000000000")!); XCTFail("Zero epoch accepted") }
        catch { XCTAssertEqual(error as? CloudError, .invalidInput) }
    }
}
