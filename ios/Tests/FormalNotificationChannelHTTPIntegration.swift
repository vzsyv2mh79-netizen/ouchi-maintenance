import Foundation
import OuchiCore
@main struct FormalNotificationChannelHTTPIntegration {
    static let epoch = UUID(uuidString:"22222222-2222-4222-8222-222222222222")!
    static func bearer(_ mode: String) throws -> String {
        let data = try JSONSerialization.data(withJSONObject:["sub":"11111111-1111-4111-8111-111111111111","session_id":"33333333-3333-4333-8333-333333333333","exp":Int(Date().timeIntervalSince1970)+3600,"fixture":mode])
        return "e30." + data.base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"") + ".sig"
    }
    static func main() async throws {
        guard CommandLine.arguments.count == 2, let port = UInt16(CommandLine.arguments[1]) else { fatalError("Missing port") }
        let api = FormalNotificationChannelAPI(environment:.sandbox,isolatedDevelopment:true,loopbackPort:port)
        let first = try await api.load(epoch:epoch,token:bearer("read"));precondition(first.channel == .both && first.revision == 0 && !first.nativeRegistered)
        do { _ = try await api.save(.native,revision:0,epoch:epoch,token:bearer("prerequisite"));fatalError("Unregistered native accepted") }
        catch { precondition(error as? CloudError == .rejected(412)) }
        let web = try await api.save(.web,revision:0,epoch:epoch,token:bearer("web"));precondition(web.revision == 1 && web.channel == .web)
        do { _ = try await api.save(.both,revision:1,epoch:epoch,token:bearer("lost-ack"));fatalError("Lost ack confirmed") }
        catch { precondition(error as? CloudError == .rejected(503)) }
        let reread = try await api.load(epoch:epoch,token:bearer("reread"));precondition(reread.revision == 2 && reread.channel == .both)
        let retry = try await api.save(.both,revision:1,epoch:epoch,token:bearer("retry"));precondition(retry.revision == 2)
        do { _ = try await api.save(.web,revision:0,epoch:epoch,token:bearer("conflict"));fatalError("Stale edit accepted") }
        catch { precondition(error as? CloudError == .rejected(409)) }
        let registered = try await api.save(.native,revision:2,epoch:epoch,token:bearer("registered"));precondition(registered.revision == 3 && registered.nativeRegistered)
        for (mode,status) in [("changed-auth",403),("changed-enrollment",403),("redirect",302)] {
            do { _ = try await api.load(epoch:epoch,token:bearer(mode));fatalError("Changed scope accepted") }
            catch { precondition(error as? CloudError == .rejected(status)) }
        }
        for mode in ["wrong-environment","wrong-receipt-epoch","extra","mime","cache","declared-large","stream-large"] {
            do { _ = try await api.load(epoch:epoch,token:bearer(mode));fatalError("Unsafe response accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        let precancel = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try await api.load(epoch:epoch,token:bearer("precancel"))
        }
        do { _ = try await precancel.value;fatalError("Precancel accepted") } catch { precondition(error is CancellationError) }
        let delayed = Task { try await api.save(.web,revision:3,epoch:epoch,token:bearer("delayed-save")) }
        try await Task.sleep(for:.milliseconds(500));delayed.cancel()
        do { _ = try await delayed.value;fatalError("Cancelled stream accepted") }
        catch { precondition(error is CancellationError || (error as? URLError)?.code == .cancelled) }
        let afterCancel = try await api.load(epoch:epoch,token:bearer("after-cancel"))
        precondition(afterCancel.channel == .web && afterCancel.revision == 4)
        print("PASS: actual URLSession to actual channel handler, free read/save/native prerequisite, exact revision and lost-ack reread/retry, conflicts, Auth/enrollment refusal, redirect/bounds/MIME/cache and pre/midflight cancellation. Synthetic identity/database only; no Apple or notification.")
    }
}
