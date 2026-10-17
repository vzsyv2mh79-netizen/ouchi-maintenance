import Foundation
import CryptoKit
import OuchiCore

actor RecoveryFixture {
    var session: AppAttestRegistrationSession?
    var failCommit = true, failReceipt = true, changeAtCommit = false
    var bodies: [Data] = []
    let receiptFile: URL, pendingFile: URL
    init(session: AppAttestRegistrationSession, receiptFile: URL, pendingFile: URL) {
        self.session = session; self.receiptFile = receiptFile; self.pendingFile = pendingFile
    }
    func current() -> AppAttestRegistrationSession? { session }
    func mode(commit: Bool, receipt: Bool, change: Bool = false) { failCommit = commit; failReceipt = receipt; changeAtCommit = change }
    func restore(_ session: AppAttestRegistrationSession) { self.session = session }
    func transport(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        bodies.append(request.httpBody!)
        if changeAtCommit { session = nil }
        if failCommit { throw URLError(.networkConnectionLost) }
        let object = try JSONSerialization.jsonObject(with:request.httpBody!) as! [String:String]
        let scope = AppAttestRecoverySmoke.scope
        let data = try JSONSerialization.data(withJSONObject:["requestID":object["requestID"]!,"userID":scope.userID.uuidString.lowercased(),"sessionID":scope.sessionID.uuidString.lowercased(),"epochID":scope.epochID.uuidString.lowercased(),"keyID":scope.keyID,"appID":scope.appID,"attestEnvironment":scope.environment,"registered":true])
        return (data,HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
    }
    func write(_ receipt: AppAttestRegistrationReceipt) throws {
        precondition(FileManager.default.fileExists(atPath:pendingFile.path),"proof cannot be removed before durable acknowledgement")
        if failReceipt { throw CloudError.unavailable }
        // Actual synthetic file write; this is not the future key-reference format.
        try Data(receipt.requestID.uuidString.utf8).write(to:receiptFile,options:.atomic)
        precondition(tryReadReceipt() == receipt.requestID.uuidString)
    }
    func tryReadReceipt() -> String? { try? String(contentsOf:receiptFile,encoding:.utf8) }
    func sent() -> [Data] { bodies }
}
@main struct AppAttestRecoverySmoke {
    static let now: Int64 = 1_791_727_200_000
    static let scope = AppAttestRegistrationScope(userID:UUID(uuidString:"11111111-1111-4111-8111-111111111111")!,sessionID:UUID(uuidString:"22222222-2222-4222-8222-222222222222")!,epochID:UUID(uuidString:"33333333-3333-4333-8333-333333333333")!,keyID:Data(repeating:1,count:32).base64EncodedString(),appID:"SYNTHETIC1.dev.synthetic.ouchi",environment:"production")
    static func refused(_ f: @Sendable () async throws -> Void) async { do { try await f(); fatalError("unsafe recovery accepted") } catch {} }
    static func main() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-recovery-synthetic-"+UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:root) }
        let claims = try JSONSerialization.data(withJSONObject:["sub":scope.userID.uuidString,"session_id":scope.sessionID.uuidString,"exp":Double(now+3600000)/1000])
        let token = claims.base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        let session = AppAttestRegistrationSession(scope:scope,bearer:"e30."+token+".synthetic")
        let requestID = "44444444-4444-4444-8444-444444444444"
        let nonce = Data(repeating:3,count:32).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        let text = "{\"version\":1,\"purpose\":\"register_ouchi_attested_key\",\"nonce\":\"\(nonce)\",\"issuedAt\":\(now),\"expiresAt\":\(now+300000),\"userID\":\"\(scope.userID.uuidString.lowercased())\",\"sessionID\":\"\(scope.sessionID.uuidString.lowercased())\",\"epochID\":\"\(scope.epochID.uuidString.lowercased())\",\"requestID\":\"\(requestID)\",\"keyID\":\"\(scope.keyID)\",\"appID\":\"\(scope.appID)\",\"attestEnvironment\":\"\(scope.environment)\"}"
        let challenge = try AppAttestRegistrationChallenge.parse(canonicalClientData:Data(text.utf8),expected:scope,nowMilliseconds:now)
        let proof = Data("opaque-synthetic-proof".utf8)
        let value = try AppAttestPendingRegistration(scope:scope,challenge:challenge,attestation:proof,nowMilliseconds:now)
        let key = SymmetricKey(data:Data(repeating:7,count:32))
        let storage = AppAttestPendingRegistrationStorage(root:root,keyProvider:{ _,_ in key })
        try await storage.stage(value,nowMilliseconds:now)
        let file = root.appendingPathComponent(scope.userID.uuidString.lowercased()).appendingPathComponent(scope.epochID.uuidString.lowercased()+".attest-pending")
        let original = try Data(contentsOf:file)
        let fixture = RecoveryFixture(session:session,receiptFile:root.appendingPathComponent("synthetic-receipt"),pendingFile:file)
        let api = AppAttestRegistrationAPI(currentSession:{ await fixture.current() },transport:{ try await fixture.transport($0) },now:{ now })
        let recovery: @Sendable () -> AppAttestRegistrationRecovery = {
            AppAttestRegistrationRecovery(storage:storage,api:api,currentSession:{ await fixture.current() },persistReceipt:{ try await fixture.write($0) },now:{ now })
        }
        await refused { _ = try await recovery().resume(captured:session) }
        let afterNetwork = try Data(contentsOf:file); precondition(afterNetwork == original)
        await fixture.mode(commit:false,receipt:true)
        await refused { _ = try await recovery().resume(captured:session) }
        let afterReceiptFailure = try Data(contentsOf:file); precondition(afterReceiptFailure == original)
        await fixture.mode(commit:false,receipt:false,change:true)
        await refused { _ = try await recovery().resume(captured:session) }
        let afterChange = try Data(contentsOf:file); precondition(afterChange == original)
        await fixture.restore(session); await fixture.mode(commit:false,receipt:false)
        let completed = try await recovery().resume(captured:session)
        precondition(completed?.requestID == challenge.requestID && !FileManager.default.fileExists(atPath:file.path))
        let durable = await fixture.tryReadReceipt(); precondition(durable == challenge.requestID.uuidString)
        let bodies = await fixture.sent(); precondition(bodies.count == 4 && bodies.allSatisfy { $0 == bodies[0] })
        let absent = try await recovery().resume(captured:session); precondition(absent == nil)
        let count = await fixture.sent().count; precondition(count == 4)
        try await storage.stage(value,nowMilliseconds:now)
        let cancelled = Task {
            while !Task.isCancelled { await Task.yield() }
            return try await recovery().resume(captured:session)
        }; cancelled.cancel()
        await refused { _ = try await cancelled.value }
        precondition(FileManager.default.fileExists(atPath:file.path))
        print("PASS: actual encrypted synthetic retry file survives lost response, receipt-write failure and session change; exact HTTP proof retries, durable synthetic acknowledgement precedes removal, missing proof avoids HTTP and cancellation preserves pending state. Mock server only; no Apple trust or purchase grant.")
    }
}
