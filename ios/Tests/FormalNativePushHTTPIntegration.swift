import Foundation
import OuchiCore
@main struct FormalNativePushHTTPIntegration {
    static func main() async throws {
        guard CommandLine.arguments.count == 2, let port = UInt16(CommandLine.arguments[1]) else { fatalError("Missing port") }
        let api = FormalNativePushAPI(notificationEnvironment:.sandbox,purchaseEnvironment:.sandbox,isolatedDevelopment:true,loopbackPort:port)
        let epoch = UUID(uuidString:"11111111-1111-4111-8111-111111111111")!,registration = UUID(uuidString:"22222222-2222-4222-8222-222222222222")!
        let token = Data(repeating:0xab,count:32)
        let receipt = try await api.register(deviceToken:token,epoch:epoch,token:"fixture")
        precondition(receipt.registrationID == registration)
        let disabled = try await api.disable(receipt,token:"fixture");precondition(disabled)
        let unchanged = try await api.disable(receipt,token:"not-disabled");precondition(!unchanged)
        for value in ["wrong-push","wrong-purchase","wrong-epoch","oversized-header","oversized-stream","cached","wrong-mime"] {
            do { _ = try await api.register(deviceToken:token,epoch:epoch,token:value);fatalError("Unsafe reply accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        for (value,status) in [("redirect",302),("unauthorized",403)] {
            do { _ = try await api.register(deviceToken:token,epoch:epoch,token:value);fatalError("Rejected reply accepted") }
            catch { precondition(error as? CloudError == .rejected(status)) }
        }
        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            _ = try await api.register(deviceToken:token,epoch:epoch,token:"cancelled")
        };task.cancel()
        do { try await task.value;fatalError("Cancelled request accepted") } catch { precondition(error is CancellationError) }
        print("FormalNativePushHTTPIntegration PASS: actual URLSession register/disable, exact headers/body/scope, negative disable acknowledgement, streamed bounds, redirects and cancellation. Synthetic loopback; no Auth, Apple or real device.")
    }
}
