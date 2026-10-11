import Foundation
import OuchiCore
@main struct AccountEnrollmentHTTPIntegration {
    static let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    static func bearer(_ mode: String) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: ["sub":account.uuidString.lowercased(),"session_id":"33333333-3333-4333-8333-333333333333","exp":Int(Date().timeIntervalSince1970)+3600,"fixture":mode])
        return "e30." + data.base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"") + ".sig"
    }
    static func main() async throws {
        guard CommandLine.arguments.count == 2, let port = UInt16(CommandLine.arguments[1]) else { fatalError("Missing port") }
        let api = AccountEnrollmentAPI(isolatedDevelopment: true, loopbackPort: port)
        let initial = try await api.load(account: account, token: bearer("absent"));precondition(!initial.enrolled)
        do { _ = try await api.register(account: account, token: bearer("lost-ack"), password: "synthetic", requestID: UUID());fatalError("Lost acknowledgement confirmed") }
        catch { precondition(error as? CloudError == .rejected(503)) }
        let readback = try await api.load(account: account, token: bearer("readback"));precondition(readback.enrolled)
        for mode in ["wrong-password","wrong-proof","changed-auth"] {
            do { _ = try await api.register(account: account, token: bearer(mode), password: "synthetic", requestID: UUID());fatalError("Failed proof confirmed") }
            catch { precondition(error as? CloudError == .rejected(503)) }
        }
        do { _ = try await api.load(account: account, token: bearer("redirect"));fatalError("Redirect accepted") }
        catch { precondition(error as? CloudError == .rejected(302)) }
        for mode in ["wrong-session","wrong-epoch","extra","mime","cache","declared-large","stream-large"] {
            do { _ = try await api.load(account: account, token: bearer(mode));fatalError("Invalid response accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        let precancel = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try await api.load(account: account, token: bearer("precancel"))
        }
        do { _ = try await precancel.value;fatalError("Precancel accepted") } catch { precondition(error is CancellationError) }
        let pending = Task { try await api.register(account: account, token: bearer("delayed"), password: "synthetic", requestID: UUID()) }
        try await Task.sleep(for: .milliseconds(500));pending.cancel()
        do { _ = try await pending.value;fatalError("Cancelled acknowledgement accepted") }
        catch { precondition(error is CancellationError || (error as? URLError)?.code == .cancelled) }
        let afterCancel = try await api.load(account: account, token: bearer("after-cancel"));precondition(afterCancel.epochID == readback.epochID)
        print("PASS: actual native URLSession to enrollment handler; absent status, lost-ack readback, wrong password/proof/Auth refusal, redirect/size/MIME/cache/identity refusal, pre/midflight cancellation. Synthetic Auth/DB only.")
    }
}
