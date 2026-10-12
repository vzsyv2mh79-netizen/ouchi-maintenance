import Foundation
import OuchiCore

private actor DeletionServer {
    let epoch = UUID(), requestID = UUID(), account = UUID()
    var accepted = false, posts = 0, reads = 0, timeoutRead = false
    func setReadTimeout(_ value: Bool) { timeoutRead = value }
    func counts() -> (Int, Int) { (posts, reads) }
    func respond(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        if request.httpMethod == "POST" {
            posts += 1
            accepted = true
            // Server accepted the request but its acknowledgement was lost.
            throw URLError(.timedOut)
        }
        reads += 1
        if timeoutRead { throw URLError(.timedOut) }
        let body = accepted
            ? try JSONSerialization.data(withJSONObject: [
                "requestID": requestID.uuidString, "epochID": epoch.uuidString, "state": "pending"])
            : try JSONSerialization.data(withJSONObject: ["state": "not_requested", "userID": account.uuidString, "epochID": epoch.uuidString])
        return (body, HTTPURLResponse(url: request.url!, statusCode: 200,
                                     httpVersion: nil, headerFields: nil)!)
    }
}

@main struct AccountDeletionRecoverySmoke {
    @MainActor static func main() async throws {
        let server = DeletionServer()
        let account = await server.account
        let epoch = await server.epoch
        let flow = AccountDeletionFlow(api: AccountDeletionAPI(transport: { try await server.respond($0) }))
        flow.bind(accountID: account, epochID: epoch, revision: UUID())
        await server.setReadTimeout(true)
        do { _ = try await flow.submit(password: "synthetic-only", token: "synthetic"); fatalError("Outage accepted") }
        catch { precondition((error as? URLError)?.code == .timedOut) }
        let first = await server.counts()
        precondition(first.0 == 0 && !flow.busy && flow.receipt == nil)
        await server.setReadTimeout(false)
        do { _ = try await flow.submit(password: "synthetic-only", token: "synthetic"); fatalError("Lost ack accepted") }
        catch { precondition((error as? URLError)?.code == .timedOut) }
        precondition(!flow.busy && flow.receipt == nil)
        let recovered = try await flow.recover(token: "synthetic")
        precondition(recovered?.state == .pending && recovered?.epochID == epoch && !flow.busy)
        // Repeated submit first reads status and never sends a second deletion.
        let repeated = try await flow.submit(password: "synthetic-only", token: "synthetic")
        let final = await server.counts()
        precondition(final.0 == 1 && repeated?.requestID == recovered?.requestID)
        flow.bind(accountID: UUID(), epochID: UUID(), revision: UUID())
        do { _ = try await flow.recover(token: "synthetic"); fatalError("Foreign epoch accepted") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        precondition(flow.receipt == nil && !flow.busy)
        print("PASS: deletion timeout before submission sends no POST; lost acknowledgement rereads pending status without duplicate deletion; busy resets and foreign epoch is refused. Synthetic transport only; no account deleted.")
    }
}
