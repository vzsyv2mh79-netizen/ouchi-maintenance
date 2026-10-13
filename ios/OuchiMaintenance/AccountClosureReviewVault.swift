import Foundation
import Security
import OuchiCore

/// Immutable, device-local submission references. Never store bearer/passwords,
/// erase records on logout, or treat a local reference as server authorization.
struct AccountClosureReviewVault {
    enum Failure: Error { case invalidInput, unavailable, scopeMismatch, capacity }
    let service: String
    private func query(_ submissionID: UUID) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: "closure-review-" + submissionID.uuidString.lowercased(),
         kSecAttrSynchronizable as String: false]
    }
    private func valid(_ binding: AccountClosureReviewBinding) throws {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard !service.isEmpty, service.count <= 200,
              [binding.accountID, binding.epochID, binding.submissionID].allSatisfy({ $0 != zero }) else { throw Failure.invalidInput }
    }
    func read(submissionID: UUID) throws -> AccountClosureReviewBinding? {
        guard !service.isEmpty, service.count <= 200,
              submissionID != UUID(uuidString: "00000000-0000-0000-0000-000000000000") else { throw Failure.invalidInput }
        var q = query(submissionID); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let code = SecItemCopyMatching(q as CFDictionary, &result)
        if code == errSecItemNotFound { return nil }
        guard code == errSecSuccess, let data = result as? Data, data.count <= 1024,
              let object = try JSONSerialization.jsonObject(with: data) as? [String: String],
              Set(object.keys) == ["accountID", "epochID", "submissionID"] else { throw Failure.unavailable }
        let value = try JSONDecoder().decode(AccountClosureReviewBinding.self, from: data)
        try valid(value)
        guard value.submissionID == submissionID,
              object["accountID"] == value.accountID.uuidString.lowercased(),
              object["epochID"] == value.epochID.uuidString.lowercased(),
              object["submissionID"] == value.submissionID.uuidString.lowercased() else { throw Failure.scopeMismatch }
        return value
    }
    private func items() throws -> [[String: Any]] {
        guard !service.isEmpty, service.count <= 200 else { throw Failure.invalidInput }
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrSynchronizable as String: false, kSecReturnAttributes as String: true, kSecMatchLimit as String: kSecMatchLimitAll]
        var result: CFTypeRef?
        let code = SecItemCopyMatching(q as CFDictionary, &result)
        if code == errSecItemNotFound { return [] }
        guard code == errSecSuccess, let values = result as? [[String: Any]], values.count <= 32 else { throw Failure.unavailable }
        return values
    }
    /// Enumerate references after restart without selecting/renewing an unknown request.
    func references(accountID: UUID, epochID: UUID) throws -> [AccountClosureReviewBinding] {
        try valid(.init(accountID: accountID, epochID: epochID, submissionID: UUID()))
        var values: [AccountClosureReviewBinding] = []; var seen = Set<UUID>()
        for item in try items() {
            guard let name = item[kSecAttrAccount as String] as? String, name.hasPrefix("closure-review-"),
                  let id = UUID(uuidString: String(name.dropFirst("closure-review-".count))), seen.insert(id).inserted,
                  let saved = try read(submissionID: id) else { throw Failure.unavailable }
            if saved.accountID == accountID && saved.epochID == epochID { values.append(saved) }
        }
        return values.sorted { $0.submissionID.uuidString < $1.submissionID.uuidString }
    }
    func prepare(_ binding: AccountClosureReviewBinding) throws -> AccountClosureReviewBinding {
        try valid(binding)
        if let existing = try read(submissionID: binding.submissionID) {
            guard existing == binding else { throw Failure.scopeMismatch }; return existing
        }
        guard try items().count < 32 else { throw Failure.capacity }
        let data = try JSONEncoder().encode(["accountID": binding.accountID.uuidString.lowercased(),
                                            "epochID": binding.epochID.uuidString.lowercased(), "submissionID": binding.submissionID.uuidString.lowercased()])
        var add = query(binding.submissionID); add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let code = SecItemAdd(add as CFDictionary, nil)
        guard code == errSecSuccess || code == errSecDuplicateItem else { throw Failure.unavailable }
        guard let saved = try read(submissionID: binding.submissionID) else { throw Failure.unavailable }
        guard saved == binding else { throw Failure.scopeMismatch }
        return saved
    }
    /// Explicit local dismissal only; caller must not equate this with remote cancellation.
    func remove(_ binding: AccountClosureReviewBinding) throws {
        try valid(binding)
        guard let saved = try read(submissionID: binding.submissionID) else { return }
        guard saved == binding else { throw Failure.scopeMismatch }
        let code = SecItemDelete(query(binding.submissionID) as CFDictionary)
        guard code == errSecSuccess || code == errSecItemNotFound,
              try read(submissionID: binding.submissionID) == nil else { throw Failure.unavailable }
    }
}
