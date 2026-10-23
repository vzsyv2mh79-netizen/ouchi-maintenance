import Foundation
import OuchiCore

private func check(_ value: @autoclosure () throws -> Bool) rethrows { let actual = try value(); precondition(actual) }

@main struct HomeHandoffVaultRestartSmoke {
    struct Marker: Codable { let service: String; let intent: HomeHandoffIntent }
    @MainActor static func main() throws {
        guard CommandLine.arguments.count == 3 else { fatalError("Expected save/restore and a synthetic marker") }
        let file = URL(fileURLWithPath: CommandLine.arguments[2])
        switch CommandLine.arguments[1] {
        case "save":
            let service = "dev.ouchi.review.handoff." + UUID().uuidString.lowercased()
            let vault = HomeHandoffIntentVault(service: service)
            let binding = HomeHandoffBinding(accountID: UUID(), epochID: UUID(), homeID: UUID(), requestID: UUID())
            let recipient = UUID()
            let saved = try vault.prepare(binding: binding, recipientID: recipient)
            try check(try vault.prepare(binding: binding, recipientID: recipient) == saved)
            try check(try vault.prepare(binding: binding, recipientID: nil) == saved)
            do { _ = try vault.prepare(binding: binding, recipientID: UUID()); preconditionFailure("Recipient changed") }
            catch HomeHandoffIntentVault.Failure.scopeMismatch {}
            try JSONEncoder().encode(Marker(service: service, intent: saved)).write(to: file, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            print("Synthetic handoff intent saved and immutable retry verified.")
        case "restore":
            let marker = try JSONDecoder().decode(Marker.self, from: Data(contentsOf: file))
            precondition(marker.service.hasPrefix("dev.ouchi.review.handoff."))
            let vault = HomeHandoffIntentVault(service: marker.service)
            defer { try? vault.remove(binding: marker.intent.binding) }
            try check(try vault.read(requestID: marker.intent.binding.requestID) == marker.intent)
            try check(try vault.references(accountID: marker.intent.binding.accountID) == [marker.intent])
            try check(try vault.references(accountID: UUID()).isEmpty)
            do { _ = try vault.references(accountID: UUID(uuidString: "00000000-0000-0000-0000-000000000000")!); preconditionFailure("Zero account accepted") }
            catch HomeHandoffIntentVault.Failure.invalidInput {}
            let old = marker.intent.binding
            let foreign = HomeHandoffBinding(accountID: UUID(), epochID: old.epochID, homeID: old.homeID, requestID: old.requestID)
            do { try vault.remove(binding: foreign); preconditionFailure("Foreign account removed intent") }
            catch HomeHandoffIntentVault.Failure.scopeMismatch {}
            try check(try vault.read(requestID: old.requestID) == marker.intent)
            try vault.remove(binding: old)
            try check(try vault.references(accountID: old.accountID).isEmpty)
            try FileManager.default.removeItem(at: file)
            print("Separate-process handoff restore, account filtering, scoped refusal and cleanup passed.")
        default: fatalError("Unknown synthetic phase")
        }
    }
}
