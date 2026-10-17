import Foundation
import CryptoKit
import OuchiCore

actor PendingRestoreSession {
    private var value: AppAttestRegistrationSession?
    init(_ value: AppAttestRegistrationSession) { self.value = value }
    func current() -> AppAttestRegistrationSession? { value }
    func clear() { value = nil }
}
@main struct PendingRestoreSubmissionSmoke {
    @MainActor static func refused(_ operation: () async throws -> Void) async {
        do { try await operation(); fatalError("Unsafe pending restore accepted") } catch {}
    }
    static func main() async throws {
        let now:Int64 = 1791727200001
        let user=UUID(uuidString:"11111111-1111-4111-8111-111111111111")!,session=UUID(uuidString:"22222222-2222-4222-8222-222222222222")!,epoch=UUID(uuidString:"33333333-3333-4333-8333-333333333333")!
        let keyID=Data(repeating:1,count:32).base64EncodedString()
        let canonical = #"{"version":1,"purpose":"restore_ouchi_subscription","nonce":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc","issuedAt":1791727200000,"expiresAt":1791727500000,"userID":"11111111-1111-4111-8111-111111111111","sessionID":"22222222-2222-4222-8222-222222222222","epochID":"33333333-3333-4333-8333-333333333333","requestID":"44444444-4444-4444-8444-444444444444","keyID":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=","appID":"SYNTHETIC1.dev.synthetic.ouchi","attestEnvironment":"development","purchaseEnvironment":"Sandbox","proofSHA256":"ed30e17c16007492e113af953fdbe0387fc08b5f4b4cf5eae6f9f6bd7a2dec27"}"#
        func pending(_ e:UUID=epoch,_ account:UUID=user,_ assertion:Data=Data("synthetic-assertion".utf8)) throws -> PendingRestore {
            let scope=AppAttestRegistrationScope(userID:account,sessionID:session,epochID:e,keyID:keyID,appID:"SYNTHETIC1.dev.synthetic.ouchi",environment:"development")
            let text=canonical.replacingOccurrences(of:epoch.uuidString.lowercased(),with:e.uuidString.lowercased()).replacingOccurrences(of:user.uuidString.lowercased(),with:account.uuidString.lowercased())
            let expected=RestoreAssertionScope(userID:account,sessionID:session,epochID:e,keyID:keyID,appID:scope.appID,environment:scope.environment,requestID:UUID(uuidString:"44444444-4444-4444-8444-444444444444")!,proofSHA256:try RestoreAssertionChallenge.pairDigest(signedApp:"合成app.jws",signedTransaction:"合成purchase.jws"))
            let challenge=try RestoreAssertionChallenge.parse(canonicalClientData:Data(text.utf8),expected:expected,nowMilliseconds:now)
            return try PendingRestore(scope:scope,challenge:challenge,signedAppTransaction:"合成app.jws",signedTransaction:"合成purchase.jws",assertion:assertion,nowMilliseconds:now)
        }
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-restore-submit-synthetic-"+UUID().uuidString,isDirectory:true)
        defer { try? FileManager.default.removeItem(at:root) }
        let key=SymmetricKey(data:Data(repeating:7,count:32)),record=try pending()
        let claims=try JSONSerialization.data(withJSONObject:["sub":user.uuidString.lowercased(),"session_id":session.uuidString.lowercased(),"exp":1799999999]).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        let captured=AppAttestRegistrationSession(scope:record.scope,bearer:"e30."+claims+".c2ln")
        let endpoint=URL(string:"https://ouchi-maintenance.vercel.app/api/billing/restore/commit")!
        let responseBody=try JSONEncoder().encode(["requestID":record.challenge.requestID.uuidString.lowercased(),"status":"pending"])
        @Sendable func response(_ body:Data=responseBody,_ status:Int=202,_ url:URL=endpoint,_ headers:[String:String]=["Content-Type":"application/json","Cache-Control":"no-store"]) -> (Data,HTTPURLResponse) {
            (body,HTTPURLResponse(url:url,statusCode:status,httpVersion:nil,headerFields:headers)!)
        }
        let storage=PendingRestoreStorage(root:root,keyProvider:{ _,_ in key }),submission=PendingRestoreSubmission(storage:storage)
        let file=root.appendingPathComponent(user.uuidString.lowercased()).appendingPathComponent(epoch.uuidString.lowercased()+".restore-pending")
        let api=RestoreCommitAPI(currentSession:{ captured },transport:{ request in
            precondition(FileManager.default.fileExists(atPath:file.path),"Proof must be durable before HTTP")
            precondition(request.url == endpoint && request.httpMethod == "POST" && !request.httpShouldHandleCookies)
            precondition(request.cachePolicy == .reloadIgnoringLocalCacheData && request.timeoutInterval == 30)
            precondition(request.value(forHTTPHeaderField:"Authorization") == "Bearer " + captured.bearer)
            precondition(request.value(forHTTPHeaderField:"X-Ouchi-App-Epoch") == epoch.uuidString.lowercased())
            let body=try JSONSerialization.jsonObject(with:request.httpBody!) as! [String:String]
            precondition(body == ["requestID":record.challenge.requestID.uuidString.lowercased(),"keyID":keyID,"signedAppTransaction":"合成app.jws","signedTransaction":"合成purchase.jws","assertionBase64":record.assertion.base64EncodedString()])
            return response()
        },now:{ now })
        let accepted=try await submission.submitNew(record,captured:captured,api:api,nowMilliseconds:now)
        precondition(accepted.requestID == record.challenge.requestID && accepted.scope == captured.scope)
        let expectedPair=try record.pairSHA256;precondition(accepted.pairSHA256 == expectedPair && accepted.assertionSHA256 == record.assertionSHA256)
        let retained=try await storage.read(scope:record.scope);precondition(retained == record,"202 does not erase proof or grant rights")
        let neverSend=RestoreCommitAPI(currentSession:{ captured },transport:{ _ in fatalError("Duplicate attempt dispatched") },now:{ now })
        await refused { _ = try await submission.submitNew(record,captured:captured,api:neverSend,nowMilliseconds:now) }
        let restarted=PendingRestoreSubmission(storage:PendingRestoreStorage(root:root,keyProvider:{ _,_ in key }))
        await refused { _ = try await restarted.submitNew(record,captured:captured,api:neverSend,nowMilliseconds:now) }
        let complete=try JSONEncoder().encode(["requestID":record.challenge.requestID.uuidString.lowercased(),"status":"complete"])
        let foreign=try JSONEncoder().encode(["requestID":epoch.uuidString.lowercased(),"status":"pending"])
        let extra=try JSONEncoder().encode(["requestID":record.challenge.requestID.uuidString.lowercased(),"status":"pending","active":"true"])
        for item in [response(complete),response(foreign),response(extra),response(responseBody,200),response(responseBody,401),response(responseBody,409),response(responseBody,503),response(responseBody,202,URL(string:"https://foreign.invalid/")!),response(responseBody,202,endpoint,["Content-Type":"application/json","Cache-Control":"public"]),response(Data(repeating:0,count:4097))] {
            let invalid=RestoreCommitAPI(currentSession:{ captured },transport:{ _ in item },now:{ now })
            await refused { _ = try await invalid.submit(pending:record,captured:captured) }
        }
        let expired=RestoreCommitAPI(currentSession:{ captured },transport:{ _ in fatalError("Expired challenge dispatched") },now:{ record.challenge.expiresAtMilliseconds })
        await refused { _ = try await expired.submit(pending:record,captured:captured) }
        let state=PendingRestoreSession(captured)
        let changed=RestoreCommitAPI(currentSession:{ await state.current() },transport:{ _ in await state.clear();return response() },now:{ now })
        await refused { _ = try await changed.submit(pending:record,captured:captured) }
        let failureRoot=root.appendingPathComponent("lost-ack",isDirectory:true),failureStorage=PendingRestoreStorage(root:failureRoot,keyProvider:{ _,_ in key })
        let lost=RestoreCommitAPI(currentSession:{ captured },transport:{ _ in throw CloudError.unavailable },now:{ now })
        await refused { _ = try await PendingRestoreSubmission(storage:failureStorage).submitNew(record,captured:captured,api:lost,nowMilliseconds:now) }
        let afterFailure=try await failureStorage.read(scope:record.scope);precondition(afterFailure == record)
        await refused { _ = try await PendingRestoreSubmission(storage:failureStorage).submitNew(record,captured:captured,api:neverSend,nowMilliseconds:now) }
        let stoppedRoot=root.appendingPathComponent("cancelled",isDirectory:true),stoppedStorage=PendingRestoreStorage(root:stoppedRoot,keyProvider:{ _,_ in key })
        let cancelled=Task {
            let api=RestoreCommitAPI(currentSession:{ captured },transport:{ _ in withUnsafeCurrentTask { $0?.cancel() }; return response() },now:{ now })
            return try await PendingRestoreSubmission(storage:stoppedStorage).submitNew(record,captured:captured,api:api,nowMilliseconds:now)
        }
        await refused { _ = try await cancelled.value }
        let afterCancel=try await stoppedStorage.read(scope:record.scope);precondition(afterCancel == record)
        print("PASS: actual encrypted staging precedes exact fixed commit HTTP; 202 retains proof, duplicate/restart refuses re-send, lost ack/cancellation preserves evidence, altered response/scope/expiry refusal. Synthetic key/server only; no Apple, rights or real network.")
    }
}
