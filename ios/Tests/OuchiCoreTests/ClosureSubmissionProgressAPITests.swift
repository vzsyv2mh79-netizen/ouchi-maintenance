import XCTest
@testable import OuchiCore

final class ClosureSubmissionProgressAPITests: XCTestCase {
    func testSavedSubmissionGetsSeparateJobReceiptWithoutSendingActorOrPassword() async throws {
        let epoch = UUID(), submission = UUID(), job = UUID()
        let api = AccountClosureReviewAPI(transport: { request in
            XCTAssertEqual(request.url?.path, "/api/account/closure-review/progress")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(try JSONDecoder().decode([String:String].self, from: request.httpBody!), ["expectedEpochID":epoch.uuidString.lowercased(),"submissionID":submission.uuidString.lowercased()])
            let body = try JSONSerialization.data(withJSONObject: ["kind":"app-closure-progress/v1","state":"running","requestID":job.uuidString.lowercased(),"epochID":epoch.uuidString.lowercased(),"submissionID":submission.uuidString.lowercased()])
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type":"application/json","Cache-Control":"no-store"])!)
        })
        let progress = try await api.progress(token: "synthetic", epochID: epoch, submissionID: submission)
        XCTAssertEqual(progress?.requestID, job)
        XCTAssertEqual(progress?.state, .running)
    }
    func testUnavailableIsNotCompleteAndWrongScopeOrReviewReceiptRejected() async throws {
        let epoch = UUID(), submission = UUID()
        for mode in ["unavailable","wrong-epoch","review-receipt","extra-flag"] {
            let api = AccountClosureReviewAPI(transport: { request in
                var value = ["kind":"app-closure-progress/v1","state":"progress_unavailable","epochID":epoch.uuidString.lowercased(),"submissionID":submission.uuidString.lowercased()]
                if mode == "wrong-epoch" { value["epochID"] = UUID().uuidString.lowercased() }
                if mode == "review-receipt" { value["kind"] = "app-closure-review/v2"; value["state"] = "review_required" }
                if mode == "extra-flag" { value["complete"] = "true" }
                return (try JSONSerialization.data(withJSONObject: value), HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: ["Content-Type":"application/json","Cache-Control":"no-store"])!)
            })
            do {
                let result = try await api.progress(token: "synthetic", epochID: epoch, submissionID: submission)
                XCTAssertEqual(mode, "unavailable"); XCTAssertNil(result)
            } catch { XCTAssertNotEqual(mode, "unavailable"); XCTAssertEqual(error as? CloudError, .malformedResponse) }
        }
    }
}

