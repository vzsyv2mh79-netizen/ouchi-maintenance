import Foundation
import OuchiCore

private actor SessionState {
    var current: AppAttestRegistrationSession?
    var sends = 0
    var bodies: [Data] = []
    init(_ current: AppAttestRegistrationSession?) { self.current = current }
    func snapshot() -> AppAttestRegistrationSession? { current }
    func clear() { current = nil }
    func sent(_ body: Data) { sends += 1; bodies.append(body) }
}
@main struct AppAttestRegistrationAPISmoke {
    static let now: Int64 = 1_791_727_200_000
    static let scope = AppAttestRegistrationScope(userID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!, sessionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, keyID: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=", appID: "SYNTHETIC1.dev.synthetic.ouchi", environment: "production")
    static let requestID = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    static let canonical = #"{"version":1,"purpose":"register_ouchi_attested_key","nonce":"AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM","issuedAt":1791727200000,"expiresAt":1791727500000,"userID":"11111111-1111-4111-8111-111111111111","sessionID":"22222222-2222-4222-8222-222222222222","epochID":"33333333-3333-4333-8333-333333333333","requestID":"44444444-4444-4444-8444-444444444444","keyID":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=","appID":"SYNTHETIC1.dev.synthetic.ouchi","attestEnvironment":"production"}"#
    static func captured() throws -> AppAttestRegistrationSession {
        let claims = try JSONSerialization.data(withJSONObject: ["sub":scope.userID.uuidString, "session_id":scope.sessionID.uuidString, "exp":Double(now + 3_600_000)/1000])
        let payload = claims.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return AppAttestRegistrationSession(scope: scope, bearer: "e30." + payload + ".synthetic")
    }
    private static func api(state: SessionState, fault: String? = nil) -> AppAttestRegistrationAPI {
        AppAttestRegistrationAPI(currentSession: { await state.snapshot() }, transport: { request in
            precondition(request.url?.absoluteString.hasPrefix("https://ouchi-maintenance.vercel.app/api/app-attest/registration/") == true)
            precondition(request.httpMethod == "POST" && request.cachePolicy == .reloadIgnoringLocalCacheData)
            precondition(request.value(forHTTPHeaderField: "X-Ouchi-App-Epoch") == scope.epochID.uuidString.lowercased())
            let body = request.httpBody!; await state.sent(body)
            let input = try JSONSerialization.jsonObject(with: body) as! [String: String]
            var output: [String: Any]
            if request.url!.lastPathComponent == "challenge" {
                precondition(Set(input.keys) == Set(["requestID","keyID"]))
                var text = canonical
                if fault == "purpose" { text = text.replacingOccurrences(of: "register_ouchi_attested_key", with: "restore_ouchi_subscription") }
                if fault == "request" { text = text.replacingOccurrences(of: requestID.uuidString.lowercased(), with: scope.sessionID.uuidString.lowercased()) }
                output = ["clientDataBase64": fault == "base64" ? "%%%" : Data(text.utf8).base64EncodedString()]
            } else {
                precondition(Set(input.keys) == Set(["requestID","keyID","attestationBase64"]))
                precondition(input["attestationBase64"] == "AQID")
                output = ["registered":true,"requestID":requestID.uuidString.lowercased(),"userID":scope.userID.uuidString.lowercased(),"sessionID":scope.sessionID.uuidString.lowercased(),"epochID":scope.epochID.uuidString.lowercased(),"keyID":scope.keyID,"appID":scope.appID,"attestEnvironment":scope.environment]
                if fault == "epoch" { output["epochID"] = scope.sessionID.uuidString.lowercased() }
                if fault == "number" { output["registered"] = 1 }
                if fault == "false" { output["registered"] = false }
            }
            if fault == "extra" { output["extra"] = true }
            let data = fault == "oversize" ? Data(repeating: 120, count: 4097) : try JSONSerialization.data(withJSONObject: output)
            if fault == "logout" { await state.clear() }
            return (data, HTTPURLResponse(url: fault == "redirect" ? URL(string: "https://foreign.example/")! : request.url!, statusCode: fault == "failure" ? 503 : 200, httpVersion: nil, headerFields: ["Content-Type":fault == "mime" ? "text/html" : "application/json","Cache-Control":fault == "cache" ? "public" : "no-store"])!)
        }, now: { now })
    }
    static func main() async throws {
        let session = try captured(), state = SessionState(session), api = api(state: state)
        let challenge = try await api.challenge(for: session, requestID: requestID)
        let receipt = try await api.commit(challenge, attestation: Data([1,2,3]), captured: session)
        precondition(receipt.scope == scope && receipt.requestID == requestID)
        _ = try await api.commit(challenge, attestation: Data([1,2,3]), captured: session)
        let bodies = await state.bodies; precondition(bodies[1] == bodies[2], "uncertain retry must retain exact proof and request")
        for fault in ["purpose","request","base64","extra","oversize","mime","cache","redirect","failure","logout"] {
            let badState = SessionState(session)
            do { _ = try await Self.api(state: badState, fault: fault).challenge(for: session, requestID: requestID); fatalError("accepted bad challenge transport: " + fault) } catch {}
        }
        for fault in ["epoch","number","false","extra","logout"] {
            do { _ = try await Self.api(state: SessionState(session), fault: fault).commit(challenge, attestation: Data([1,2,3]), captured: session); fatalError("accepted bad registration receipt: " + fault) } catch {}
        }
        let absent = SessionState(nil)
        do { _ = try await Self.api(state: absent).challenge(for: session, requestID: requestID); fatalError("sent after logout") } catch {}
        let absentSends = await absent.sends; precondition(absentSends == 0)
        for proof in [Data(), Data(repeating: 1, count: 131073)] {
            do { _ = try await api.commit(challenge, attestation: proof, captured: session); fatalError("sent invalid proof") } catch {}
        }
        let cancelled = SessionState(session)
        let task = Task { return try await Self.api(state: cancelled).challenge(for: session, requestID: requestID) }
        task.cancel(); do { _ = try await task.value; fatalError("accepted cancellation") } catch {}
        let cancelledSends = await cancelled.sends; precondition(cancelledSends == 0)
        print("PASS: fixed native registration transport pins session/epoch, bounds bytes and receipts, refuses redirect/cache/MIME/logout/malformed scope and supports exact retained-proof retry. Mock only; no DeviceCheck, server registration or purchase grant.")
    }
}
