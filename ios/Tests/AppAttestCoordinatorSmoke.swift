import Foundation
import Security
import LocalAuthentication
import OuchiCore

final class ClosureSyntheticSessionStorage: SessionStorage, @unchecked Sendable {
    private let lock=NSLock();private var data:Data?
    init(_ data:Data?) { self.data=data }
    func read()->Data? { lock.withLock { data } }
    func write(_ data:Data?) { lock.withLock { self.data=data } }
}

final class CoordinatorSyntheticKeychain: @unchecked Sendable {
    private let lock=NSLock();private var items:[String:[String:Any]]=[:]
    private var failClosureDeletion=false
    func failClosureErase(_ value:Bool) { lock.withLock { failClosureDeletion=value } }
    private func identity(_ q:[String:Any])->String { (q[kSecAttrService as String] as! String)+"|"+(q[kSecAttrAccount as String] as! String) }
    private func check(_ q:[String:Any]) {
        precondition(q[kSecClass as String] as? String == kSecClassGenericPassword as String)
        precondition(q[kSecAttrSynchronizable as String] as? Bool == false && q[kSecUseDataProtectionKeychain as String] as? Bool == true)
        precondition((q[kSecUseAuthenticationContext as String] as? LAContext)?.interactionNotAllowed==true)
    }
    var operations:AppAttestEncryptionKeyStorage.Operations {
        .init(copy:{ [self] q in
            lock.lock();defer { lock.unlock() };check(q)
            let service=q[kSecAttrService as String] as! String
            let value=q[kSecAttrAccount as String]==nil ? items.values.first(where:{ $0[kSecAttrService as String] as? String == service }) : items[identity(q)]
            return value==nil ? (errSecItemNotFound,nil) : (errSecSuccess,value)
        },add:{ [self] q in
            lock.lock();defer { lock.unlock() };check(q)
            precondition(q[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
            let id=identity(q);if items[id] != nil { return errSecDuplicateItem };items[id]=q;return errSecSuccess
        },delete:{ [self] q in
            lock.lock();defer { lock.unlock() };check(q)
            let service=q[kSecAttrService as String] as! String
            if failClosureDeletion && service.contains(".closing.") { return errSecSuccess }
            items=items.filter { item in
                if item.value[kSecAttrService as String] as? String != service { return true }
                if let account = q[kSecAttrAccount as String] as? String { return item.value[kSecAttrAccount as String] as? String != account }
                return false
            };return errSecSuccess
        },random:{ Data(repeating:7,count:32) })
    }
    func count()->Int { lock.lock();defer { lock.unlock() };return items.count }
    func registrationCount()->Int {
        lock.lock();defer { lock.unlock() }
        return items.values.filter { !($0[kSecAttrService as String] as! String).contains(".closing.") }.count
    }
}
final class CoordinatorSyntheticDevice: @unchecked Sendable {
    private let lock=NSLock();private var generated=0,attested=0
    private var delayed:AppAttestDeviceService.ProofCompletion?
    private var readyWaiters:[CheckedContinuation<Void,Never>]=[]
    var delay=false,failGeneration=false
    static let key=Data(repeating:1,count:32).base64EncodedString()
    static let proof=Data("opaque-coordinator-synthetic-proof".utf8)
    var operations:AppAttestDeviceService.Operations {
        .init(supported:{ true },generate:{ [self] done in
            lock.lock();generated+=1;let failure=failGeneration;lock.unlock()
            if failure { done(nil,URLError(.networkConnectionLost)) }else { done(Self.key,nil) }
        },attest:{ [self] key,hash,done in
            precondition(key==Self.key && hash.count==32)
            lock.lock();attested+=1
            if delay {
                delayed=done;let waiters=readyWaiters;readyWaiters=[];lock.unlock()
                for waiter in waiters { waiter.resume() }
            }else { lock.unlock();done(Self.proof,nil) }
        })
    }
    func waitForAttestation()async {
        await withCheckedContinuation { continuation in
            lock.lock()
            if delayed != nil { lock.unlock();continuation.resume() }
            else { readyWaiters.append(continuation);lock.unlock() }
        }
    }
    func finishAttestation() {
        lock.lock();let callback=delayed;delayed=nil;lock.unlock()
        precondition(callback != nil);callback!(Self.proof,nil)
    }
    func counts()->(Int,Int) { lock.lock();defer { lock.unlock() };return (generated,attested) }
}
actor CoordinatorSyntheticHTTP {
    let context:AppAttestRegistrationContext,references:AppAttestKeyReferenceStorage,pending:AppAttestPendingRegistrationStorage
    var failCommit=true,challengeCount=0,commitBodies:[Data]=[]
    init(context:AppAttestRegistrationContext,references:AppAttestKeyReferenceStorage,pending:AppAttestPendingRegistrationStorage) {
        self.context=context;self.references=references;self.pending=pending
    }
    func allowCommit() { failCommit=false }
    func counts()->(Int,Int) { (challengeCount,commitBodies.count) }
    func requests()->[Data] { commitBodies }
    func send(_ request:URLRequest)async throws->(Data,HTTPURLResponse) {
        let body=try JSONSerialization.jsonObject(with:request.httpBody!) as! [String:String]
        let reference=try references.generated(account:context.userID,epoch:context.epochID,nowMilliseconds:AppAttestCoordinatorSmoke.now)!
        precondition(body["requestID"]==reference.requestID.uuidString.lowercased() && body["keyID"]==reference.keyID,"key/reference must persist before HTTP")
        let data:Data
        if request.url!.lastPathComponent=="challenge" {
            challengeCount+=1
            data=try JSONSerialization.data(withJSONObject:["clientDataBase64":AppAttestCoordinatorSmoke.clientData(reference).base64EncodedString()])
        }else {
            let staged=try await pending.read(scope:reference.scope,nowMilliseconds:AppAttestCoordinatorSmoke.now)
            precondition(staged?.attestation==CoordinatorSyntheticDevice.proof,"proof must be encrypted before commit HTTP")
            commitBodies.append(request.httpBody!)
            if failCommit { throw URLError(.networkConnectionLost) }
            let scope=reference.scope
            data=try JSONSerialization.data(withJSONObject:["requestID":reference.requestID.uuidString.lowercased(),"userID":scope.userID.uuidString.lowercased(),"sessionID":scope.sessionID.uuidString.lowercased(),"epochID":scope.epochID.uuidString.lowercased(),"keyID":scope.keyID,"appID":scope.appID,"attestEnvironment":scope.environment,"registered":true])
        }
        return (data,HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
    }
}
@main struct AppAttestCoordinatorSmoke {
    static let now:Int64=1_791_727_200_000
    static func refused(_ action:@Sendable ()async throws->Void)async { do { try await action();fatalError("unsafe coordinator accepted") }catch {} }
    static func clientData(_ reference:AppAttestKeyReference)->Data {
        let nonce=Data(repeating:3,count:32).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        let s=reference.scope
        return Data("{\"version\":1,\"purpose\":\"register_ouchi_attested_key\",\"nonce\":\"\(nonce)\",\"issuedAt\":\(now),\"expiresAt\":\(now+300000),\"userID\":\"\(s.userID.uuidString.lowercased())\",\"sessionID\":\"\(s.sessionID.uuidString.lowercased())\",\"epochID\":\"\(s.epochID.uuidString.lowercased())\",\"requestID\":\"\(reference.requestID.uuidString.lowercased())\",\"keyID\":\"\(s.keyID)\",\"appID\":\"\(s.appID)\",\"attestEnvironment\":\"\(s.environment)\"}".utf8)
    }
    static func context()throws->AppAttestRegistrationContext {
        let user=UUID(),session=UUID(),epoch=UUID()
        let claims=try JSONSerialization.data(withJSONObject:["sub":user.uuidString,"session_id":session.uuidString,"exp":Double(now+7200000)/1000])
        let token=claims.base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        return .init(userID:user,sessionID:session,epochID:epoch,appID:"SYNTHETIC1.dev.synthetic.ouchi",environment:"production",bearer:"e30."+token+".synthetic")
    }
    static func main()async throws {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-coordinator-synthetic-"+UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:root) }
        let keychain=CoordinatorSyntheticKeychain(),device=CoordinatorSyntheticDevice(),captured=try context()
        let keys=try AppAttestEncryptionKeyStorage(namespace:"dev.synthetic.ouchi",operations:keychain.operations)
        let references=try AppAttestKeyReferenceStorage(namespace:"dev.synthetic.ouchi",operations:keychain.operations)
        let pending=AppAttestPendingRegistrationStorage(root:root,keyProvider:{ account,epoch in
            guard let key=try keys.read(account:account,epoch:epoch) else { throw CloudError.unavailable };return key
        }, expiryAuthorization: { scope, clock in
            if let reference = try references.generated(account: scope.userID, epoch: scope.epochID, nowMilliseconds: clock) { return reference.scope == scope }
            if let reference = try references.confirmed(account: scope.userID, epoch: scope.epochID, nowMilliseconds: clock) { return reference.scope == scope }
            return false
        })
        let http=CoordinatorSyntheticHTTP(context:captured,references:references,pending:pending)
        let coordinator=try AppAttestRegistrationCoordinator(currentContext:{ captured },device:AppAttestDeviceService(operations:device.operations),encryptionKeys:keys,references:references,pending:pending,retentionMilliseconds:3600000,transport:{ try await http.send($0) },now:{ now })
        await refused { _ = try await coordinator.register(captured:captured) }
        precondition(device.counts()==(1,1))
        let retainedLive = try await coordinator.pruneExpiredPending(captured: captured)
        precondition(retainedLive == 0 && device.counts() == (1,1), "maintenance must not call DeviceCheck")
        let maintenanceCounts = await http.counts(); precondition(maintenanceCounts == (1,1), "maintenance must not issue a challenge or commit")
        let reference=try references.generated(account:captured.userID,epoch:captured.epochID,nowMilliseconds:now)!
        let staged=try await pending.read(scope:reference.scope,nowMilliseconds:now);precondition(staged?.attestation==CoordinatorSyntheticDevice.proof)
        await http.allowCommit()
        let result=try await coordinator.register(captured:captured)
        guard case .newlyConfirmed(let receipt)=result else { fatalError("missing server acknowledgement") }
        precondition(receipt.scope==reference.scope && device.counts()==(1,1))
        let bodies=await http.requests();precondition(bodies.count==2 && bodies[0]==bodies[1])
        let existing=try await coordinator.register(captured:captured);precondition(existing == .recordedReference(reference))
        let counts=await http.counts();precondition(counts==(1,2))
        try await coordinator.closeAccount(account:captured.userID)
        precondition(keychain.registrationCount()==0)
        await refused { _ = try await coordinator.register(captured:captured) };precondition(device.counts()==(1,1))
        await refused { _ = try await coordinator.pruneExpiredPending(captured: captured) }

        // A known generation failure still has a durable intent. Restart-style
        // retries cannot automatically create another key with an unknown result.
        let uncertain=try context(),failing=CoordinatorSyntheticDevice();failing.failGeneration=true
        let makeUncertain:@Sendable ()throws->AppAttestRegistrationCoordinator = {
            try AppAttestRegistrationCoordinator(currentContext:{ uncertain },device:AppAttestDeviceService(operations:failing.operations),encryptionKeys:keys,references:references,pending:pending,retentionMilliseconds:3600000,transport:{ _ in fatalError("uncertain generation reached HTTP") },now:{ now })
        }
        await refused { _ = try await makeUncertain().register(captured:uncertain) }
        let intent=try references.generationIntent(account:uncertain.userID,epoch:uncertain.epochID);precondition(intent != nil)
        await refused { _ = try await makeUncertain().register(captured:uncertain) };precondition(failing.counts()==(1,0))
        try await makeUncertain().closeAccount(account:uncertain.userID)

        // Cancellation after the device callback started preserves the completed
        // proof, with no commit; closing the SAME actor then removes owned data.
        let cancelledContext=try context(),delayed=CoordinatorSyntheticDevice();delayed.delay=true
        let cancelledHTTP=CoordinatorSyntheticHTTP(context:cancelledContext,references:references,pending:pending)
        let cancellable=try AppAttestRegistrationCoordinator(currentContext:{ cancelledContext },device:AppAttestDeviceService(operations:delayed.operations),encryptionKeys:keys,references:references,pending:pending,retentionMilliseconds:3600000,transport:{ try await cancelledHTTP.send($0) },now:{ now })
        let registration=Task { try await cancellable.register(captured:cancelledContext) }
        await delayed.waitForAttestation()
        await refused { _ = try await cancellable.pruneExpiredPending(captured: cancelledContext) }
        registration.cancel();delayed.finishAttestation()
        await refused { _ = try await registration.value }
        let cancellationReference=try references.generated(account:cancelledContext.userID,epoch:cancelledContext.epochID,nowMilliseconds:now)!
        let cancelledProof=try await pending.read(scope:cancellationReference.scope,nowMilliseconds:now);precondition(cancelledProof?.attestation==CoordinatorSyntheticDevice.proof)
        let cancelledCounts=await cancelledHTTP.counts();precondition(cancelledCounts==(1,0))
        let staleMaintenance = try AppAttestRegistrationCoordinator(currentContext:{ nil },device:AppAttestDeviceService(operations:delayed.operations),encryptionKeys:keys,references:references,pending:pending,retentionMilliseconds:3600000,transport:{ _ in fatalError("maintenance reached HTTP") },now:{ now+300000 })
        await refused { _ = try await staleMaintenance.pruneExpiredPending(captured: cancelledContext) }
        let stillPending = try await pending.hasPendingRecord(account: cancelledContext.userID, epoch: cancelledContext.epochID); precondition(stillPending)
        let restartedMaintenance = try AppAttestRegistrationCoordinator(currentContext:{ cancelledContext },device:AppAttestDeviceService(operations:delayed.operations),encryptionKeys:keys,references:references,pending:pending,retentionMilliseconds:3600000,transport:{ _ in fatalError("maintenance reached HTTP") },now:{ now+300000 })
        let physicallyRemoved = try await restartedMaintenance.pruneExpiredPending(captured: cancelledContext)
        precondition(physicallyRemoved == 1 && delayed.counts() == (1,1))
        let missingProof = try await pending.hasPendingRecord(account: cancelledContext.userID, epoch: cancelledContext.epochID); precondition(!missingProof)
        let retainedReference = try references.generated(account: cancelledContext.userID, epoch: cancelledContext.epochID, nowMilliseconds: now+300000); precondition(retainedReference == cancellationReference)
        try await cancellable.closeAccount(account:cancelledContext.userID);precondition(keychain.registrationCount()==0)
        let cancelledClosure=try references.pendingClosure(account:cancelledContext.userID);precondition(cancelledClosure != nil)

        // Closing while Apple is still completing blocks HTTP and waits for
        // the active flow to finish before erasing its newly staged record.
        let closingContext=try context(),closingDevice=CoordinatorSyntheticDevice();closingDevice.delay=true
        let closingHTTP=CoordinatorSyntheticHTTP(context:closingContext,references:references,pending:pending)
        let closing=try AppAttestRegistrationCoordinator(currentContext:{ closingContext },device:AppAttestDeviceService(operations:closingDevice.operations),encryptionKeys:keys,references:references,pending:pending,retentionMilliseconds:3600000,transport:{ try await closingHTTP.send($0) },now:{ now })
        let running=Task { try await closing.register(captured:closingContext) }
        await closingDevice.waitForAttestation()
        // A second coordinator/storage actor must share the process-wide lease.
        let separatePending = AppAttestPendingRegistrationStorage(root: root, keyProvider: { account, epoch in
            guard let key = try keys.read(account: account, epoch: epoch) else { throw CloudError.unavailable }; return key
        })
        let separate = try AppAttestRegistrationCoordinator(currentContext: { closingContext }, device: AppAttestDeviceService(operations: closingDevice.operations), encryptionKeys: keys, references: references, pending: separatePending, retentionMilliseconds: 3600000,
            transport: { _ in fatalError("overlapping coordinator reached network") }, now: { now })
        await refused { _ = try await separate.register(captured: closingContext) }
        await refused { _ = try await separate.pruneExpiredPending(captured: closingContext) }
        await refused { try await separate.closeAccount(account: closingContext.userID) }
        let overlappingClosure = try references.pendingClosure(account: closingContext.userID)
        precondition(overlappingClosure == nil, "refused competing cleanup must not mutate closure or keys")
        let duringCallback = try references.generated(account: closingContext.userID, epoch: closingContext.epochID, nowMilliseconds: now)
        precondition(duringCallback != nil && closingDevice.counts() == (1,1))
        await refused { _ = try await closing.register(captured:closingContext) }
        try await closing.stopAcceptingRegistration(account:closingContext.userID)
        let cleanup=Task { try await closing.closeAccount(account:closingContext.userID) }
        closingDevice.finishAttestation()
        await refused { _ = try await running.value };try await cleanup.value
        precondition(keychain.registrationCount()==0)
        let closure=try references.pendingClosure(account:closingContext.userID);precondition(closure != nil)
        let restarted=try AppAttestRegistrationCoordinator(currentContext:{ closingContext },device:AppAttestDeviceService(operations:closingDevice.operations),encryptionKeys:keys,references:references,pending:pending,retentionMilliseconds:3600000,transport:{ _ in fatalError("closed account reached HTTP after restart") },now:{ now+3600001 })
        await refused { _ = try await restarted.register(captured:closingContext) }
        try await restarted.closeAccount(account:closingContext.userID)
        let original=try references.pendingClosure(account:closingContext.userID);precondition(original==closure,"retry must not extend closure deadline")
        let remaining=try await pending.hasPendingRecord(account:closingContext.userID,epoch:closingContext.epochID);precondition(!remaining)
        let closingCounts=await closingHTTP.counts();precondition(closingCounts==(1,0))
        let sessionData=try JSONSerialization.data(withJSONObject:["access_token":"synthetic","refresh_token":"synthetic","expires_at":2000000000,"user":["id":closingContext.userID.uuidString]])
        let config=try CloudConfiguration(url:URL(string:"https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!,publishableKey:"sb_publishable_synthetic_test_only")
        let sessionAPI=HouseholdAPI(config:config) { _ in fatalError("local closure test reached Auth") }
        let localSession=SessionController(api:sessionAPI,storage:ClosureSyntheticSessionStorage(sessionData))
        _ = try await localSession.restore()
        let confirmation=try await localSession.signOutConfirmed(expectedAccount:closingContext.userID)
        let foreignController=SessionController(api:sessionAPI,storage:ClosureSyntheticSessionStorage(nil))
        await refused { try await restarted.completeLocalClosure(confirmation:confirmation,session:foreignController) }
        let preserved=try references.pendingClosure(account:closingContext.userID);precondition(preserved==closure)
        keychain.failClosureErase(true)
        await refused { try await restarted.completeLocalClosure(confirmation:confirmation,session:localSession) }
        let afterFalseErase=try references.pendingClosure(account:closingContext.userID);precondition(afterFalseErase==closure)
        keychain.failClosureErase(false)
        try await restarted.completeLocalClosure(confirmation:confirmation,session:localSession)
        let removed=try references.pendingClosure(account:closingContext.userID);precondition(removed==nil)
        await refused { _ = try await restarted.register(captured:closingContext) }
        // A foreign-controller proof must not poison a fresh instance after
        // another instance has completed the durable closure.
        let fresh = try AppAttestRegistrationCoordinator(currentContext: { closingContext },
            device: AppAttestDeviceService(operations: closingDevice.operations),
            encryptionKeys: keys, references: references, pending: pending,
            retentionMilliseconds: 3600000,
            transport: { _ in fatalError("rejected closure reached HTTP") }, now: { now })
        await refused { try await fresh.completeLocalClosure(confirmation: confirmation, session: foreignController) }
        let untouched = try await fresh.pruneExpiredPending(captured: closingContext)
        precondition(untouched == 0, "invalid proof must not disable unrelated future maintenance")
        // The coordinator-free path uses the same session-bound finalizer.
        let fallbackClosure = try references.beginClosure(AppAttestAccountClosure(
            accountID: closingContext.userID, requestID: UUID(), createdAtMilliseconds: now,
            retainUntilMilliseconds: now + 3600000))
        await refused { try await references.completeLocalClosure(confirmation: confirmation,
            session: foreignController, pending: pending, encryptionKeys: keys) }
        let fallbackPreserved = try references.pendingClosure(account: closingContext.userID)
        precondition(fallbackPreserved == fallbackClosure)
        keychain.failClosureErase(true)
        await refused { try await references.completeLocalClosure(confirmation: confirmation,
            session: localSession, pending: pending, encryptionKeys: keys) }
        let retryPreserved = try references.pendingClosure(account: closingContext.userID)
        precondition(retryPreserved == fallbackClosure)
        keychain.failClosureErase(false)
        try await references.completeLocalClosure(confirmation: confirmation,
            session: localSession, pending: pending, encryptionKeys: keys)
        let fallbackRemoved = try references.pendingClosure(account: closingContext.userID)
        precondition(fallbackRemoved == nil)
        let staleClosure = try references.beginClosure(fallbackClosure)
        try await localSession.signOut()
        await refused { try await references.completeLocalClosure(confirmation: confirmation,
            session: localSession, pending: pending, encryptionKeys: keys) }
        let stalePreserved = try references.pendingClosure(account: closingContext.userID)
        precondition(stalePreserved == staleClosure)
        // Restart with empty durable credentials can finish ONLY the exact
        // existing closure; failure retains that intent for explicit retry.
        let restartedEmpty = SessionController(api: sessionAPI, storage: ClosureSyntheticSessionStorage(nil))
        let restoredStorage = ClosureSyntheticSessionStorage(sessionData)
        let restoredLogin = SessionController(api: sessionAPI, storage: restoredStorage)
        await refused { try await references.recoverAbandonedLocalClosure(expected: staleClosure,
            session: restoredLogin, pending: pending, encryptionKeys: keys) }
        let stillRetained = try references.pendingClosure(account: closingContext.userID)
        precondition(stillRetained == staleClosure)
        let absentPermit = try await restartedEmpty.prepareLocalClosureRecovery(accountID: closingContext.userID)
        await refused { try await foreignController.withLocalClosureRecovery(absentPermit) {} }
        let wrongIntent = try AppAttestAccountClosure(accountID: closingContext.userID,
            requestID: UUID(), createdAtMilliseconds: now, retainUntilMilliseconds: now + 3600000)
        await refused { try await references.recoverAbandonedLocalClosure(expected: wrongIntent,
            session: restartedEmpty, pending: pending, encryptionKeys: keys) }
        let replacementStorage = ClosureSyntheticSessionStorage(nil)
        let replacementSession = SessionController(api: sessionAPI, storage: replacementStorage)
        let beforeLogin = try await replacementSession.prepareLocalClosureRecovery(accountID: closingContext.userID)
        replacementStorage.write(sessionData)
        _ = try await replacementSession.restore()
        await refused { try await replacementSession.withLocalClosureRecovery(beforeLogin) {
            fatalError("replacement login reached finalization")
        } }
        keychain.failClosureErase(true)
        await refused { try await references.recoverAbandonedLocalClosure(expected: staleClosure,
            session: restartedEmpty, pending: pending, encryptionKeys: keys) }
        let retainedAfterFailure = try references.pendingClosure(account: closingContext.userID)
        precondition(retainedAfterFailure == staleClosure)
        keychain.failClosureErase(false)
        try await references.recoverAbandonedLocalClosure(expected: staleClosure,
            session: restartedEmpty, pending: pending, encryptionKeys: keys)
        let recovered = try references.pendingClosure(account: closingContext.userID)
        precondition(recovered == nil)
        let unrelatedClosure = try references.pendingClosure(account: cancelledContext.userID)
        precondition(unrelatedClosure == cancelledClosure, "recovery must preserve another account's closure")
        await refused { try await references.recoverAbandonedLocalClosure(expected: staleClosure,
            session: restartedEmpty, pending: pending, encryptionKeys: keys) }
        // A login generation change also invalidates absence permission.
        try await restartedEmpty.signOut()
        await refused { try await restartedEmpty.withLocalClosureRecovery(absentPermit) {} }
        print("PASS: synthetic initial registration persists intent/key/reference/proof in order, exact uncertain commit retry avoids new device calls, confirmed metadata stays local-only, unknown generation blocks restart retries, cancellation retains proof, and shared-actor closing blocks commit and erases after callback. No Apple service, owner Keychain or purchase.")
    }
}
