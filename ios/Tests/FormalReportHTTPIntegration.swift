import Foundation
import OuchiCore

@main struct FormalReportHTTPIntegration {
    static func main() async throws {
        guard CommandLine.arguments.count == 2, let port = UInt16(CommandLine.arguments[1]) else { fatalError("Missing fixture port") }
        let api = FormalReportAPI(environment: .sandbox, isolatedDevelopment: true, loopbackPort: port)
        let home = "11111111-1111-4111-8111-111111111111"
        let epoch = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
        let report = try await api.load(home: home, epoch: epoch, token: "fixture")
        precondition(report.homeId == home && report.overdue == 1)
        for token in ["wrong-environment", "wrong-epoch", "oversized-header", "oversized-stream", "wrong-mime", "cached"] {
            do { _ = try await api.load(home: home, epoch: epoch, token: token); fatalError("Unsafe formal report accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        for (token, status) in [("redirect", 302), ("unauthorized", 403)] {
            do { _ = try await api.load(home: home, epoch: epoch, token: token); fatalError("Rejected response accepted") }
            catch { precondition(error as? CloudError == .rejected(status)) }
        }
        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            _ = try await api.load(home: home, epoch: epoch, token: "cancelled")
        }
        task.cancel()
        do { try await task.value; fatalError("Cancelled request accepted") }
        catch { precondition(error is CancellationError) }
        print("FormalReportHTTPIntegration PASS: real URLSession request, exact binding headers, report validation, streamed/declared bounds, redirect refusal and cancellation. Synthetic loopback only; no Apple or live account.")
    }
}
