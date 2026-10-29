import Foundation
import OuchiCore

/// Actual URLSession and scoped macOS Keychain. The server's Auth is synthetic.
@main struct HomeHandoffHTTPIntegration {
    enum Failure: Error { case invalidFixture, unexpectedResult }
    struct Marker: Codable {
        let service: String
        let binding: HomeHandoffBinding
        let expiresAt: Date
    }
    static let owner = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    static let recipient = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    static let home = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    static let request = UUID(uuidString: "66666666-6666-4666-8666-666666666666")!
    static let ownerEpoch = UUID(uuidString: "99999999-9999-4999-8999-999999999999")!
    static let recipientEpoch = UUID(uuidString: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!

    @MainActor static func main() async throws {
        guard CommandLine.arguments.count == 4 else { throw Failure.invalidFixture }
        let mode = CommandLine.arguments[1], file = URL(fileURLWithPath: CommandLine.arguments[3])
        if mode == "cleanup" {
            guard FileManager.default.fileExists(atPath: file.path) else { return }
            let saved = try readMarker(file)
            let vault = HomeHandoffIntentVault(service: saved.service)
            try vault.remove(binding: saved.binding)
            guard try vault.references(accountID: recipient).isEmpty else { throw Failure.unexpectedResult }
            try FileManager.default.removeItem(at: file)
            print("PASS: scoped synthetic handoff HTTP Keychain reference removed.")
            return
        }
        guard let port = UInt16(CommandLine.arguments[2]), port > 0 else { throw Failure.invalidFixture }
        let api = HomeHandoffAPI(isolatedDevelopment: true, loopbackPort: port)
        if mode == "begin" {
            guard !FileManager.default.fileExists(atPath: file.path) else { throw Failure.invalidFixture }
            let created = try await api.create(requestID: request, homeID: home, recipientID: recipient,
                                               epochID: ownerEpoch, token: "synthetic-owner")
            guard created.state == .pending else { throw Failure.unexpectedResult }
            let binding = HomeHandoffBinding(accountID: recipient, epochID: recipientEpoch, homeID: home, requestID: request)
            let service = "dev.ouchi.review.handoff.http." + UUID().uuidString.lowercased()
            let vault = HomeHandoffIntentVault(service: service)
            let flow = HomeHandoffFlow(api: api, persist: { binding, recipientID in
                let saved = try vault.prepare(binding: binding, recipientID: recipientID)
                if !FileManager.default.fileExists(atPath: file.path) {
                    do {
                        let marker = Marker(service: service, binding: binding, expiresAt: created.expiresAt)
                        try JSONEncoder().encode(marker).write(to: file, options: .atomic)
                        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
                        guard try readMarker(file).binding == binding else { throw Failure.unexpectedResult }
                    } catch { try? vault.remove(binding: binding); throw error }
                }
                return saved
            })
            flow.bind(binding, revision: UUID())
            var failed = false
            do { _ = try await flow.decide(accept: true, token: "synthetic-recipient") }
            catch { failed = true }
            guard failed, !flow.busy, flow.status?.state == .pending,
                  try vault.read(requestID: request)?.binding == binding,
                  FileManager.default.fileExists(atPath: file.path) else { throw Failure.unexpectedResult }
            print("PASS: actual lost HTTP acceptance response preserves original protected intent and never reports completion.")
            return
        }
        guard mode == "restore" else { throw Failure.invalidFixture }
        let saved = try readMarker(file), vault = HomeHandoffIntentVault(service: saved.service)
        guard try vault.read(requestID: request)?.binding == saved.binding,
              try vault.references(accountID: owner).isEmpty else { throw Failure.unexpectedResult }
        let flow = HomeHandoffFlow(api: api) // GET recovery must not require a persistence/mutation adapter.
        flow.bind(saved.binding, revision: UUID())
        let done = try await flow.recover(token: "synthetic-recipient")
        guard done.state == .completed, done.requestID == request, done.homeID == home,
              done.expiresAt == saved.expiresAt, !flow.busy else { throw Failure.unexpectedResult }
        // Completed decisions read back without another PUT or a new request.
        guard try await flow.decide(accept: true, token: "synthetic-recipient") == done else { throw Failure.unexpectedResult }
        for (token, epoch) in [("foreign-synthetic", recipientEpoch), ("synthetic-recipient", ownerEpoch)] {
            do { _ = try await api.read(requestID: request, homeID: home, epochID: epoch, token: token); throw Failure.unexpectedResult }
            catch CloudError.authenticationRequired {}
        }
        do { _ = try await api.read(requestID: request, homeID: home, epochID: recipientEpoch, token: "fixture-redirect"); throw Failure.unexpectedResult }
        catch CloudError.rejected(302) {}
        for mode in ["oversized", "mime", "cache", "declared-large"] {
            do { _ = try await api.read(requestID: request, homeID: home, epochID: recipientEpoch, token: "fixture-" + mode); throw Failure.unexpectedResult }
            catch CloudError.malformedResponse {}
        }
        guard try vault.read(requestID: request)?.binding == saved.binding else { throw Failure.unexpectedResult }
        print("PASS: separate-process protected recovery over actual HTTP keeps request/deadline; completed decision uses GET only; foreign bearer/epoch, redirect, MIME/cache and declared/stream size refused.")
    }
    static func readMarker(_ file: URL) throws -> Marker {
        let marker = try JSONDecoder().decode(Marker.self, from: Data(contentsOf: file))
        guard marker.service.hasPrefix("dev.ouchi.review.handoff.http."),
              marker.binding.accountID == recipient, marker.binding.epochID == recipientEpoch,
              marker.binding.homeID == home, marker.binding.requestID == request else { throw Failure.invalidFixture }
        return marker
    }
}
