import Foundation
import CryptoKit
import OuchiCore

actor PendingRestoreSession {
    private var value: AppAttestRegistrationSession?
    init(_ value: AppAttestRegistrationSession) { self.value = value }
    func current() -> AppAttestRegistrationSession? { value }
    func clear() { value = nil }
}
@main struct PendingRestoreRecoverySmoke {
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
        let endpoint=URL(string:"https://ouchi-maintenance.vercel.app/api/billing/restore/status")!
        let proofHash=record.assertionSHA256,pairHash=try record.pairSHA256,request=record.challenge.requestID.uuidString.lowercased()
        let pendingBody=try JSONEncoder().encode(["requestID":request,"status":"pending"])
        let completeBody=try JSONEncoder().encode(["requestID":request,"status":"complete"])
        let coordinator=PendingRestoreRecovery(storage:PendingRestoreStorage(root:root,keyProvider:{ _,_ in key }))
        let pendingAPI=RestoreStatusAPI(currentSession:{ captured },transport:{ sent in
            let body=try JSONSerialization.jsonObject(with:sent.httpBody!) as! [String:String]
            precondition(body == ["requestID":request,"pairSHA256":pairHash,"assertionSHA256":proofHash])
            return (pendingBody,HTTPURLResponse(url:endpoint,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
        },now:{ now+600000 }) // proof deadline passed; status remains allowed with live Auth
        let waiting=try await coordinator.resume(captured:captured,api:pendingAPI);precondition(waiting == .pending)
        let afterPending=try Data(contentsOf:file);precondition(afterPending == original)
        let unavailable=RestoreStatusAPI(currentSession:{ captured },transport:{ _ in
            (Data("{}".utf8),HTTPURLResponse(url:endpoint,statusCode:503,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
        },now:{ now+600000 })
        await refused { _ = try await coordinator.resume(captured:captured,api:unavailable) }
        let afterFailure=try Data(contentsOf:file);precondition(afterFailure == original)
        let sessionState=PendingRestoreSession(captured)
        let changed=RestoreStatusAPI(currentSession:{ await sessionState.current() },transport:{ _ in
            await sessionState.clear()
            return (completeBody,HTTPURLResponse(url:endpoint,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
        },now:{ now+600000 })
        await refused { _ = try await coordinator.resume(captured:captured,api:changed) }
        let afterChange=try Data(contentsOf:file);precondition(afterChange == original)
        let cancelled=Task {
            let api=RestoreStatusAPI(currentSession:{ captured },transport:{ _ in
                withUnsafeCurrentTask { $0?.cancel() }
                return (completeBody,HTTPURLResponse(url:endpoint,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
            },now:{ now+600000 })
            return try await coordinator.resume(captured:captured,api:api)
        }
        await refused { _ = try await cancelled.value }
        let afterCancel=try Data(contentsOf:file);precondition(afterCancel == original)
        let completeAPI=RestoreStatusAPI(currentSession:{ captured },transport:{ _ in
            (completeBody,HTTPURLResponse(url:endpoint,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
        },now:{ now+600000 })
        let finished=try await coordinator.resume(captured:captured,api:completeAPI);precondition(finished == .complete)
        let gone=try await storage.read(scope:record.scope);precondition(gone == nil)
        let noRequest=RestoreStatusAPI(currentSession:{ captured },transport:{ _ in fatalError("Missing proof dispatched HTTP") },now:{ now+600000 })
        let absent=try await coordinator.resume(captured:captured,api:noRequest);precondition(absent == nil)
        print("PASS: actual encrypted restart record -> original status digests; pending/error/session-change/cancellation retain bytes, exact completion removes proof, absent record avoids HTTP. Synthetic key/server only, no Keychain, commit, Apple update or rights.")
    }
}