private actor ProgressFlowServer {
    let job = UUID()
    var state = "running"
    var paths: [String] = []
    var hold = false
    var arrived = false
    var arrival: CheckedContinuation<Void, Never>?
    var release: CheckedContinuation<Void, Never>?
    func setState(_ value: String) { state = value }
    func pause() { hold = true }
    func wait() async { if arrived { return }; await withCheckedContinuation { arrival = $0 } }
    func finish() { release?.resume(); release = nil }
    func reply(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        paths.append(request.url!.lastPathComponent)
        let body = try JSONDecoder().decode([String:String].self, from: request.httpBody!)
        let isProgress = request.url!.lastPathComponent == "progress"
        var result = ["kind": isProgress ? "app-closure-progress/v1" : "app-closure-review/v2",
            "epochID": body["expectedEpochID"]!, "submissionID": body["submissionID"]!]
        let missing = state == "missing" || state == "review"
        result["state"] = isProgress ? (missing ? "progress_unavailable" : state) : "review_not_found"
        if isProgress && !missing { result["requestID"] = job.uuidString.lowercased() }
        let review = !isProgress && state == "review"
        if review { result["state"] = "review_required"; result["reviewRequestID"] = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }
        if hold {
            await withCheckedContinuation { release = $0; arrived = true; arrival?.resume(); arrival = nil }
        }
        return (try JSONSerialization.data(withJSONObject: result), HTTPURLResponse(url: request.url!, statusCode: (isProgress && !missing) || review ? 200 : 404,
            httpVersion: nil, headerFields: ["Content-Type":"application/json","Cache-Control":"no-store"])!)
    }
}
final class ClosureSubmissionProgressFlowTests: XCTestCase {
    @MainActor func testRealJobBlocksCancellationAndResubmissionEvenAfterLaterUnavailableReply() async throws {
        let server = ProgressFlowServer()
        let account = UUID(), epoch = UUID(), submission = UUID()
        let saved = AccountClosureReviewBinding(accountID: account, epochID: epoch, submissionID: submission)
        let flow = AccountClosureReviewFlow(api: .init(transport: { try await server.reply($0) }), persist: { $0 })
        flow.bind(accountID: account, epochID: epoch, revision: UUID(), restored: saved)
        let review = try await flow.refresh(token: "synthetic")
        let realJob = server.job
        XCTAssertNil(review); XCTAssertEqual(flow.progress?.requestID, realJob)
        XCTAssertNotEqual(flow.progress?.requestID, submission); XCTAssertTrue(flow.retirementObserved)
        XCTAssertFalse(flow.resultUnconfirmed)
        for action in 0..<3 {
            do {
                if action == 0 { _ = try await flow.cancel(token: "synthetic") }
                else if action == 1 { _ = try await flow.retry(password: "synthetic", token: "synthetic") }
                else { _ = try await flow.startNew(password: "synthetic", token: "synthetic") }
                XCTFail("A processing job must not reopen mutations")
            } catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        }
        flow.bind(accountID: account, epochID: epoch, revision: UUID(), restored: saved)
        await server.setState("missing")
        _ = try await flow.refresh(token: "synthetic")
        XCTAssertTrue(flow.retirementObserved); XCTAssertTrue(flow.resultUnconfirmed); XCTAssertNil(flow.progress)
        XCTAssertEqual(flow.binding, saved)
        let paths = await server.paths
        XCTAssertEqual(paths, ["progress", "progress"])
    }
    @MainActor func testReviewToRealJobTransitionUsesOnlyServerJobIDAndNeverReviewID() async throws {
        let server = ProgressFlowServer(); await server.setState("review")
        let account = UUID(), epoch = UUID()
        let flow = AccountClosureReviewFlow(api: .init(transport: { try await server.reply($0) }))
        flow.bind(accountID: account, epochID: epoch, revision: UUID(), restored: .init(accountID: account, epochID: epoch, submissionID: UUID()))
        let review = try await flow.refresh(token: "synthetic")
        XCTAssertEqual(review?.state, .reviewRequired); XCTAssertNil(flow.progress); XCTAssertFalse(flow.retirementObserved)
        await server.setState("complete")
        let oldReview = try await flow.refresh(token: "synthetic")
        XCTAssertNil(oldReview); XCTAssertNil(flow.receipt); XCTAssertEqual(flow.progress?.state, .complete)
        XCTAssertNotEqual(flow.progress?.requestID, review?.reviewRequestID)
        XCTAssertFalse(flow.resultUnconfirmed); XCTAssertTrue(flow.retirementObserved)
        let paths = await server.paths; XCTAssertEqual(paths, ["progress", "read", "progress"])
    }
    @MainActor func testBothMissingRemainUnconfirmedAndNeverCreateANewSubmission() async throws {
        let server = ProgressFlowServer(); await server.setState("missing")
        let account = UUID(), epoch = UUID()
        let saved = AccountClosureReviewBinding(accountID: account, epochID: epoch, submissionID: UUID())
        let flow = AccountClosureReviewFlow(api: .init(transport: { try await server.reply($0) }), persist: { $0 })
        flow.bind(accountID: account, epochID: epoch, revision: UUID(), restored: saved)
        _ = try await flow.refresh(token: "synthetic")
        XCTAssertTrue(flow.resultUnconfirmed); XCTAssertNil(flow.receipt); XCTAssertNil(flow.progress)
        XCTAssertTrue(flow.canRetrySameSubmission, "Only a separately confirmed same-number intake retry may be offered")
        do { _ = try await flow.startNew(password: "synthetic", token: "synthetic"); XCTFail("Keep original reference") }
        catch { XCTAssertEqual(error as? CloudError, .unavailable) }
        XCTAssertEqual(flow.binding, saved)
        let paths = await server.paths; XCTAssertEqual(paths, ["progress", "read"])
    }
    @MainActor func testLateProgressCannotFollowAccountChange() async throws {
        let server = ProgressFlowServer(); await server.pause()
        let account = UUID(), epoch = UUID()
        let flow = AccountClosureReviewFlow(api: .init(transport: { try await server.reply($0) }))
        flow.bind(accountID: account, epochID: epoch, revision: UUID(), restored: .init(accountID: account, epochID: epoch, submissionID: UUID()))
        let pending = Task { try await flow.refresh(token: "synthetic") }
        await server.wait()
        flow.bind(accountID: UUID(), epochID: UUID(), revision: UUID())
        await server.finish()
        do { _ = try await pending.value; XCTFail("Discard another account's progress") }
        catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
        XCTAssertNil(flow.progress); XCTAssertNil(flow.binding); XCTAssertFalse(flow.retirementObserved); XCTAssertFalse(flow.busy)
    }
    @MainActor func testTaskCancellationKeepsSavedReferenceUnconfirmed() async throws {
        let server = ProgressFlowServer(); await server.pause()
        let account = UUID(), epoch = UUID()
        let saved = AccountClosureReviewBinding(accountID: account, epochID: epoch, submissionID: UUID())
        let flow = AccountClosureReviewFlow(api: .init(transport: { try await server.reply($0) }))
        flow.bind(accountID: account, epochID: epoch, revision: UUID(), restored: saved)
        let pending = Task { try await flow.refresh(token: "synthetic") }
        await server.wait(); pending.cancel(); await server.finish()
        do { _ = try await pending.value; XCTFail("Cancelled read must not confirm status") } catch { XCTAssertTrue(error is CancellationError) }
        XCTAssertEqual(flow.binding, saved); XCTAssertNil(flow.progress); XCTAssertTrue(flow.resultUnconfirmed); XCTAssertFalse(flow.busy)
    }
}

