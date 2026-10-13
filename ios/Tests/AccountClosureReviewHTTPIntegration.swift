import Foundation
import OuchiCore

/// Actual default URLSession, flow and scoped macOS Keychain. Server Auth is a
/// synthetic fixture; this executable does not erase accounts or verify iOS lock.
@main struct AccountClosureReviewHTTPIntegration {
    enum Failure: Error { case invalidFixture, unexpectedResult }
    struct Marker: Codable, Equatable { let service: String; let binding: AccountClosureReviewBinding }
    static let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    static let epoch = UUID(uuidString: "99999999-9999-4999-8999-999999999999")!
    @MainActor static func main() async throws {
        guard CommandLine.arguments.count == 4 else { throw Failure.invalidFixture }
        let mode = CommandLine.arguments[1], file = URL(fileURLWithPath: CommandLine.arguments[3])
        if mode == "cleanup" {
            guard FileManager.default.fileExists(atPath: file.path) else { return }
            let marker = try JSONDecoder().decode(Marker.self, from: Data(contentsOf: file))
            guard marker.service.hasPrefix("dev.ouchi.review.closure.http."), marker.binding.accountID == account,
                  marker.binding.epochID == epoch else { throw Failure.invalidFixture }
            let vault = AccountClosureReviewVault(service: marker.service)
            for binding in try vault.references(accountID: account, epochID: epoch) { try vault.remove(binding) }
            guard try vault.references(accountID: account, epochID: epoch).isEmpty else { throw Failure.unexpectedResult }
            try FileManager.default.removeItem(at: file)
            print("PASS: exact synthetic HTTP vault scope removed.")
            return
        }
        guard let port = UInt16(CommandLine.arguments[2]), port > 0 else { throw Failure.invalidFixture }
        let api = AccountClosureReviewAPI(isolatedDevelopment: true, loopbackPort: port)
        let service: String
        var original: AccountClosureReviewBinding?
        if mode == "begin" {
            guard !FileManager.default.fileExists(atPath: file.path) else { throw Failure.invalidFixture }
            service = "dev.ouchi.review.closure.http." + UUID().uuidString.lowercased()
        } else if mode == "restore" {
            let marker = try JSONDecoder().decode(Marker.self, from: Data(contentsOf: file))
            guard marker.service.hasPrefix("dev.ouchi.review.closure.http."), marker.binding.accountID == account,
                  marker.binding.epochID == epoch else { throw Failure.invalidFixture }
            service = marker.service; original = marker.binding
        } else { throw Failure.invalidFixture }
        let vault = AccountClosureReviewVault(service: service)
        let flow = AccountClosureReviewFlow(api: api, persist: { binding in
            let saved = try vault.prepare(binding)
            if !FileManager.default.fileExists(atPath: file.path) {
                do {
                    let marker = Marker(service: service, binding: saved)
                    try JSONEncoder().encode(marker).write(to: file, options: .atomic)
                    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
                    guard try JSONDecoder().decode(Marker.self, from: Data(contentsOf: file)) == marker else { throw Failure.unexpectedResult }
                } catch { try? vault.remove(saved); throw error }
            }
            return saved
        })
        if let original { guard try vault.read(submissionID: original.submissionID) == original else { throw Failure.unexpectedResult } }
        flow.bind(accountID: account, epochID: epoch, revision: UUID(), restored: original)
        if mode == "begin" {
            var failed = false
            do { _ = try await flow.startNew(password: "synthetic-password", token: "synthetic-token") } catch { failed = true }
            guard failed, flow.resultUnconfirmed, flow.binding != nil, flow.receipt == nil else { throw Failure.unexpectedResult }
            print("PASS: actual HTTP loss keeps protected submission and unconfirmed state before restart.")
            return
        }
        guard let original else { throw Failure.invalidFixture }
        let restored = try await flow.recover(token: "synthetic-token")
        guard restored?.submissionID == original.submissionID, restored?.state == .reviewRequired,
              !flow.resultUnconfirmed else { throw Failure.unexpectedResult }
        do {
            _ = try await flow.startNew(password: "synthetic-password", token: "synthetic-token")
            throw Failure.unexpectedResult
        } catch CloudError.unavailable {}
        let cancelled = try await flow.cancel(token: "synthetic-token")
        guard cancelled?.state == .cancelled, cancelled?.reviewRequestID == restored?.reviewRequestID else { throw Failure.unexpectedResult }
        let replay = try await api.request(password: "synthetic-password", token: "synthetic-token", epochID: epoch, submissionID: original.submissionID)
        guard replay == cancelled else { throw Failure.unexpectedResult }
        let fresh = try await flow.startNew(password: "synthetic-password", token: "synthetic-token")
        guard fresh?.state == .reviewRequired, fresh?.submissionID != original.submissionID,
              try vault.references(accountID: account, epochID: epoch).count == 2 else { throw Failure.unexpectedResult }
        do {
            _ = try await api.read(token: "invalid-synthetic-token", epochID: epoch, submissionID: original.submissionID)
            throw Failure.unexpectedResult
        } catch CloudError.authenticationRequired {}
        print("PASS: separate-process protected restore, actual URLSession read/cancel/replay, pending refusal, explicit fresh nonce and invalid-bearer refusal.")
    }
}
