import Foundation
import Security
import OuchiCore

/// Immutable account/epoch/home/generation/request references only. No bearer,
/// password, owner flag or household content is persisted. Logout retains
/// uncertain references so a later login can reconcile the original request.
struct HomeManagementIntentVault {
    enum Failure: Error { case invalidInput, unavailable, scopeMismatch, capacity }
    let service: String
    private func query(_ id: UUID) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: "home-management-" + id.uuidString.lowercased(), kSecAttrSynchronizable as String: false]
    }
    private func valid(_ intent: HomeManagementIntent) throws {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard !service.isEmpty, service.utf8.count <= 200, !service.contains(where: { $0.isNewline }),
              [intent.accountID, intent.epochID, intent.homeID, intent.generation, intent.requestID].allSatisfy({ $0 != zero }) else { throw Failure.invalidInput }
    }
    private func payload(_ intent: HomeManagementIntent) -> [String: String] {
        ["accountID": intent.accountID.uuidString.lowercased(), "epochID": intent.epochID.uuidString.lowercased(),
         "homeID": intent.homeID.uuidString.lowercased(), "generation": intent.generation.uuidString.lowercased(), "requestID": intent.requestID.uuidString.lowercased()]
    }
    func read(requestID: UUID) throws -> HomeManagementIntent? {
        try valid(.init(accountID: requestID, epochID: requestID, homeID: requestID, generation: requestID, requestID: requestID))
        var q = query(requestID); q[kSecReturnData as String] = true; q[kSecReturnAttributes as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let code = SecItemCopyMatching(q as CFDictionary, &result)
        if code == errSecItemNotFound { return nil }
        guard code == errSecSuccess, let attributes = result as? [String: Any],
              attributes[kSecAttrSynchronizable as String] as? Bool != true,
              let data = attributes[kSecValueData as String] as? Data, data.count <= 1024,
              let object = try JSONSerialization.jsonObject(with: data) as? [String: String],
              Set(object.keys) == ["accountID", "epochID", "homeID", "generation", "requestID"] else { throw Failure.unavailable }
        #if os(iOS)
        guard attributes[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String else { throw Failure.unavailable }
        #endif
        let value = try JSONDecoder().decode(HomeManagementIntent.self, from: data)
        try valid(value)
        guard value.requestID == requestID, object == payload(value) else { throw Failure.scopeMismatch }
        return value
    }
    private func items() throws -> [[String: Any]] {
        try valid(.init(accountID: UUID(), epochID: UUID(), homeID: UUID(), generation: UUID(), requestID: UUID()))
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrSynchronizable as String: false, kSecReturnAttributes as String: true, kSecMatchLimit as String: kSecMatchLimitAll]
        var result: CFTypeRef?
        let code = SecItemCopyMatching(q as CFDictionary, &result)
        if code == errSecItemNotFound { return [] }
        guard code == errSecSuccess, let values = result as? [[String: Any]], values.count <= 32 else { throw Failure.unavailable }
        return values
    }
    func references(accountID: UUID, epochID: UUID, homeID: UUID) throws -> [HomeManagementIntent] {
        try valid(.init(accountID: accountID, epochID: epochID, homeID: homeID, generation: UUID(), requestID: UUID()))
        var values: [HomeManagementIntent] = []; var seen = Set<UUID>()
        for item in try items() {
            guard let name = item[kSecAttrAccount as String] as? String, name.hasPrefix("home-management-"),
                  let id = UUID(uuidString: String(name.dropFirst("home-management-".count))), seen.insert(id).inserted,
                  let value = try read(requestID: id) else { throw Failure.unavailable }
            if value.accountID == accountID && value.epochID == epochID && value.homeID == homeID { values.append(value) }
        }
        return values.sorted { $0.requestID.uuidString < $1.requestID.uuidString }
    }
    /// Save + exact readback must succeed before any management POST.
    func prepare(_ intent: HomeManagementIntent) throws -> HomeManagementIntent {
        try valid(intent)
        if let saved = try read(requestID: intent.requestID) {
            guard saved == intent else { throw Failure.scopeMismatch }; return saved
        }
        guard try items().count < 32 else { throw Failure.capacity }
        let data = try JSONEncoder().encode(payload(intent))
        var q = query(intent.requestID); q[kSecValueData as String] = data; q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let code = SecItemAdd(q as CFDictionary, nil)
        guard code == errSecSuccess || code == errSecDuplicateItem else { throw Failure.unavailable }
        guard let saved = try read(requestID: intent.requestID), saved == intent else { throw Failure.scopeMismatch }
        return saved
    }
    /// Caller requires a confirmed terminal receipt and explicit local dismissal.
    /// This removes one local reference; it never cancels or changes ownership.
    func removeConfirmed(_ intent: HomeManagementIntent) throws {
        try valid(intent)
        guard let saved = try read(requestID: intent.requestID) else { return }
        guard saved == intent else { throw Failure.scopeMismatch }
        let code = SecItemDelete(query(intent.requestID) as CFDictionary)
        guard code == errSecSuccess || code == errSecItemNotFound,
              try read(requestID: intent.requestID) == nil else { throw Failure.unavailable }
    }
    /// Receipt comes from the verified deletion flow; caller must also enforce
    /// the current account/session binding before calling this synchronous stage.
    /// Pending/failed retirement and ordinary logout retain uncertain intents.
    func eraseForCompletedAccount(accountID: UUID, epochID: UUID, receipt: AccountDeletionStatus) throws {
        try valid(.init(accountID: accountID, epochID: epochID, homeID: receipt.requestID, generation: receipt.requestID, requestID: receipt.requestID))
        guard receipt.state == .complete, receipt.epochID == epochID else { throw Failure.invalidInput }
        var scoped: [HomeManagementIntent] = []
        for item in try items() {
            guard let name = item[kSecAttrAccount as String] as? String, name.hasPrefix("home-management-"),
                  let id = UUID(uuidString: String(name.dropFirst("home-management-".count))),
                  let value = try read(requestID: id) else { throw Failure.unavailable }
            if value.accountID == accountID && value.epochID == epochID { scoped.append(value) }
        }
        for value in scoped { try removeConfirmed(value) }
    }
}
