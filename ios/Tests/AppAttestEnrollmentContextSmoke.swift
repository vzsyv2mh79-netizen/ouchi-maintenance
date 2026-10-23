import Foundation
import OuchiCore

final class SyntheticEnrollmentSessionStorage: SessionStorage, @unchecked Sendable {
    private let lock=NSLock();private var bytes:Data?
    init(_ bytes:Data) { self.bytes=bytes }
    func read()throws->Data? { lock.lock();defer { lock.unlock() };return bytes }
    func write(_ bytes:Data?)throws { lock.lock();defer { lock.unlock() };self.bytes=bytes }
}
@main struct AppAttestEnrollmentContextSmoke {
    static let account=UUID(),sid=UUID(),epoch=UUID()
    static func info() -> [String:Any] {
        ["OUCHI_APP_ATTEST_REGISTRATION_ENABLED":true,"OUCHI_APP_ATTEST_APP_ID":"SYNTHETIC1.dev.synthetic.ouchi","OUCHI_APP_ATTEST_ENVIRONMENT":"production","OUCHI_APP_ATTEST_REFERENCE_RETENTION_SECONDS":3600]
    }
    static func token(account:UUID=account,session:UUID=sid)throws->String {
        let data=try JSONSerialization.data(withJSONObject:["sub":account.uuidString,"session_id":session.uuidString,"exp":Date().timeIntervalSince1970+3600])
        return "e30."+data.base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")+".synthetic"
    }
    static func stored(_ token:String,user:UUID=account)throws->Data {
        try JSONSerialization.data(withJSONObject:["access_token":token,"refresh_token":"synthetic-never-used-refresh","expires_at":Date().timeIntervalSince1970+3600,"user":["id":user.uuidString]])
    }
    static func controller(_ token:String)throws->(SessionController,SyntheticEnrollmentSessionStorage) {
        let storage=SyntheticEnrollmentSessionStorage(try stored(token))
        let api=HouseholdAPI(config:try CloudConfiguration(url:URL(string:"https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!,publishableKey:"sb_publishable_synthetic_never_a_real_key"),transport:{ _ in fatalError("unexpected real Auth/refresh call") })
        return (SessionController(api:api,storage:storage),storage)
    }
    static func refused(_ f:@Sendable ()async throws->Void)async { do { try await f();fatalError("unsafe enrollment context accepted") }catch {} }
    static func refusedSync(_ f:()throws->Void) { do { try f();fatalError("unsafe configuration accepted") }catch {} }
    static func main()async throws {
        let absent=try AppAttestRegistrationConfiguration.parse(info:[:],bundleIdentifier:nil);precondition(absent==nil)
        let disabled=try AppAttestRegistrationConfiguration.parse(info:["OUCHI_APP_ATTEST_REGISTRATION_ENABLED":false,"OUCHI_APP_ATTEST_APP_ID":"bad"],bundleIdentifier:nil);precondition(disabled==nil)
        let configuration=try AppAttestRegistrationConfiguration.parse(info:info(),bundleIdentifier:"dev.synthetic.ouchi")!
        precondition(configuration.referenceRetentionMilliseconds==3600000 && configuration.environment=="production")
        for (field,value) in [("OUCHI_APP_ATTEST_REGISTRATION_ENABLED",1 as Any),("OUCHI_APP_ATTEST_REGISTRATION_ENABLED","true"),("OUCHI_APP_ATTEST_APP_ID","SYNTHETIC1.dev..synthetic.ouchi"),("OUCHI_APP_ATTEST_APP_ID","SYNTHETIC1.dev.foreign.ouchi"),("OUCHI_APP_ATTEST_ENVIRONMENT","Sandbox"),("OUCHI_APP_ATTEST_REFERENCE_RETENTION_SECONDS",true),("OUCHI_APP_ATTEST_REFERENCE_RETENTION_SECONDS",299),("OUCHI_APP_ATTEST_REFERENCE_RETENTION_SECONDS",7_776_001),("OUCHI_APP_ATTEST_REFERENCE_RETENTION_SECONDS",3600.5)] {
            var invalid=info();invalid[field]=value
            let frozen=invalid
            refusedSync { _ = try AppAttestRegistrationConfiguration.parse(info:frozen,bundleIdentifier:"dev.synthetic.ouchi") }
        }
        let bearer=try token(),(session,storage)=try controller(bearer)
        let restored=try await session.restore();precondition(restored)
        let response=try JSONSerialization.data(withJSONObject:["userID":account.uuidString,"sessionID":sid.uuidString,"epochID":epoch.uuidString,"enrolled":true])
        let service=AccountEnrollmentAPI(transport:{ r in
            precondition(r.url!.absoluteString=="https://ouchi-maintenance.vercel.app/api/account/enrollment" && r.httpMethod=="GET" && r.httpBody==nil)
            precondition(r.value(forHTTPHeaderField:"Authorization")=="Bearer "+bearer)
            return (response,HTTPURLResponse(url:r.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
        })
        let provider=AppAttestEnrollmentContextProvider(session:session,enrollment:service,configuration:configuration)
        let context=try await provider.load(expectedAccount:account)
        precondition(context.userID==account && context.sessionID==sid && context.epochID==epoch && context.bearer==bearer && context.appID==configuration.appID)
        let never=AccountEnrollmentAPI(transport:{ _ in fatalError("foreign local account reached enrollment HTTP") })
        let wrong=AppAttestEnrollmentContextProvider(session:session,enrollment:never,configuration:configuration)
        await refused { _ = try await wrong.load(expectedAccount:UUID()) }
        let missing=try JSONSerialization.data(withJSONObject:["userID":account.uuidString,"sessionID":sid.uuidString,"epochID":NSNull(),"enrolled":false])
        let notEnrolled=AppAttestEnrollmentContextProvider(session:session,enrollment:AccountEnrollmentAPI(transport:{ r in
            (missing,HTTPURLResponse(url:r.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
        }),configuration:configuration)
        await refused { _ = try await notEnrolled.load(expectedAccount:account) }
        // A matched server response cannot authorize a context after logout.
        let logoutRace=AppAttestEnrollmentContextProvider(session:session,enrollment:AccountEnrollmentAPI(transport:{ r in
            try await session.signOut()
            return (response,HTTPURLResponse(url:r.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
        }),configuration:configuration)
        await refused { _ = try await logoutRace.load(expectedAccount:account) }
        try storage.write(stored(bearer));_ = try await session.restore()
        let rotated=try token(session:UUID()),rotatedSession=try stored(rotated)
        let replacementRace=AppAttestEnrollmentContextProvider(session:session,enrollment:AccountEnrollmentAPI(transport:{ r in
            try storage.write(rotatedSession);_ = try await session.restore()
            return (response,HTTPURLResponse(url:r.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
        }),configuration:configuration)
        await refused { _ = try await replacementRace.load(expectedAccount:account) }
        let cancelled=Task {
            while !Task.isCancelled { await Task.yield() }
            return try await wrong.load(expectedAccount:account)
        };cancelled.cancel();await refused { _ = try await cancelled.value }
        print("PASS: disabled/malformed/bundle/environment/retention gates; concrete SessionController plus read-only enrollment GET produce exact context only with matched live account/session/epoch, refusing missing enrollment, logout, replacement and cancellation. Synthetic memory session and mock HTTP; no owner credentials or DeviceCheck.")
    }
}
