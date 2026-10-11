import Foundation
import OuchiCore

@main struct AttachmentHTTPIntegration {
    static func main() async throws {
        guard CommandLine.arguments.count == 2, let port = UInt16(CommandLine.arguments[1]) else { fatalError("Missing fixture port") }
        let api = AttachmentAPI(isolatedDevelopment: true, loopbackPort: port)
        let product = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
        let attachment = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!
        let binding = try await api.binding(token: "fixture")
        precondition(binding.account != binding.epoch)
        let bytes = Data([137,80,78,71,13,10,26,10])
        try await api.upload(product: product, attachment: attachment, bytes: bytes, mime: "image/png", token: "fixture", confirmed: true)
        let file = try await api.download(attachment: attachment, token: "fixture")
        precondition(file.bytes == bytes && file.fileExtension == "png")
        try await api.remove(attachment: attachment, token: "fixture", confirmed: true)
        for token in ["oversized-control", "oversized-header"] {
            do { _ = try await api.binding(token: token); fatalError("Unbounded response accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        do { _ = try await api.binding(token: "redirect"); fatalError("Redirect followed") }
        catch { precondition(error as? CloudError == .rejected(302)) }
        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            _ = try await api.binding(token: "cancelled")
        }
        task.cancel()
        do { try await task.value; fatalError("Cancelled request accepted") }
        catch { precondition(error is CancellationError) }
        print("AttachmentHTTPIntegration PASS: actual URLSession upload/download/remove, bounded headers and stream, redirect refusal and cancellation. Synthetic loopback server only.")
    }
}