private actor SameNumberIntakeServer {
    var accepted = false
    var processing = false
    var failRead = false
    var writes: [String] = []
    var paths: [String] = []
    func setAccepted() { accepted = true }
    func setProcessing() { processing = true }
    func breakRead() { failRead = true }
    func reply(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        let path = request.url!.lastPathComponent
        paths.append(path)
        let body = try JSONDecoder().decode([String:String].self, from: request.httpBody!)
        var value = ["kind":path == "progress" ? "app-closure-progress/v1" : "app-closure-review/v2", "epochID":body["expectedEpochID"]!, "submissionID":body["submissionID"]!]
        var status = 404
        if path == "request" {
            writes.append(body["submissionID"]!)
            if writes.count == 1 { status = 503; value = ["error":"synthetic rejected authentication"] }
            else { accepted = true; status = 202; value["state"] = "review_required"; value["reviewRequestID"] = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }
        } else if path == "progress" {
            value["state"] = processing ? "running" : "progress_unavailable"
            if processing { status = 200; value["requestID"] = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }
        } else {
            if failRead { status = 503; value = ["error":"synthetic unreadable state"] }
            else { status = accepted ? 200 : 404; value["state"] = accepted ? "review_required" : "review_not_found"; if accepted { value["reviewRequestID"] = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } }
        }
        return (try JSONSerialization.data(withJSONObject:value), HTTPURLResponse(url:request.url!,statusCode:status,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
    }
}
final class SameNumberIntakeRecoveryTests: XCTestCase {
    @MainActor func testRejectedProofExplicitlyRetriesSameSavedNumberAfterFreshReadsWithoutPersistingAnotherReference() async throws {
        let server = SameNumberIntakeServer(), account = UUID(), epoch = UUID()
        var saved: [AccountClosureReviewBinding] = []
        let flow = AccountClosureReviewFlow(api:.init(transport:{try await server.reply($0)}),persist:{saved.append($0);return $0})
        flow.bind(accountID:account,epochID:epoch,revision:UUID())
        do { _ = try await flow.startNew(password:"synthetic",token:"synthetic"); XCTFail("Proof rejected") } catch { XCTAssertEqual(error as? CloudError,.rejected(503)) }
        let original = try XCTUnwrap(flow.binding)
        XCTAssertEqual(saved.count,1); XCTAssertFalse(flow.canRetrySameSubmission)
        do { _ = try await flow.retry(password:"synthetic",token:"synthetic"); XCTFail("Must read first") } catch { XCTAssertEqual(error as? CloudError,.unavailable) }
        _ = try await flow.refresh(token:"synthetic")
        XCTAssertTrue(flow.canRetrySameSubmission); XCTAssertTrue(flow.resultUnconfirmed)
        let accepted = try await flow.retry(password:"synthetic",token:"synthetic")
        XCTAssertEqual(accepted?.submissionID,original.submissionID); XCTAssertEqual(accepted?.state,.reviewRequired)
        XCTAssertEqual(flow.binding,original); XCTAssertEqual(saved,[original]); XCTAssertFalse(flow.canRetrySameSubmission)
        let ids = await server.writes; XCTAssertEqual(ids,[original.submissionID.uuidString.lowercased(),original.submissionID.uuidString.lowercased()])
        let paths = await server.paths; XCTAssertEqual(paths,["request","progress","read","progress","read","request"])
    }
    @MainActor func testFreshAcceptanceProcessingReadFailureAndSessionChangeCannotSendAnotherRequest() async throws {
        for mode in ["accepted","processing","read-failure","changed-session"] {
            let server = SameNumberIntakeServer(), account = UUID(), epoch = UUID()
            let flow = AccountClosureReviewFlow(api:.init(transport:{try await server.reply($0)}),persist:{$0})
            flow.bind(accountID:account,epochID:epoch,revision:UUID())
            do { _ = try await flow.startNew(password:"synthetic",token:"synthetic") } catch {}
            let original = flow.binding
            _ = try await flow.refresh(token:"synthetic"); XCTAssertTrue(flow.canRetrySameSubmission)
            if mode == "accepted" { await server.setAccepted() }
            if mode == "processing" { await server.setProcessing() }
            if mode == "read-failure" { await server.breakRead() }
            if mode == "changed-session" { flow.bind(accountID:account,epochID:epoch,revision:UUID()) }
            do {
                let value = try await flow.retry(password:"synthetic",token:"synthetic")
                XCTAssertTrue(["accepted","processing"].contains(mode))
                if mode == "accepted" { XCTAssertEqual(value?.state,.reviewRequired) }
                else { XCTAssertEqual(flow.progress?.state,.running); XCTAssertTrue(flow.retirementObserved) }
            } catch { XCTAssertTrue(["read-failure","changed-session"].contains(mode)) }
            XCTAssertEqual(flow.binding,original); XCTAssertFalse(flow.canRetrySameSubmission)
            let writes = await server.writes; XCTAssertEqual(writes.count,1,mode)
        }
    }
}
