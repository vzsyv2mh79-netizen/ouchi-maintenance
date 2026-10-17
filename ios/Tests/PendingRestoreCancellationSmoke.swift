import Foundation
import CryptoKit
import OuchiCore

actor PendingCancellationSession {
    private var value: AppAttestRegistrationSession?
    init(_ value: AppAttestRegistrationSession) { self.value = value }
    func current() -> AppAttestRegistrationSession? { value }
    func clear() { value = nil }
}
@main struct PendingRestoreCancellationSmoke {
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
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-restore-recovery-synthetic-"+UUID().uuidString,isDirectory:true)
        defer { try? FileManager.default.removeItem(at:root) }
        let key=SymmetricKey(data:Data(repeating:7,count:32)),storage=PendingRestoreStorage(root:root,keyProvider:{ _,_ in key })
        let record=try pending();try await storage.stage(record,nowMilliseconds:now)
        let file=root.appendingPathComponent(user.uuidString.lowercased()).appendingPathComponent(epoch.uuidString.lowercased()+".restore-pending")
        let original=try Data(contentsOf:file)
        let claims=try JSONSerialization.data(withJSONObject:["sub":user.uuidString.lowercased(),"session_id":session.uuidString.lowercased(),"exp":1799999999]).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        let captured=AppAttestRegistrationSession(scope:record.scope,bearer:"e30."+claims+".c2ln")
        let endpoint=URL(string:"https://ouchi-maintenance.vercel.app/api/billing/restore/cancel")!
        let proofHash=record.assertionSHA256,pairHash=try record.pairSHA256,request=record.challenge.requestID.uuidString.lowercased()
        let valid = try JSONEncoder().encode(["requestID":request,"status":"cancelled","pairSHA256":pairHash,"assertionSHA256":proofHash])
        let coordinator=PendingRestoreCancellation(storage:PendingRestoreStorage(root:root,keyProvider:{ _,_ in key }))
        @Sendable func response(_ body:Data,_ status:Int=200,_ url:URL=endpoint,_ headers:[String:String]=["Content-Type":"application/json","Cache-Control":"no-store"]) -> (Data,HTTPURLResponse) {
            (body,HTTPURLResponse(url:url,statusCode:status,httpVersion:nil,headerFields:headers)!)
        }
        for object in [
            ["requestID":epoch.uuidString.lowercased(),"status":"cancelled","pairSHA256":pairHash,"assertionSHA256":proofHash],
            ["requestID":request,"status":"pending","pairSHA256":pairHash,"assertionSHA256":proofHash],
            ["requestID":request,"status":"cancelled","pairSHA256":String(repeating:"a",count:64),"assertionSHA256":proofHash],
            ["requestID":request,"status":"cancelled","pairSHA256":pairHash,"assertionSHA256":String(repeating:"a",count:64)],
            ["requestID":request,"status":"cancelled","pairSHA256":pairHash,"assertionSHA256":proofHash,"active":"true"]
        ] {
            let bytes=try JSONEncoder().encode(object)
            let api=RestoreCancelAPI(currentSession:{ captured },transport:{ _ in response(bytes) },now:{ now+600000 })
            await refused { _ = try await coordinator.cancelUnreserved(captured:captured,api:api) }
            let unchanged=try Data(contentsOf:file);precondition(unchanged == original)
        }
        for item in [response(Data("{}".utf8)),response(valid,401),response(valid,409),response(valid,503),response(valid,200,URL(string:"https://foreign.invalid/")!),response(valid,200,endpoint,["Content-Type":"application/json","Cache-Control":"public"]),response(valid,200,endpoint,["Content-Type":"text/plain","Cache-Control":"no-store"]),response(Data(repeating:0,count:4097))] {
            let api=RestoreCancelAPI(currentSession:{ captured },transport:{ _ in item },now:{ now+600000 })
            await refused { _ = try await coordinator.cancelUnreserved(captured:captured,api:api) }
            let unchanged=try Data(contentsOf:file);precondition(unchanged == original)
        }
        let lost=RestoreCancelAPI(currentSession:{ captured },transport:{ _ in throw URLError(.networkConnectionLost) },now:{ now+600000 })
        await refused { _ = try await coordinator.cancelUnreserved(captured:captured,api:lost) }
        let sessionState=PendingCancellationSession(captured)
        let changed=RestoreCancelAPI(currentSession:{ await sessionState.current() },transport:{ _ in await sessionState.clear();return response(valid) },now:{ now+600000 })
        await refused { _ = try await coordinator.cancelUnreserved(captured:captured,api:changed) }
        let cancelled=Task {
            let api=RestoreCancelAPI(currentSession:{ captured },transport:{ _ in withUnsafeCurrentTask { $0?.cancel() };return response(valid) },now:{ now+600000 })
            return try await coordinator.cancelUnreserved(captured:captured,api:api)
        }
        await refused { _ = try await cancelled.value }
        let stillRetained=try Data(contentsOf:file);precondition(stillRetained == original)
        let noAuth=RestoreCancelAPI(currentSession:{ nil },transport:{ _ in fatalError("No Auth reached transport") },now:{ now+600000 })
        await refused { _ = try await coordinator.cancelUnreserved(captured:captured,api:noAuth) }
        let other=try pending(UUID(uuidString:"55555555-5555-4555-8555-555555555555")!)
        let mismatch=RestoreCancelAPI(currentSession:{ captured },transport:{ _ in fatalError("Foreign proof reached transport") },now:{ now+600000 })
        await refused { _ = try await mismatch.cancelUnreserved(pending:other,captured:captured) }
        let accepted=RestoreCancelAPI(currentSession:{ captured },transport:{ sent in
            precondition(sent.url == endpoint && sent.httpMethod == "POST" && sent.timeoutInterval == 15)
            precondition(sent.httpShouldHandleCookies == false && sent.cachePolicy == .reloadIgnoringLocalCacheData)
            precondition(sent.value(forHTTPHeaderField:"Authorization") == "Bearer " + captured.bearer)
            precondition(sent.value(forHTTPHeaderField:"X-Ouchi-App-Epoch") == epoch.uuidString.lowercased())
            let body=try JSONSerialization.jsonObject(with:sent.httpBody!) as! [String:String]
            precondition(body == ["requestID":request,"keyID":keyID,"pairSHA256":pairHash,"assertionSHA256":proofHash])
            return response(valid)
        },now:{ now+600000 }) // historical proof expiry does not prevent scoped cancellation
        let receipt=try await accepted.cancelUnreserved(pending:record,captured:captured)
        precondition(receipt.scope == record.scope && receipt.requestID == record.challenge.requestID)
        let altered=try pending(epoch,user,Data("different-assertion".utf8))
        await refused { try await storage.removeCancelled(altered,receipt:receipt) }
        let beforeExact=try Data(contentsOf:file);precondition(beforeExact == original)
        let finished=try await coordinator.cancelUnreserved(captured:captured,api:accepted)
        precondition(finished?.scope == record.scope)
        let gone=try await storage.read(scope:record.scope);precondition(gone == nil)
        let absentAPI=RestoreCancelAPI(currentSession:{ captured },transport:{ _ in fatalError("Missing proof dispatched HTTP") },now:{ now+600000 })
        let absent=try await coordinator.cancelUnreserved(captured:captured,api:absentAPI);precondition(absent == nil)
        print("PASS: exact authenticated native cancellation receipt erases encrypted pending bytes only; expired proof allowed, foreign/altered/cache/error/lost-ack/session-change/cancellation preserve proof, absent avoids HTTP. Synthetic key/server only; no Apple, replacement proof, rights or live UI.")
    }
}
