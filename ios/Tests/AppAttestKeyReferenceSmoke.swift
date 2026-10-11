import Foundation
import Security
import LocalAuthentication
import CryptoKit
import OuchiCore

final class SyntheticReferenceKeychain: @unchecked Sendable {
    private let lock=NSLock()
    private var items:[String:[String:Any]]=[:]
    var unavailable=false, corrupt=false, weak=false, failedDelete=false
    var conflict:Data?
    private func identity(_ q:[String:Any])->String { (q[kSecAttrService as String] as! String)+"|"+(q[kSecAttrAccount as String] as! String) }
    private func check(_ q:[String:Any]) {
        precondition((q[kSecAttrService as String] as! String).contains(".attest-reference.v1."))
        precondition(q[kSecClass as String] as? String == kSecClassGenericPassword as String)
        precondition(q[kSecUseDataProtectionKeychain as String] as? Bool == true)
        precondition(q[kSecAttrSynchronizable as String] as? Bool == false)
        precondition((q[kSecUseAuthenticationContext as String] as? LAContext)?.interactionNotAllowed==true)
        precondition(q[kSecAttrAccessGroup as String]==nil)
    }
    var operations:AppAttestEncryptionKeyStorage.Operations {
        .init(copy:{ [self] q in
            lock.lock();defer { lock.unlock() };check(q)
            if unavailable { return (errSecInteractionNotAllowed,nil) }
            let service=q[kSecAttrService as String] as! String
            let found=q[kSecAttrAccount as String]==nil ? items.values.first(where:{ $0[kSecAttrService as String] as? String == service }) : items[identity(q)]
            guard var item=found else { return (errSecItemNotFound,nil) }
            if corrupt { item[kSecValueData as String]=Data("{}".utf8) }
            if weak { item[kSecAttrAccessible as String]=kSecAttrAccessibleWhenUnlocked }
            return (errSecSuccess,item)
        },add:{ [self] q in
            lock.lock();defer { lock.unlock() };check(q)
            precondition(q[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
            let id=identity(q);if items[id] != nil { return errSecDuplicateItem }
            var item=q
            if let conflict { item[kSecValueData as String]=conflict;items[id]=item;return errSecDuplicateItem }
            items[id]=item;return errSecSuccess
        },delete:{ [self] q in
            lock.lock();defer { lock.unlock() };check(q)
            if failedDelete { return errSecSuccess }
            let service=q[kSecAttrService as String] as! String
            items=items.filter { $0.value[kSecAttrService as String] as? String != service };return errSecSuccess
        },random:{ fatalError("key-reference storage must not create an encryption key") })
    }
    func snapshot()->[String:Data] { lock.lock();defer { lock.unlock() };return items.mapValues { $0[kSecValueData as String] as! Data } }
}
@main struct AppAttestKeyReferenceSmoke {
    static let now:Int64=1_791_727_200_000
    static let scope=AppAttestRegistrationScope(userID:UUID(uuidString:"11111111-1111-4111-8111-111111111111")!,sessionID:UUID(uuidString:"22222222-2222-4222-8222-222222222222")!,epochID:UUID(uuidString:"33333333-3333-4333-8333-333333333333")!,keyID:Data(repeating:1,count:32).base64EncodedString(),appID:"SYNTHETIC1.dev.synthetic.ouchi",environment:"production")
    static func refused(_ f:@Sendable () async throws->Void)async { do { try await f();fatalError("unsafe reference accepted") }catch {} }
    static func challenge(_ request:UUID) throws->AppAttestRegistrationChallenge {
        let nonce=Data(repeating:3,count:32).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        let text="{\"version\":1,\"purpose\":\"register_ouchi_attested_key\",\"nonce\":\"\(nonce)\",\"issuedAt\":\(now),\"expiresAt\":\(now+300000),\"userID\":\"\(scope.userID.uuidString.lowercased())\",\"sessionID\":\"\(scope.sessionID.uuidString.lowercased())\",\"epochID\":\"\(scope.epochID.uuidString.lowercased())\",\"requestID\":\"\(request.uuidString.lowercased())\",\"keyID\":\"\(scope.keyID)\",\"appID\":\"\(scope.appID)\",\"attestEnvironment\":\"\(scope.environment)\"}"
        return try AppAttestRegistrationChallenge.parse(canonicalClientData:Data(text.utf8),expected:scope,nowMilliseconds:now)
    }
    static func main()async throws {
        let fixture=SyntheticReferenceKeychain(),request=UUID()
        let store=try AppAttestKeyReferenceStorage(namespace:"dev.synthetic.ouchi",operations:fixture.operations)
        let reference=try AppAttestKeyReference(scope:scope,requestID:request,createdAtMilliseconds:now,retainUntilMilliseconds:now+3600000)
        let absent=try store.generated(account:scope.userID,epoch:scope.epochID,nowMilliseconds:now);precondition(absent==nil && fixture.snapshot().isEmpty)
        try store.persistGenerated(reference,nowMilliseconds:now)
        let initial=fixture.snapshot()
        let restarted=try AppAttestKeyReferenceStorage(namespace:"dev.synthetic.ouchi",operations:fixture.operations)
        try restarted.persistGenerated(reference,nowMilliseconds:now+1);precondition(fixture.snapshot()==initial)
        let recovered=try restarted.generated(account:scope.userID,epoch:scope.epochID,nowMilliseconds:now);precondition(recovered==reference)
        let changed=try AppAttestKeyReference(scope:scope,requestID:UUID(),createdAtMilliseconds:now,retainUntilMilliseconds:now+3600000)
        await refused { try restarted.persistGenerated(changed,nowMilliseconds:now) };precondition(fixture.snapshot()==initial)
        let extended=try AppAttestKeyReference(scope:scope,requestID:request,createdAtMilliseconds:now,retainUntilMilliseconds:now+7200000)
        await refused { try restarted.persistGenerated(extended,nowMilliseconds:now) };precondition(fixture.snapshot()==initial)
        fixture.unavailable=true;await refused { _ = try store.generated(account:scope.userID,epoch:scope.epochID,nowMilliseconds:now) };fixture.unavailable=false
        fixture.corrupt=true;await refused { try store.persistGenerated(reference,nowMilliseconds:now) };fixture.corrupt=false
        fixture.weak=true;await refused { _ = try store.generated(account:scope.userID,epoch:scope.epochID,nowMilliseconds:now) };fixture.weak=false
        await refused { _ = try store.generated(account:scope.userID,epoch:scope.epochID,nowMilliseconds:now+3600000) };precondition(fixture.snapshot()==initial,"expiry refuses use but must not silently reset an uncertain registration")
        let claims=try JSONSerialization.data(withJSONObject:["sub":scope.userID.uuidString,"session_id":scope.sessionID.uuidString,"exp":Double(now+7200000)/1000])
        let token=claims.base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        let session=AppAttestRegistrationSession(scope:scope,bearer:"e30."+token+".synthetic")
        let api=AppAttestRegistrationAPI(currentSession:{ session },transport:{ r in
            let body=try JSONSerialization.jsonObject(with:r.httpBody!) as! [String:String]
            let data=try JSONSerialization.data(withJSONObject:["requestID":body["requestID"]!,"userID":scope.userID.uuidString.lowercased(),"sessionID":scope.sessionID.uuidString.lowercased(),"epochID":scope.epochID.uuidString.lowercased(),"keyID":scope.keyID,"appID":scope.appID,"attestEnvironment":scope.environment,"registered":true])
            return (data,HTTPURLResponse(url:r.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
        },now:{ now })
        let wrong=try await api.commit(challenge(UUID()),attestation:Data([1]),captured:session)
        await refused { try store.confirm(wrong,nowMilliseconds:now) };precondition(fixture.snapshot()==initial)
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-key-reference-recovery-synthetic-"+UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:root) }
        let storage=AppAttestPendingRegistrationStorage(root:root,keyProvider:{ _,_ in SymmetricKey(data:Data(repeating:7,count:32)) })
        let proof=try AppAttestPendingRegistration(scope:scope,challenge:challenge(request),attestation:Data("opaque-synthetic-proof".utf8),nowMilliseconds:now)
        try await storage.stage(proof,nowMilliseconds:now)
        let recovery=AppAttestRegistrationRecovery(storage:storage,api:api,currentSession:{ session },references:restarted,now:{ now })
        let receipt=try await recovery.resume(captured:session);precondition(receipt?.requestID==request)
        let confirmed=try store.confirmed(account:scope.userID,epoch:scope.epochID,nowMilliseconds:now);precondition(confirmed==reference)
        let pending=try await storage.read(scope:scope,nowMilliseconds:now);precondition(pending==nil)
        let afterConfirm=fixture.snapshot();try store.confirm(receipt!,nowMilliseconds:now+1);precondition(fixture.snapshot()==afterConfirm)
        let foreignScope=AppAttestRegistrationScope(userID:UUID(),sessionID:UUID(),epochID:UUID(),keyID:scope.keyID,appID:scope.appID,environment:scope.environment)
        let foreign=try AppAttestKeyReference(scope:foreignScope,requestID:UUID(),createdAtMilliseconds:now,retainUntilMilliseconds:now+3600000)
        try store.persistGenerated(foreign,nowMilliseconds:now)
        fixture.failedDelete=true;await refused { try store.erase(account:scope.userID) };fixture.failedDelete=false
        try store.erase(account:scope.userID);try store.erase(account:scope.userID)
        let survived=try store.generated(account:foreign.userID,epoch:foreign.epochID,nowMilliseconds:now);precondition(survived==foreign)
        await refused { _ = try AppAttestKeyReference(scope:scope,requestID:request,createdAtMilliseconds:now,retainUntilMilliseconds:now+7_776_000_001) }
        let closure=try AppAttestAccountClosure(accountID:scope.userID,requestID:UUID(),createdAtMilliseconds:now,retainUntilMilliseconds:now+3600000)
        let started=try store.beginClosure(closure);precondition(started==closure)
        let closureSnapshot=fixture.snapshot()
        let replacement=try AppAttestAccountClosure(accountID:scope.userID,requestID:UUID(),createdAtMilliseconds:now+1,retainUntilMilliseconds:now+7200000)
        let retried=try restarted.beginClosure(replacement);precondition(retried==closure && fixture.snapshot()==closureSnapshot)
        try store.erase(account:scope.userID)
        let retained=try restarted.pendingClosure(account:scope.userID);precondition(retained==closure)
        fixture.unavailable=true;await refused { _ = try restarted.pendingClosure(account:scope.userID) };fixture.unavailable=false
        fixture.corrupt=true;await refused { _ = try restarted.beginClosure(replacement) };fixture.corrupt=false
        fixture.weak=true;await refused { _ = try restarted.pendingClosure(account:scope.userID) };fixture.weak=false
        precondition(fixture.snapshot()==closureSnapshot)
        await refused { _ = try AppAttestAccountClosure(accountID:scope.userID,requestID:UUID(),createdAtMilliseconds:now,retainUntilMilliseconds:now+7_776_000_001) }
        print("PASS: injected device-only key-reference storage survives restart, refuses conflicting/extended/expired/corrupt/locked records, requires matching receipt, persists real structured confirmation before encrypted proof removal and confirms account-only erasure. Mock HTTP and synthetic Keychain only; no Apple trust or purchase.")
    }
}
