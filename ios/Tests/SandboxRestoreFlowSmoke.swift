import Foundation
import CryptoKit
import OuchiCore

actor FlowSession {
    private var value: AppAttestRegistrationSession?
    init(_ value: AppAttestRegistrationSession) { self.value = value }
    func current() -> AppAttestRegistrationSession? { value }
    func clear() { value = nil }
}
actor FlowHTTP {
    var commits=0, produces=0, statuses=0, cancellations=0, processes=0
    var lostCommit=false, lostCancel=false, unknown=false, reserved=true, complete=false, processComplete=false, lostProcess=false
    func modes(lostCommit:Bool=false,lostCancel:Bool=false,unknown:Bool=false,reserved:Bool=true,complete:Bool=false,processComplete:Bool=false,lostProcess:Bool=false) {
        self.lostCommit=lostCommit;self.lostCancel=lostCancel;self.unknown=unknown;self.reserved=reserved;self.complete=complete;self.processComplete=processComplete;self.lostProcess=lostProcess
    }
    func produced() { produces += 1 }
    func counts() -> [Int] { [produces,commits,statuses,cancellations,processes] }
    func send(_ request:URLRequest) throws -> (Data,HTTPURLResponse) {
        let body=try JSONSerialization.jsonObject(with:request.httpBody!) as! [String:String]
        let id=body["requestID"]!,operation=request.url!.lastPathComponent
        let object:[String:String];let code:Int
        switch operation {
        case "commit": commits += 1;if lostCommit { lostCommit=false;throw URLError(.networkConnectionLost) };object=["requestID":id,"status":"pending"];code=202
        case "status": statuses += 1;object=["requestID":id,"status":complete ? "complete":"pending"];code=unknown ? 409:200
        case "process": processes += 1;if lostProcess { lostProcess=false;throw URLError(.networkConnectionLost) };object=["requestID":id,"status":processComplete ? "complete":"pending"];code=200
        case "cancel": cancellations += 1;if lostCancel { lostCancel=false;throw URLError(.networkConnectionLost) };object=["requestID":id,"status":"cancelled","pairSHA256":body["pairSHA256"]!,"assertionSHA256":body["assertionSHA256"]!];code=reserved ? 409:200
        default: fatalError("Unexpected endpoint or entitlement")
        }
        return (try JSONEncoder().encode(object),HTTPURLResponse(url:request.url!,statusCode:code,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
    }
}
actor FlowPause {
    var entered=false
    var entry:CheckedContinuation<Void,Never>?,release:CheckedContinuation<Void,Never>?
    func waitForEntry() async { if entered { return };await withCheckedContinuation { entry=$0 } }
    func hold() async { entered=true;entry?.resume();entry=nil;await withCheckedContinuation { release=$0 } }
    func proceed() { release?.resume();release=nil }
}

@main struct SandboxRestoreFlowSmoke {
    @MainActor static func refused(_ operation: () async throws -> Void) async {
        do { try await operation(); fatalError("Unsafe pending restore accepted") } catch {}
    }
    static func main() async throws {
        let now:Int64 = 1791727200001
        let user=UUID(uuidString:"11111111-1111-4111-8111-111111111111")!,session=UUID(uuidString:"22222222-2222-4222-8222-222222222222")!,epoch=UUID(uuidString:"33333333-3333-4333-8333-333333333333")!
        let keyID=Data(repeating:1,count:32).base64EncodedString()
        let canonical = #"{"version":1,"purpose":"restore_ouchi_subscription","nonce":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc","issuedAt":1791727200000,"expiresAt":1791727500000,"userID":"11111111-1111-4111-8111-111111111111","sessionID":"22222222-2222-4222-8222-222222222222","epochID":"33333333-3333-4333-8333-333333333333","requestID":"44444444-4444-4444-8444-444444444444","keyID":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=","appID":"SYNTHETIC1.dev.synthetic.ouchi","attestEnvironment":"development","purchaseEnvironment":"Sandbox","proofSHA256":"ed30e17c16007492e113af953fdbe0387fc08b5f4b4cf5eae6f9f6bd7a2dec27"}"#
        @Sendable func pending(_ requestID: UUID, _ e:UUID=epoch,_ account:UUID=user,_ assertion:Data=Data("synthetic-assertion".utf8)) throws -> PendingRestore {
            let scope=AppAttestRegistrationScope(userID:account,sessionID:session,epochID:e,keyID:keyID,appID:"SYNTHETIC1.dev.synthetic.ouchi",environment:"development")
            let text=canonical.replacingOccurrences(of:"44444444-4444-4444-8444-444444444444",with:requestID.uuidString.lowercased()).replacingOccurrences(of:epoch.uuidString.lowercased(),with:e.uuidString.lowercased()).replacingOccurrences(of:user.uuidString.lowercased(),with:account.uuidString.lowercased())
            let expected=RestoreAssertionScope(userID:account,sessionID:session,epochID:e,keyID:keyID,appID:scope.appID,environment:scope.environment,requestID:requestID,proofSHA256:try RestoreAssertionChallenge.pairDigest(signedApp:"合成app.jws",signedTransaction:"合成purchase.jws"))
            let challenge=try RestoreAssertionChallenge.parse(canonicalClientData:Data(text.utf8),expected:expected,nowMilliseconds:now)
            return try PendingRestore(scope:scope,challenge:challenge,signedAppTransaction:"合成app.jws",signedTransaction:"合成purchase.jws",assertion:assertion,nowMilliseconds:now)
        }
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-flow-synthetic-"+UUID().uuidString,isDirectory:true)
        defer { try? FileManager.default.removeItem(at:root) }
        let key=SymmetricKey(data:Data(repeating:7,count:32)),record=try pending(UUID())
        let claims=try JSONSerialization.data(withJSONObject:["sub":user.uuidString.lowercased(),"session_id":session.uuidString.lowercased(),"exp":1799999999]).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        let captured=AppAttestRegistrationSession(scope:record.scope,bearer:"e30."+claims+".c2ln")
        let http=FlowHTTP(),storage=PendingRestoreStorage(root:root,keyProvider:{ _,_ in key })
        @Sendable func flow() -> SandboxRestoreFlow { SandboxRestoreFlow(storage:PendingRestoreStorage(root:root,keyProvider:{ _,_ in key }),currentSession:{ captured },transport:{ sent in
            if sent.url!.lastPathComponent == "commit" {
                let stored=try await storage.read(scope:captured.scope)
                let body=try JSONSerialization.jsonObject(with:sent.httpBody!) as! [String:String]
                precondition(stored?.challenge.requestID.uuidString.lowercased() == body["requestID"],"Encrypted staging must precede HTTP")
            }
            return try await http.send(sent)
        },now:{ now }) }
        let producer:SandboxRestoreFlow.Producer={ identity,id in precondition(identity == captured);await http.produced();return try pending(id) }
        let first=try await flow().startOrResume(captured:captured,producer:producer);precondition(first == .pending)
        let initial=try await storage.read(scope:captured.scope)!;let initialID=initial.challenge.requestID
        let restart=try await flow().startOrResume(captured:captured,producer:producer);precondition(restart == .pending)
        let counts=await http.counts();precondition(counts == [1,1,2,0,2],"Restart must not produce/resend")
        let beforeFailure=await http.counts()
        await http.modes(lostProcess:true)
        await refused { _ = try await flow().refresh(captured:captured) }
        let retainedProcess=try await storage.read(scope:captured.scope);precondition(retainedProcess == initial)
        let afterFailure=await http.counts();precondition(afterFailure[0] == beforeFailure[0] && afterFailure[1] == beforeFailure[1] && afterFailure[4] == beforeFailure[4]+1)
        await http.modes(unknown:true)
        await refused { _ = try await flow().startOrResume(captured:captured,producer:producer) }
        let noUnknownDispatch=await http.counts();precondition(noUnknownDispatch[4] == afterFailure[4],"Missing status must not dispatch")
        let afterUnknown=try await storage.read(scope:captured.scope);precondition(afterUnknown == initial)
        await refused { _ = try await flow().cancelUnreserved(captured:captured) }
        let afterReserved=try await storage.read(scope:captured.scope);precondition(afterReserved == initial)
        await http.modes(lostCancel:true,reserved:false)
        await refused { _ = try await flow().cancelUnreserved(captured:captured) }
        let afterLostCancel=try await storage.read(scope:captured.scope);precondition(afterLostCancel == initial)
        let cancelled=try await flow().cancelUnreserved(captured:captured);precondition(cancelled == .cancelled)
        let absent=try await storage.read(scope:captured.scope);precondition(absent == nil)
        let beforeNew=await http.counts();precondition(beforeNew[0] == 1 && beforeNew[1] == 1,"Cancellation cannot produce a replacement")
        let new=try await flow().startOrResume(captured:captured,producer:producer);precondition(new == .pending)
        let replacement=try await storage.read(scope:captured.scope)!;precondition(replacement.challenge.requestID != initialID)
        await http.modes(processComplete:true)
        let completed=try await flow().refresh(captured:captured);precondition(completed == .complete)
        let afterComplete=try await storage.read(scope:captured.scope);precondition(afterComplete == nil)
        let endCounts=await http.counts()
        let empty=try await flow().refresh(captured:captured);precondition(empty == .absent)
        let noCalls=await http.counts();precondition(noCalls == endCounts)
        await http.modes(lostCommit:true)
        await refused { _ = try await flow().startOrResume(captured:captured,producer:producer) }
        let lost=try await storage.read(scope:captured.scope);precondition(lost != nil)
        let lostCounts=await http.counts()
        let resumed=try await flow().startOrResume(captured:captured,producer:producer);precondition(resumed == .pending)
        let recoveredCounts=await http.counts();precondition(recoveredCounts[0] == lostCounts[0] && recoveredCounts[1] == lostCounts[1])
        await http.modes(reserved:false);_ = try await flow().cancelUnreserved(captured:captured)
        let pause=FlowPause(),held=flow()
        let concurrent=Task { try await held.startOrResume(captured:captured,producer:{ identity,id in await pause.hold();return try await producer(identity,id) }) }
        await pause.waitForEntry()
        await refused { _ = try await held.refresh(captured:captured) }
        await refused { _ = try await held.cancelUnreserved(captured:captured) }
        await pause.proceed();let pendingResult=try await concurrent.value;precondition(pendingResult == .pending)
        let info:[String:Any]=["OUCHI_SANDBOX_RESTORE_ENABLED":true,"OUCHI_APP_ATTEST_REGISTRATION_ENABLED":true,"OUCHI_APP_ATTEST_APP_ID":"SYNTHETIC1.dev.synthetic.ouchi","OUCHI_APP_ATTEST_ENVIRONMENT":"development","OUCHI_APP_ATTEST_REFERENCE_RETENTION_SECONDS":300]
        let disabled=try SandboxRestoreFlow.configuration(info:[:],bundleIdentifier:"dev.synthetic.ouchi",purchaseEnvironment:.sandbox,isolatedDevelopment:false);precondition(disabled == nil)
        let config=try SandboxRestoreFlow.configuration(info:info,bundleIdentifier:"dev.synthetic.ouchi",purchaseEnvironment:.sandbox,isolatedDevelopment:false);precondition(config != nil)
        for (environment,isolated) in [(BillingEnvironment.production,false),(.sandbox,true)] {
            await refused { _ = try SandboxRestoreFlow.configuration(info:info,bundleIdentifier:"dev.synthetic.ouchi",purchaseEnvironment:environment,isolatedDevelopment:isolated) }
        }
        var malformed=info;malformed["OUCHI_SANDBOX_RESTORE_ENABLED"]="true"
        do { _ = try SandboxRestoreFlow.configuration(info:malformed,bundleIdentifier:"dev.synthetic.ouchi",purchaseEnvironment:.sandbox,isolatedDevelopment:false);fatalError("String flag accepted") } catch {}
        print("PASS: one native flow stages once, resumes exact proof after restart/lost ack, dispatches only after scoped pending status, retains unknown process response, retains unknown/reserved cancellation, removes exact unreserved proof and requires fresh user action/new ID; concurrent actions refused, complete remains process-only, disabled/Production/loopback gates. Synthetic encrypted key/Auth/HTTP only; no live UI/device/Apple/rights.")
    }
}
