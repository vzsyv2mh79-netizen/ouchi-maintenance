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
            return (Data(#"{"plan":"premium","purchaseAccountToken":"22222222-2222-4222-8222-222222222222","salesEnabled":false,"environment":"Sandbox","expiresAt":1791633600000,"productId":"ouchi.premium.monthly"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let state = try await right.entitlement(token: "synthetic")
        precondition(state.purchaseAccountToken == UUID(uuidString: "22222222-2222-4222-8222-222222222222"))
        precondition(state.premiumIsCurrent(now: Date(timeIntervalSince1970: 1791633599)))
        precondition(!state.premiumIsCurrent(now: Date(timeIntervalSince1970: 1791633600)))
        for payload in [
            #"{"plan":"premium","salesEnabled":false,"environment":"Sandbox","expiresAt":1791633600000,"productId":"ouchi.premium.monthly"}"#,
            #"{"plan":"free","salesEnabled":false,"environment":"Sandbox","purchaseAccountToken":"00000000-0000-0000-0000-000000000000"}"#
        ] {
            let invalid = BillingAPI { request in (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
            do { _ = try await invalid.entitlement(token: "synthetic"); fatalError("missing or zero purchase binding accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        // An explicit production adapter recognizes server-verified rights even when
        // new sales are paused; default Sandbox must never consume those rights.
        let expiry = 1791633600000.0
        let beforeExpiry = Date(timeIntervalSince1970: expiry / 1000 - 1)
        for sales in [false, true] {
            let payload = "{\"plan\":\"premium\",\"purchaseAccountToken\":\"22222222-2222-4222-8222-222222222222\",\"salesEnabled\":\(sales),\"environment\":\"Production\",\"expiresAt\":\(expiry),\"productId\":\"ouchi.premium.annual\"}"
            let production = BillingAPI(environment: .production) { request in
                (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            let rights = try await production.entitlement(token: "synthetic")
            precondition(rights.premiumIsCurrent(now: beforeExpiry, expectedEnvironment: .production))
            precondition(!rights.premiumIsCurrent(now: beforeExpiry))
            precondition(!rights.premiumIsCurrent(now: Date(timeIntervalSince1970: expiry / 1000), expectedEnvironment: .production))
            let sandbox = BillingAPI { request in
                (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            do { _ = try await sandbox.entitlement(token: "synthetic"); fatalError("Sandbox consumed production rights") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        for payload in [
            #"{"plan":"free","salesEnabled":false}"#,
            #"{"plan":"free","salesEnabled":false,"environment":"Sandbox"}"#,
            #"{"plan":"premium","salesEnabled":false,"environment":"Production","expiresAt":1791633600000,"productId":"ouchi.premium.monthly"}"#,
            #"{"plan":"free","salesEnabled":false,"environment":"Xcode"}"#
        ] {
            let invalid = BillingAPI(environment: .production) { request in
                (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            do { _ = try await invalid.entitlement(token: "synthetic"); fatalError("Production accepted malformed or wrong-environment rights") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        for environment in ["Sandbox", "Production"] {
            let acknowledgement = BillingAPI(environment: .production) { request in
                let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
                precondition(body == ["signedTransaction": "synthetic-jws"])
                let payload = "{\"saved\":true,\"environment\":\"\(environment)\"}"
                return (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            if environment == "Production" { try await acknowledgement.submit(signedTransaction: "synthetic-jws", token: "synthetic") }
            else {
                do { try await acknowledgement.submit(signedTransaction: "synthetic-jws", token: "synthetic"); fatalError("Production accepted Sandbox save") }
                catch { precondition(error as? CloudError == .malformedResponse) }
            }
        }
        let unavailable = BillingAPI { request in (Data(), HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!) }
        do { try await unavailable.submit(signedTransaction: "synthetic-jws", token: "synthetic"); fatalError("failed persistence accepted") }
        catch { precondition(error as? CloudError == .rejected(503)) }
        for (status, state) in [(202, "accepted"), (200, "no_purchase_history")] {
            let recovery = BillingAPI { request in
                precondition(request.httpMethod == "POST" && request.url?.path == "/api/billing/recovery")
                precondition(request.httpBody == Data("{}".utf8))
                let payload = "{\"state\":\"\(state)\",\"environment\":\"Sandbox\"}"
                return (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
            let receipt = try await recovery.requestRecovery(token: "synthetic"); precondition(receipt.rawValue == state)
        }
        for state in ["none", "queued", "running", "complete", "failed", "cancelled"] {
            let recovery = BillingAPI { request in
                precondition(request.httpMethod == "GET" && request.url?.path == "/api/billing/recovery")
                let payload = "{\"state\":\"\(state)\",\"environment\":\"Sandbox\"}"
                return (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            let progress = try await recovery.recoveryStatus(token: "synthetic"); precondition(progress.state.rawValue == state)
        }
        for payload in [#"{"state":"complete","environment":"Production"}"#, #"{"state":"premium","environment":"Sandbox"}"#] {
            let invalid = BillingAPI { request in (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
            do { _ = try await invalid.recoveryStatus(token: "synthetic"); fatalError("invalid recovery scope/state accepted") } catch {}
        }
        for (status, payload) in [(200, #"{"state":"accepted","environment":"Sandbox"}"#), (202, #"{"state":"no_purchase_history","environment":"Sandbox"}"#), (202, #"{"state":"accepted","environment":"Production"}"#), (202, #"{"state":"complete","environment":"Sandbox"}"#)] {
            let invalid = BillingAPI { request in (Data(payload.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!) }
            do { _ = try await invalid.requestRecovery(token: "synthetic"); fatalError("invalid recovery receipt accepted") } catch {}
        }
        print("BillingSmoke PASS: authenticated JWS transport, server ack, explicit environment isolation, paused-sales paid rights, authoritative expiry, failed persistence refusal, recovery receipt/status scope and accepted-versus-complete separation. No Apple purchase/network.")
    }
}
