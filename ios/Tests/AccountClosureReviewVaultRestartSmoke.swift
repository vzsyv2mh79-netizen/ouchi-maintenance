import Foundation
import Security
import OuchiCore

private func check(_ value: @autoclosure () throws -> Bool) rethrows { let actual = try value(); precondition(actual) }
@main struct AccountClosureReviewVaultRestartSmoke {
    struct Marker: Codable { let service: String; let binding: AccountClosureReviewBinding }
    @MainActor static func main() throws {
        guard CommandLine.arguments.count == 3 else { fatalError("Synthetic save/restore marker required") }
        let file = URL(fileURLWithPath: CommandLine.arguments[2])
        switch CommandLine.arguments[1] {
        case "save":
            let service = "dev.ouchi.review.closure.test." + UUID().uuidString.lowercased()
            let vault = AccountClosureReviewVault(service: service)
            let binding = AccountClosureReviewBinding(accountID: UUID(), epochID: UUID(), submissionID: UUID())
            try check(try vault.prepare(binding) == binding)
            try check(try vault.prepare(binding) == binding)
            let wrong = AccountClosureReviewBinding(accountID: UUID(), epochID: binding.epochID, submissionID: binding.submissionID)
            do { _ = try vault.prepare(wrong); preconditionFailure("Scope overwrite") } catch AccountClosureReviewVault.Failure.scopeMismatch {}
            try JSONEncoder().encode(Marker(service: service, binding: binding)).write(to: file, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            print("PASS: synthetic protected closure reference saved with immutable retry.")
        case "restore":
            let marker = try JSONDecoder().decode(Marker.self, from: Data(contentsOf: file))
            precondition(marker.service.hasPrefix("dev.ouchi.review.closure.test."))
            let vault = AccountClosureReviewVault(service: marker.service)
            defer { try? vault.remove(marker.binding) }
            try check(try vault.read(submissionID: marker.binding.submissionID) == marker.binding)
            try check(try vault.references(accountID: marker.binding.accountID, epochID: marker.binding.epochID) == [marker.binding])
            try check(try vault.references(accountID: UUID(), epochID: marker.binding.epochID).isEmpty)
            try check(try vault.references(accountID: marker.binding.accountID, epochID: UUID()).isEmpty)
            let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: marker.service,
                kSecAttrAccount as String: "closure-review-" + marker.binding.submissionID.uuidString.lowercased(),
                kSecReturnAttributes as String: true, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
            var value: CFTypeRef?
            precondition(SecItemCopyMatching(q as CFDictionary, &value) == errSecSuccess)
            let attributes = value as! [String: Any]
            #if os(iOS)
            precondition(attributes[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
            #else
            print("iOS protection attribute and locked-device behavior remain unverified on macOS Keychain.")
            #endif
            precondition(attributes[kSecAttrSynchronizable as String] as? Bool != true)
            let stored = try JSONSerialization.jsonObject(with: attributes[kSecValueData as String] as! Data) as! [String: String]
            precondition(Set(stored.keys) == ["accountID", "epochID", "submissionID"])
            let foreign = AccountClosureReviewBinding(accountID: UUID(), epochID: marker.binding.epochID, submissionID: marker.binding.submissionID)
            do { try vault.remove(foreign); preconditionFailure("Foreign removal") } catch AccountClosureReviewVault.Failure.scopeMismatch {}
            try check(try vault.read(submissionID: marker.binding.submissionID) == marker.binding)
            try vault.remove(marker.binding)
            try check(try vault.read(submissionID: marker.binding.submissionID) == nil)
            try FileManager.default.removeItem(at: file)
            print("PASS: separate-process Keychain restore, scoped refusal, exact payload and cleanup.")
        default: fatalError("Unknown synthetic phase")
        }
    }
}
