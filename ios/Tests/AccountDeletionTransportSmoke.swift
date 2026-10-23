import Foundation
import OuchiCore

@main struct AccountDeletionTransportSmoke {
    static func main() async throws {
        // Compiled without DEBUG: test routing must never affect a released app.
        let id = UUID(uuidString: "66666666-6666-4666-8666-666666666666")!
        let api = AccountDeletionAPI(isolatedDevelopment: true, loopbackPort: 1) { request in
            precondition(request.url?.absoluteString == "https://ouchi-maintenance.vercel.app/api/account/deletion")
            precondition(request.httpMethod == "GET" && request.httpBody == nil)
            return (Data("{\"epochID\":\"33333333-3333-4333-8333-333333333333\",\"requestID\":\"\(id)\",\"state\":\"pending\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let state = try await api.currentProgress(token: "synthetic")
        precondition(state?.requestID == id && state?.state == .pending)
        print("AccountDeletionTransportSmoke PASS: Release ignores loopback and preserves pending status. Mock transport; no deletion.")
    }
}
