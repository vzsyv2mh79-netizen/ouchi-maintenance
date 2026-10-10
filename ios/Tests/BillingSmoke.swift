import Foundation
import OuchiCore
@main struct BillingSmoke {
    static func main() async throws {
        let api = BillingAPI { request in
            precondition(request.httpMethod == "POST" && request.url?.path == "/api/billing/transactions")
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
            let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
            precondition(body == ["signedTransaction": "synthetic-jws"])
            return (Data(#"{"saved":true,"environment":"Sandbox"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        try await api.submit(signedTransaction: "synthetic-jws", token: "synthetic")
        for payload in [#"{"saved":false,"environment":"Sandbox"}"#, #"{"saved":true,"environment":"Production"}"#] {
            let invalid = BillingAPI { request in (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
            do { try await invalid.submit(signedTransaction: "synthetic-jws", token: "synthetic"); fatalError("invalid receipt ack accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        let right = BillingAPI { request in
            precondition(request.httpMethod == "GET" && request.httpBody == nil)
            return (Data(#"{"plan":"premium","salesEnabled":false,"environment":"Sandbox","expiresAt":1791633600000,"productId":"ouchi.premium.monthly"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let state = try await right.entitlement(token: "synthetic")
        precondition(state.premiumIsCurrent(now: Date(timeIntervalSince1970: 1791633599)))
        precondition(!state.premiumIsCurrent(now: Date(timeIntervalSince1970: 1791633600)))
        let unavailable = BillingAPI { request in (Data(), HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!) }
        do { try await unavailable.submit(signedTransaction: "synthetic-jws", token: "synthetic"); fatalError("failed persistence accepted") }
        catch { precondition(error as? CloudError == .rejected(503)) }
        print("BillingSmoke PASS: authenticated JWS transport, server ack, production refusal, authoritative expiry, failed persistence refusal. No Apple purchase/network.")
    }
}
