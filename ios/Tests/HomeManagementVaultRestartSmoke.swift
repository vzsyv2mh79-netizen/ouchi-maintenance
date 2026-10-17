import Foundation
import Security
import OuchiCore

private enum SmokeFailure: Error { case failed(String) }
private func check(_ value: @autoclosure () throws -> Bool, _ message: String) throws {
    guard try value() else { throw SmokeFailure.failed(message) }
}
@main struct HomeManagementVaultRestartSmoke {
    struct Marker: Codable { let service: String; let intents: [HomeManagementIntent] }
    static func clean(_ service: String) throws {
        guard service.hasPrefix("dev.ouchi.review.management.test.") else { throw SmokeFailure.failed("Synthetic namespace required") }
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrSynchronizable as String: false]
        let result = SecItemDelete(q as CFDictionary)
        try check(result == errSecSuccess || result == errSecItemNotFound, "Synthetic namespace cleanup")
    }
    @MainActor static func main() throws {
        guard CommandLine.arguments.count == 3 else { throw SmokeFailure.failed("save/restore and marker required") }
        let path = URL(fileURLWithPath: CommandLine.arguments[2])
        switch CommandLine.arguments[1] {
        case "save":
            let service = "dev.ouchi.review.management.test." + UUID().uuidString.lowercased()
            let first = HomeManagementIntent(accountID: UUID(), epochID: UUID(), homeID: UUID(), generation: UUID(), requestID: UUID())
            var intents = [first,
                .init(accountID: UUID(), epochID: first.epochID, homeID: first.homeID, generation: UUID(), requestID: UUID()),
                .init(accountID: first.accountID, epochID: UUID(), homeID: first.homeID, generation: UUID(), requestID: UUID()),
                .init(accountID: first.accountID, epochID: first.epochID, homeID: UUID(), generation: UUID(), requestID: UUID())]
            for _ in 4..<32 { intents.append(.init(accountID: UUID(), epochID: UUID(), homeID: UUID(), generation: UUID(), requestID: UUID())) }
            let marker = Marker(service: service, intents: intents)
            try JSONEncoder().encode(marker).write(to: path, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
            var saved = false
            defer { if !saved { try? clean(service); try? FileManager.default.removeItem(at: path) } }
            let vault = HomeManagementIntentVault(service: service)
            for intent in intents { try check(try vault.prepare(intent) == intent, "Exact save readback") }
            try check(try vault.prepare(first) == first, "Exact immutable retry")
            let changed = [
                HomeManagementIntent(accountID: UUID(), epochID: first.epochID, homeID: first.homeID, generation: first.generation, requestID: first.requestID),
                .init(accountID: first.accountID, epochID: UUID(), homeID: first.homeID, generation: first.generation, requestID: first.requestID),
                .init(accountID: first.accountID, epochID: first.epochID, homeID: UUID(), generation: first.generation, requestID: first.requestID),
                .init(accountID: first.accountID, epochID: first.epochID, homeID: first.homeID, generation: UUID(), requestID: first.requestID)]
            for intent in changed {
                do { _ = try vault.prepare(intent); throw SmokeFailure.failed("Foreign scope overwritten") }
                catch HomeManagementIntentVault.Failure.scopeMismatch {}
            }
            do { _ = try vault.prepare(.init(accountID: UUID(), epochID: UUID(), homeID: UUID(), generation: UUID(), requestID: UUID())); throw SmokeFailure.failed("Capacity bypass") }
            catch HomeManagementIntentVault.Failure.capacity {}
            saved = true
            print("PASS: 32 synthetic references saved; immutable scope retry and bounded admission verified.")
        case "restore":
            let marker = try JSONDecoder().decode(Marker.self, from: Data(contentsOf: path))
            guard marker.service.hasPrefix("dev.ouchi.review.management.test."), marker.intents.count == 32 else { throw SmokeFailure.failed("Synthetic marker scope") }
            defer { try? clean(marker.service); try? FileManager.default.removeItem(at: path) }
            let vault = HomeManagementIntentVault(service: marker.service), first = marker.intents[0]
            for intent in marker.intents { try check(try vault.read(requestID: intent.requestID) == intent, "Separate-process readback") }
            try check(try vault.references(accountID: first.accountID, epochID: first.epochID, homeID: first.homeID) == [first], "Triple scope filtering")
            let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: marker.service,
                kSecAttrAccount as String: "home-management-" + first.requestID.uuidString.lowercased(), kSecAttrSynchronizable as String: false,
                kSecReturnAttributes as String: true, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
            var result: CFTypeRef?
            try check(SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess, "Read synthetic attributes")
            guard let attributes = result as? [String: Any], let bytes = attributes[kSecValueData as String] as? Data else { throw SmokeFailure.failed("Synthetic attributes unavailable") }
            try check(attributes[kSecAttrSynchronizable as String] as? Bool != true, "No Keychain sync")
            let stored = try JSONSerialization.jsonObject(with: bytes) as! [String: String]
            try check(Set(stored.keys) == ["accountID", "epochID", "homeID", "generation", "requestID"], "No credentials or ownership flags")
            #if os(iOS)
            try check(attributes[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String, "iOS protection attribute")
            #else
            print("iOS protection attributes and locked-device behavior are not verified on macOS.")
            #endif
            let wrong = HomeManagementIntent(accountID: UUID(), epochID: first.epochID, homeID: first.homeID, generation: first.generation, requestID: first.requestID)
            func deletionReceipt(_ state: String, epoch: UUID) throws -> AccountDeletionStatus {
                let id = UUID()
                let data = try JSONEncoder().encode(["requestID": id.uuidString, "epochID": epoch.uuidString, "state": state])
                return try AccountDeletionStatus.progress(data, httpStatus: 200, expectedRequestID: id)
            }
            for receipt in [try deletionReceipt("pending", epoch: first.epochID), try deletionReceipt("failed", epoch: first.epochID), try deletionReceipt("complete", epoch: UUID())] {
                do { try vault.eraseForCompletedAccount(accountID: first.accountID, epochID: first.epochID, receipt: receipt); throw SmokeFailure.failed("Unconfirmed account erasure") }
                catch HomeManagementIntentVault.Failure.invalidInput {}
                try check(try vault.read(requestID: first.requestID) == first, "Unconfirmed erasure retains reference")
            }
            do { try vault.removeConfirmed(wrong); throw SmokeFailure.failed("Foreign removal") }
            catch HomeManagementIntentVault.Failure.scopeMismatch {}
            try check(try vault.read(requestID: first.requestID) == first, "Foreign removal left record intact")
            try vault.removeConfirmed(first)
            try check(try vault.read(requestID: first.requestID) == nil, "Exact local removal")
            try check(try vault.read(requestID: marker.intents[1].requestID) == marker.intents[1], "Other account retained")
            let completed = try deletionReceipt("complete", epoch: first.epochID)
            try vault.eraseForCompletedAccount(accountID: first.accountID, epochID: first.epochID, receipt: completed)
            try check(try vault.read(requestID: marker.intents[3].requestID) == nil, "Completed account clears references across its homes")
            try check(try vault.read(requestID: marker.intents[1].requestID) == marker.intents[1], "Other account retained after completion")
            try check(try vault.read(requestID: marker.intents[2].requestID) == marker.intents[2], "Other enrollment retained after completion")
            try vault.eraseForCompletedAccount(accountID: first.accountID, epochID: first.epochID, receipt: completed)
            try clean(marker.service)
            try FileManager.default.removeItem(at: path)
            print("PASS: separate-process Keychain restore, account/epoch/home isolation, exact local removal and synthetic cleanup.")
        default: throw SmokeFailure.failed("Unknown synthetic phase")
        }
    }
}
