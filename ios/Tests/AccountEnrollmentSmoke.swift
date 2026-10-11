import Foundation
import OuchiCore
@main struct AccountEnrollmentSmoke {
    static let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    static let session = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    static let epoch = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    static let requestID = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    static func token() throws -> String {
        let data = try JSONSerialization.data(withJSONObject: ["sub":account.uuidString,"session_id":session.uuidString,"exp":Date().timeIntervalSince1970 + 3600])
        return "e30." + data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") + ".synthetic"
    }
    static func api(_ value: [String: String], enrolled: Bool? = nil, bad: String? = nil) throws -> AccountEnrollmentAPI {
        var object: [String: Any] = value
        if let enrolled { object["enrolled"] = enrolled; if !enrolled { object["epochID"] = NSNull() } }
        if bad == "number" { object["enrolled"] = 1 }
        if bad == "extra" { object["extra"] = true }
        let data = try JSONSerialization.data(withJSONObject: object)
        return AccountEnrollmentAPI(isolatedDevelopment: true, loopbackPort: 1) { request in
            precondition(request.url?.absoluteString == "https://ouchi-maintenance.vercel.app/api/account/enrollment")
            precondition(request.cachePolicy == .reloadIgnoringLocalCacheData)
            precondition(request.value(forHTTPHeaderField: "X-Ouchi-App-Epoch") == nil)
            if request.httpMethod == "POST" {
                let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
                precondition(body["confirmation"] == "ENROLL_OUCHI_MAINTENANCE" && body["password"] == "synthetic")
                precondition(Set(body.keys) == Set(["confirmation","password","requestID"]))
            } else { precondition(request.httpMethod == "GET" && request.httpBody == nil) }
            return (data, HTTPURLResponse(url: bad == "host" ? URL(string: "https://foreign.example/")! : request.url!, statusCode: bad == "failure" ? 503 : 200, httpVersion: nil, headerFields: ["Content-Type":"application/json","Cache-Control":"no-store"])!)
        }
    }
    static func main() async throws {
        let value = ["userID":account.uuidString,"sessionID":session.uuidString,"epochID":epoch.uuidString]
        let absent = try await api(value, enrolled: false).load(account: account, token: token())
        precondition(!absent.enrolled && absent.epochID == nil)
        let present = try await api(value, enrolled: true).load(account: account, token: token())
        precondition(present.enrolled && present.epochID == epoch)
        let receipt = try await api(value.merging(["requestID":requestID.uuidString]) { _, new in new }).register(account: account, token: token(), password: "synthetic", requestID: requestID)
        precondition(receipt == epoch)
        for field in ["userID","sessionID","epochID"] {
            var changed = value; changed[field] = field == "epochID" ? "bad" : requestID.uuidString
            do { _ = try await api(changed, enrolled: true).load(account: account, token: token()); fatalError("Mismatched receipt accepted") } catch { }
        }
        for bad in ["number","extra","host","failure"] {
            do { _ = try await api(value, enrolled: true, bad: bad).load(account: account, token: token()); fatalError("Invalid receipt accepted") } catch { }
        }
        let task = Task { () throws -> EnrollmentState in
            withUnsafeCurrentTask { $0?.cancel() }
            return try await api(value, enrolled: true).load(account: account, token: token())
        }
        do { _ = try await task.value; fatalError("Cancellation accepted") } catch { precondition(error is CancellationError) }
        print("PASS: free native enrollment API fixed endpoint, original user/session scope, absent/present state, explicit consent receipt, invalid Boolean/extra/foreign/failure/cancellation refused. Synthetic transport only.")
    }
}
