import Foundation
import OuchiCore
@main struct APNsSmoke {
    static func main() async throws {
        let id = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let api = DevelopmentAPNsAPI { request in
            precondition(request.url?.absoluteString == "http://127.0.0.1:3000/api/development/apns-registration")
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
            precondition(request.cachePolicy == .reloadIgnoringLocalCacheData && request.timeoutInterval == 15)
            let body = try JSONDecoder().decode([String: String].self, from: request.httpBody!)
            let result: String
            if request.httpMethod == "POST" {
                precondition(body == ["deviceToken": String(repeating: "ab", count: 48)])
                result = "{\"environment\":\"Sandbox\",\"registrationId\":\"\(id.uuidString)\"}"
            } else {
                precondition(request.httpMethod == "DELETE" && body == ["registrationId": id.uuidString.lowercased()])
                result = #"{"environment":"Sandbox","disabled":true}"#
            }
            return (Data(result.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let registered = try await api.register(deviceToken: Data(repeating: 0xab, count: 48), token: "synthetic", confirmed: true)
        precondition(registered == id)
        let disabled = try await api.disable(registration: id, token: "synthetic")
        precondition(disabled)
        for body in [#"{"environment":"Production","registrationId":"11111111-1111-4111-8111-111111111111"}"#, #"{"environment":"Sandbox","registrationId":"00000000-0000-0000-0000-000000000000"}"#] {
            let invalid = DevelopmentAPNsAPI { request in (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
            do { _ = try await invalid.register(deviceToken: Data(repeating: 1, count: 32), token: "synthetic", confirmed: true); fatalError("invalid response accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        let untouched = DevelopmentAPNsAPI { _ in fatalError("invalid input reached transport") }
        for confirmed in [false, true] {
            do { _ = try await untouched.register(deviceToken: Data(), token: "synthetic", confirmed: confirmed); fatalError("empty token accepted") }
            catch { precondition(error as? CloudError == .invalidInput) }
        }
        do { _ = try await untouched.register(deviceToken: Data(repeating: 1, count: 32), token: "bad token", confirmed: true); fatalError("bad bearer accepted") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        let redirected = DevelopmentAPNsAPI { _ in (Data(), HTTPURLResponse(url: URL(string: "https://example.invalid")!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
        do { _ = try await redirected.disable(registration: id, token: "synthetic"); fatalError("redirect accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        print("APNsSmoke PASS: loopback registration/disable contract, explicit consent, variable token size, production/invalid/redirect refusal. No Apple or real network calls.")
    }
}
