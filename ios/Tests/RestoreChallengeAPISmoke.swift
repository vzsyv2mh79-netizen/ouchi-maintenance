import Foundation
import OuchiCore

actor RestoreTransportSession {
    private var value: AppAttestRegistrationSession?
    init(_ value: AppAttestRegistrationSession) { self.value = value }
    func current() -> AppAttestRegistrationSession? { value }
    func clear() { value = nil }
}
@main struct RestoreChallengeAPISmoke {
    static func refused(_ operation: @Sendable () async throws -> Void) async {
        do { try await operation(); fatalError("Unsafe challenge response accepted") } catch {}
    }
    static func main() async throws {
        let now: Int64 = 1791727200001
        let requestID = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
        let scope = AppAttestRegistrationScope(userID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!, sessionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, keyID: Data(repeating: 1, count: 32).base64EncodedString(), appID: "SYNTHETIC1.dev.synthetic.ouchi", environment: "development")
        let claims: [String:Any] = ["sub":scope.userID.uuidString.lowercased(),"session_id":scope.sessionID.uuidString.lowercased(),"exp":1791729999]
        let payload = try JSONSerialization.data(withJSONObject: claims).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let captured = AppAttestRegistrationSession(scope: scope, bearer: "e30." + payload + ".c2ln")
        let canonical = #"{"version":1,"purpose":"restore_ouchi_subscription","nonce":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc","issuedAt":1791727200000,"expiresAt":1791727500000,"userID":"11111111-1111-4111-8111-111111111111","sessionID":"22222222-2222-4222-8222-222222222222","epochID":"33333333-3333-4333-8333-333333333333","requestID":"44444444-4444-4444-8444-444444444444","keyID":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=","appID":"SYNTHETIC1.dev.synthetic.ouchi","attestEnvironment":"development","purchaseEnvironment":"Sandbox","proofSHA256":"ed30e17c16007492e113af953fdbe0387fc08b5f4b4cf5eae6f9f6bd7a2dec27"}"#
        let responseBody = try JSONEncoder().encode(["clientDataBase64":Data(canonical.utf8).base64EncodedString()])
        let endpoint = URL(string: "https://ouchi-maintenance.vercel.app/api/billing/restore/challenge")!
        @Sendable func response(_ body: Data = responseBody, _ status: Int = 200, _ url: URL = endpoint, _ headers: [String:String] = ["Content-Type":"application/json","Cache-Control":"no-store"]) -> (Data,HTTPURLResponse) {
            (body,HTTPURLResponse(url:url,statusCode:status,httpVersion:nil,headerFields:headers)!)
        }
        let api = RestoreChallengeAPI(currentSession: { captured }, transport: { request in
            precondition(request.url == endpoint && request.httpMethod == "POST" && request.httpShouldHandleCookies == false)
            precondition(request.cachePolicy == .reloadIgnoringLocalCacheData)
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer " + captured.bearer)
            precondition(request.value(forHTTPHeaderField: "X-Ouchi-App-Epoch") == scope.epochID.uuidString.lowercased())
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String:String]
            precondition(body == ["requestID":requestID.uuidString.lowercased(),"keyID":scope.keyID,"signedAppTransaction":"合成app.jws","signedTransaction":"合成purchase.jws"])
            return response()
        }, now: { now })
        let challenge = try await api.challenge(captured:captured,requestID:requestID,signedAppTransaction:"合成app.jws",signedTransaction:"合成purchase.jws")
        precondition(challenge.requestID == requestID && challenge.clientData == Data(canonical.utf8))
        let wrong = canonical.replacingOccurrences(of: "ed30e17c16007492e113af953fdbe0387fc08b5f4b4cf5eae6f9f6bd7a2dec27", with: String(repeating:"f",count:64))
        let wrongBody = try JSONEncoder().encode(["clientDataBase64":Data(wrong.utf8).base64EncodedString()])
        let cases: [(Data,HTTPURLResponse)] = [response(responseBody,401),response(responseBody,503),response(responseBody,200,URL(string:"https://foreign.invalid/")!),response(responseBody,200,endpoint,["Content-Type":"text/plain","Cache-Control":"no-store"]),response(responseBody,200,endpoint,["Content-Type":"application/json","Cache-Control":"public"]),response(Data(repeating:0,count:4097)),response(Data("{}".utf8)),response(Data(#"{"clientDataBase64":"invalid"}"#.utf8)),response(wrongBody),response(responseBody,200,endpoint,["Content-Type":"application/json","Cache-Control":"no-store","Content-Length":"4097"])]
        for item in cases {
            let invalid = RestoreChallengeAPI(currentSession:{ captured },transport:{ _ in item },now:{ now })
            await refused { _ = try await invalid.challenge(captured:captured,requestID:requestID,signedAppTransaction:"合成app.jws",signedTransaction:"合成purchase.jws") }
        }
        let session = RestoreTransportSession(captured)
        let changed = RestoreChallengeAPI(currentSession:{ await session.current() },transport:{ _ in await session.clear(); return response() },now:{ now })
        await refused { _ = try await changed.challenge(captured:captured,requestID:requestID,signedAppTransaction:"合成app.jws",signedTransaction:"合成purchase.jws") }
        let absent = RestoreChallengeAPI(currentSession:{ nil },transport:{ _ in fatalError("Missing Auth reached transport") },now:{ now })
        await refused { _ = try await absent.challenge(captured:captured,requestID:requestID,signedAppTransaction:"合成app.jws",signedTransaction:"合成purchase.jws") }
        let expired = RestoreChallengeAPI(currentSession:{ captured },transport:{ _ in response() },now:{ 1791727500000 })
        await refused { _ = try await expired.challenge(captured:captured,requestID:requestID,signedAppTransaction:"合成app.jws",signedTransaction:"合成purchase.jws") }
        let noRequest = RestoreChallengeAPI(currentSession:{ captured },transport:{ _ in fatalError("Invalid input reached transport") },now:{ now })
        await refused { _ = try await noRequest.challenge(captured:captured,requestID:requestID,signedAppTransaction:"",signedTransaction:"valid") }
        await refused { _ = try await noRequest.challenge(captured:captured,requestID:UUID(uuidString:"00000000-0000-0000-0000-000000000000")!,signedAppTransaction:"valid",signedTransaction:"valid") }
        print("PASS: fixed restore challenge HTTP/body/identity, canonical server bytes, altered pair, expiry, session change, bounded response and error rejection; mock only, no network/signature/rights")
    }
}

