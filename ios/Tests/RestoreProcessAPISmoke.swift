import Foundation
import OuchiCore

actor RestoreProcessSession {
    private var value: AppAttestRegistrationSession?
    init(_ value: AppAttestRegistrationSession) { self.value = value }
    func current() -> AppAttestRegistrationSession? { value }
    func clear() { value = nil }
}
@main struct RestoreProcessAPISmoke {
    static func refused(_ operation: @Sendable () async throws -> Void) async {
        do { try await operation(); fatalError("Unsafe process status accepted") } catch {}
    }
    static func main() async throws {
        let now: Int64 = 1791727200001
        let requestID = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
        let scope = AppAttestRegistrationScope(userID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!, sessionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, keyID: Data(repeating: 1, count: 32).base64EncodedString(), appID: "SYNTHETIC1.dev.synthetic.ouchi", environment: "development")
        let claims: [String:Any] = ["sub":scope.userID.uuidString.lowercased(),"session_id":scope.sessionID.uuidString.lowercased(),"exp":1791729999]
        let payload = try JSONSerialization.data(withJSONObject: claims).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let captured = AppAttestRegistrationSession(scope: scope, bearer: "e30." + payload + ".c2ln")
        let endpoint = URL(string: "https://ouchi-maintenance.vercel.app/api/billing/restore/process")!
        let pair = String(repeating: "a", count: 64), assertion = String(repeating: "b", count: 64)
        @Sendable func response(_ body: Data, _ status: Int = 200, _ url: URL = endpoint, _ headers: [String:String] = ["Content-Type":"application/json","Cache-Control":"no-store"]) -> (Data,HTTPURLResponse) {
            (body,HTTPURLResponse(url:url,statusCode:status,httpVersion:nil,headerFields:headers)!)
        }
        for value in ["pending", "complete"] {
            let body = try JSONEncoder().encode(["requestID":requestID.uuidString.lowercased(),"status":value])
            let api = RestoreProcessAPI(currentSession:{ captured },transport:{ request in
                precondition(request.url == endpoint && request.httpMethod == "POST" && request.httpShouldHandleCookies == false)
                precondition(request.cachePolicy == .reloadIgnoringLocalCacheData && request.timeoutInterval == 60)
                precondition(request.value(forHTTPHeaderField:"Authorization") == "Bearer " + captured.bearer)
                precondition(request.value(forHTTPHeaderField:"X-Ouchi-App-Epoch") == scope.epochID.uuidString.lowercased())
                let sent = try JSONSerialization.jsonObject(with:request.httpBody!) as! [String:String]
                precondition(sent == ["requestID":requestID.uuidString.lowercased(),"pairSHA256":pair,"assertionSHA256":assertion])
                return response(body)
            },now:{ now })
            let result = try await api.process(captured:captured,requestID:requestID,pairSHA256:pair,assertionSHA256:assertion)
            precondition(result.rawValue == value)
        }
        let valid = try JSONEncoder().encode(["requestID":requestID.uuidString.lowercased(),"status":"complete"])
        let foreign = try JSONEncoder().encode(["requestID":scope.epochID.uuidString.lowercased(),"status":"complete"])
        let extra = try JSONEncoder().encode(["requestID":requestID.uuidString.lowercased(),"status":"complete","active":"true"])
        let bad = try JSONEncoder().encode(["requestID":requestID.uuidString.lowercased(),"status":"active"])
        for item in [response(foreign),response(extra),response(bad),response(Data("{}".utf8)),response(valid,401),response(valid,409),response(valid,503),response(valid,200,URL(string:"https://foreign.invalid/")!),response(valid,200,endpoint,["Content-Type":"application/json","Cache-Control":"public"]),response(Data(repeating:0,count:4097))] {
            let api = RestoreProcessAPI(currentSession:{ captured },transport:{ _ in item },now:{ now })
            await refused { _ = try await api.process(captured:captured,requestID:requestID,pairSHA256:pair,assertionSHA256:assertion) }
        }
        let session = RestoreProcessSession(captured)
        let changed = RestoreProcessAPI(currentSession:{ await session.current() },transport:{ _ in await session.clear(); return response(valid) },now:{ now })
        await refused { _ = try await changed.process(captured:captured,requestID:requestID,pairSHA256:pair,assertionSHA256:assertion) }
        let cancelled = Task {
            let api = RestoreProcessAPI(currentSession:{ captured },transport:{ _ in
                withUnsafeCurrentTask { $0?.cancel() }; return response(valid)
            },now:{ now })
            return try await api.process(captured:captured,requestID:requestID,pairSHA256:pair,assertionSHA256:assertion)
        }
        await refused { _ = try await cancelled.value }
        let absent = RestoreProcessAPI(currentSession:{ nil },transport:{ _ in fatalError("Missing Auth reached transport") },now:{ now })
        await refused { _ = try await absent.process(captured:captured,requestID:requestID,pairSHA256:pair,assertionSHA256:assertion) }
        let invalid = RestoreProcessAPI(currentSession:{ captured },transport:{ _ in fatalError("Invalid input reached transport") },now:{ now })
        await refused { _ = try await invalid.process(captured:captured,requestID:requestID,pairSHA256:pair.uppercased(),assertionSHA256:assertion) }
        await refused { _ = try await invalid.process(captured:captured,requestID:requestID,pairSHA256:pair,assertionSHA256:"") }
        print("PASS: fixed status HTTP and captured scope, exact pending/complete DTO, foreign/extra/active/error/cache/size refusal; synthetic only, no rights/assertion resubmission/real Apple/network")
    }
}
