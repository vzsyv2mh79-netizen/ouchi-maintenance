import Foundation
import OuchiCore

private actor TransportCount {
    var count = 0
    func record() { count += 1 }
}
@main struct SandboxClosureOriginSmoke {
    static let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    static let epoch = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    static let submission = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    static let requestID = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    static let credential = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!
    static let home = UUID(uuidString: "66666666-6666-4666-8666-666666666666")!
    static let generation = UUID(uuidString: "77777777-7777-4777-8777-777777777777")!
    static let readKey = Data(repeating: 0xab, count: 32).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    static func reject(_ expected: CloudError, _ operation: @Sendable () async throws -> Void) async {
        do { try await operation(); fatalError("Unexpected closure acknowledgement") }
        catch { precondition(error as? CloudError == expected, "Unexpected error: \(error)") }
    }
    static func main() async {
        for mode in 0...3 {
            let server: BillingServer = mode == 3 ? .production : .sandboxReview
            let environment: BillingEnvironment = mode == 1 ? .production : .sandbox
            let host = mode == 3 ? "ouchi-maintenance.vercel.app" : "ouchi-maintenance-7gmdv28id-gfgz4m9pkm-8942.vercel.app"
            let expected: CloudError = mode == 1 ? .invalidInput : mode == 2 ? .malformedResponse : .rejected(503)
            let count = TransportCount()
            let transport: HouseholdAPI.Transport = { request in
                precondition(mode != 1, "Production/review mismatch transmitted credentials")
                await count.record()
                precondition(request.url?.scheme == "https" && request.url?.host == host)
                precondition(request.cachePolicy == .reloadIgnoringLocalCacheData)
                let path = request.url!.path
                if path.hasPrefix("/api/account/deletion/") {
                    precondition(request.value(forHTTPHeaderField: "X-Deletion-Receipt") == readKey)
                } else if path == "/api/account/closure-review/custody/status" {
                    precondition(request.value(forHTTPHeaderField: "X-Ouchi-Closure-Read") == readKey)
                    precondition(request.value(forHTTPHeaderField: "Authorization") == nil)
                } else {
                    precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
                }
                if path.hasPrefix("/api/family/") {
                    precondition(request.value(forHTTPHeaderField: "X-Ouchi-App-Epoch") == epoch.uuidString.lowercased())
                }
                if path == "/api/account/closure-review/request" {
                    let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
                    precondition(body["password"] == "sample-password" && body["expectedEpochID"] == epoch.uuidString.lowercased())
                    precondition(body["submissionID"] == submission.uuidString.lowercased())
                }
                let replyURL = mode == 2 ? URL(string: "https://ouchi-maintenance.vercel.app" + path)! : request.url!
                // Deliberate refusal: never fabricate deletion, transfer or a completed receipt.
                return (Data(), HTTPURLResponse(url: replyURL, statusCode: 503, httpVersion: nil,
                    headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store", "Content-Length": "0"])!)
            }
            let isolated = mode != 3 // A review destination must never become DEBUG loopback.
            let review = AccountClosureReviewAPI(server: server, environment: environment, isolatedDevelopment: isolated, transport: transport)
            await reject(expected) { _ = try await review.request(password: "sample-password", token: "synthetic", epochID: epoch, submissionID: submission) }
            await reject(expected) { _ = try await review.read(token: "synthetic", epochID: epoch, submissionID: submission) }
            await reject(expected) { _ = try await review.cancel(token: "synthetic", epochID: epoch, submissionID: submission) }
            await reject(expected) { _ = try await review.progress(token: "synthetic", epochID: epoch, submissionID: submission) }
            let custody = ClosureReadCustodyAPI(server: server, environment: environment, isolatedDevelopment: isolated, transport: transport)
            let scope = ClosureReadScope(requestID: requestID, epochID: epoch, submissionID: submission)
            await reject(expected) { _ = try await custody.window(scope: scope, bearer: "synthetic") }
            await reject(expected) { try await custody.register(scope: scope, credentialID: credential, token: readKey,
                expiresAt: Date().addingTimeInterval(900), bearer: "synthetic") }
            await reject(expected) { _ = try await custody.status(scope: scope, credentialID: credential, token: readKey) }
            let management = HomeManagementAPI(server: server, environment: environment, isolatedDevelopment: isolated, transport: transport)
            let intent = HomeManagementIntent(accountID: account, epochID: epoch, homeID: home, generation: generation, requestID: requestID)
            await reject(expected) { _ = try await management.status(homeID: home, epochID: epoch, token: "synthetic") }
            await reject(expected) { _ = try await management.read(intent, token: "synthetic") }
            await reject(expected) { _ = try await management.claim(intent, token: "synthetic") }
            let handoff = HomeHandoffAPI(server: server, environment: environment, isolatedDevelopment: isolated, transport: transport)
            await reject(expected) { _ = try await handoff.create(requestID: requestID, homeID: home, recipientID: account, epochID: epoch, token: "synthetic") }
            await reject(expected) { _ = try await handoff.read(requestID: requestID, homeID: home, epochID: epoch, token: "synthetic") }
            for accept in [true, false] {
                await reject(expected) { _ = try await handoff.decide(accept: accept, requestID: requestID, homeID: home, epochID: epoch, token: "synthetic") }
            }
            let receipt = DeletionReceiptAPI(server: server, environment: environment, isolatedDevelopment: isolated, transport: transport)
            await reject(expected) { try await receipt.register(requestID: requestID, receiptToken: readKey,
                expiresAt: Date().addingTimeInterval(900), bearer: "synthetic") }
            await reject(expected) { _ = try await receipt.status(requestID: requestID, receiptToken: readKey) }
            let actual = await count.count
            precondition(actual == (mode == 1 ? 0 : 16), "Not every intended operation exercised its transport guard")
        }
        print("PASS: 16 closure/management/handoff/receipt operations across review, rejected Production/review, foreign reply and production-origin modes. Synthetic refusal only; no account/file erase, transfer, receipt registration or real service access.")
    }
}
