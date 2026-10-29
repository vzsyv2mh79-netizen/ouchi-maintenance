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
    func references(accountID: UUID, epochID: UUID? = nil) throws -> [AccountClosureReviewBinding] {
        try valid(.init(accountID: accountID, epochID: epochID ?? accountID, submissionID: UUID()))
        var values: [AccountClosureReviewBinding] = []; var seen = Set<UUID>()
        for item in try items() {
            guard let name = item[kSecAttrAccount as String] as? String, name.hasPrefix("closure-review-"),
                  let id = UUID(uuidString: String(name.dropFirst("closure-review-".count))), seen.insert(id).inserted,
                  let saved = try read(submissionID: id) else { throw Failure.unavailable }
            if saved.accountID == accountID && (epochID == nil || saved.epochID == epochID) { values.append(saved) }
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

/// Ouchi-only read capability custody. Separate service/shape from historical
/// shared-account deletion receipts. Logout never deletes these records.
struct ClosureReadCredentialVault {
    enum Failure: Error { case unavailable, invalidInput, scopeMismatch, expired, capacity }
    let service: String
    private struct Envelope: Codable { let kind: String; let credential: ClosureReadCredential }
    private func query(_ requestID: UUID) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: "ouchi-closure-read-" + requestID.uuidString.lowercased(), kSecAttrSynchronizable as String: false]
    }
    private func validate(_ saved: ClosureReadCredential) throws {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard !service.isEmpty, service.count <= 200,
              [saved.accountID, saved.scope.requestID, saved.scope.epochID, saved.scope.submissionID, saved.credentialID].allSatisfy({ $0 != zero }),
              saved.expiresAt.timeIntervalSince1970.isFinite,
              saved.token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw Failure.invalidInput }
        let encoded = saved.token.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") + "="
        guard let bytes = Data(base64Encoded: encoded), bytes.count == 32, bytes.base64EncodedString() == encoded else { throw Failure.invalidInput }
    }
    func read(requestID: UUID) throws -> ClosureReadCredential? {
        guard !service.isEmpty, service.count <= 200,
              requestID != UUID(uuidString: "00000000-0000-0000-0000-000000000000") else { throw Failure.invalidInput }
        var q = query(requestID); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let code = SecItemCopyMatching(q as CFDictionary, &result)
        if code == errSecItemNotFound { return nil }
        guard code == errSecSuccess, let data = result as? Data, data.count <= 4096,
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], Set(object.keys) == ["kind", "credential"],
              let nested = object["credential"] as? [String: Any], Set(nested.keys) == ["accountID", "scope", "credentialID", "expiresAt", "token"],
              let scope = nested["scope"] as? [String: Any], Set(scope.keys) == ["requestID", "epochID", "submissionID"] else { throw Failure.unavailable }
        let envelope = try JSONDecoder().decode(Envelope.self, from: data)
        guard envelope.kind == "ouchi-closure-read-custody/v1", envelope.credential.scope.requestID == requestID else { throw Failure.scopeMismatch }
        var attributesQuery = query(requestID)
        attributesQuery[kSecReturnAttributes as String] = true; attributesQuery[kSecMatchLimit as String] = kSecMatchLimitOne
        var attributesResult: CFTypeRef?
        guard SecItemCopyMatching(attributesQuery as CFDictionary, &attributesResult) == errSecSuccess,
              let attributes = attributesResult as? [String: Any],
              attributes[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String,
              attributes[kSecAttrSynchronizable as String] as? Bool == false else { throw Failure.unavailable }
        try validate(envelope.credential); return envelope.credential
    }
    func read(_ binding: ClosureReadCustodyFlow.Binding) throws -> ClosureReadCredential? {
        guard let saved = try read(requestID: binding.scope.requestID) else { return nil }
        guard saved.accountID == binding.accountID, saved.scope == binding.scope else { throw Failure.scopeMismatch }
        return saved
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
    struct Reference: Equatable {
        let accountID: UUID
        let scope: ClosureReadScope
        let credentialID: UUID
        let expiresAt: Date
    }
    func references(accountID: UUID? = nil) throws -> [Reference] {
        guard accountID != UUID(uuidString: "00000000-0000-0000-0000-000000000000") else { throw Failure.invalidInput }
        var seen = Set<UUID>(), result: [Reference] = []
        for item in try items() {
            guard let name = item[kSecAttrAccount as String] as? String, name.hasPrefix("ouchi-closure-read-"),
                  let id = UUID(uuidString: String(name.dropFirst("ouchi-closure-read-".count))), seen.insert(id).inserted,
                  let saved = try read(requestID: id) else { throw Failure.unavailable }
            if accountID == nil || accountID == saved.accountID {
                result.append(.init(accountID: saved.accountID, scope: saved.scope, credentialID: saved.credentialID, expiresAt: saved.expiresAt))
            }
        }
        return result.sorted { $0.scope.requestID.uuidString < $1.scope.requestID.uuidString }
    }
    func prepare(_ binding: ClosureReadCustodyFlow.Binding, window: ClosureReadWindow) throws -> ClosureReadCredential {
        guard window.scope == binding.scope, window.expiresAt > Date(), window.expiresAt <= Date().addingTimeInterval(30 * 86400) else { throw Failure.invalidInput }
        if let saved = try read(binding) {
            guard saved.expiresAt == window.expiresAt else { throw Failure.scopeMismatch }
            guard saved.expiresAt > Date() else { throw Failure.expired }; return saved
        }
        guard try items().count < 32 else { throw Failure.capacity }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw Failure.unavailable }
        let token = Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let saved = ClosureReadCredential(accountID: binding.accountID, scope: binding.scope, credentialID: UUID(), expiresAt: window.expiresAt, token: token)
        try validate(saved)
        var add = query(binding.scope.requestID); add[kSecValueData as String] = try JSONEncoder().encode(Envelope(kind: "ouchi-closure-read-custody/v1", credential: saved))
        add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let code = SecItemAdd(add as CFDictionary, nil)
        guard code == errSecSuccess || code == errSecDuplicateItem else { throw Failure.unavailable }
        guard let stored = try read(binding), stored.expiresAt == window.expiresAt else { throw Failure.unavailable }
        return stored
    }
    #if DEBUG
    /// Isolated UI fixture only. Release cannot seed expired credentials.
    func seedExpiredReviewCredential(_ binding: ClosureReadCustodyFlow.Binding) throws {
        guard Bundle.main.bundleIdentifier == "dev.ouchi.review.closure",
              Bundle.main.infoDictionary?["OUCHI_REVIEW_SAMPLE_DATA"] as? String == "YES",
              service == "dev.ouchi.review.closure.ouchi-only-custody",
              binding.scope.requestID == UUID(uuidString: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee") else { throw Failure.invalidInput }
        let saved = ClosureReadCredential(accountID: binding.accountID, scope: binding.scope, credentialID: UUID(),
            expiresAt: Date().addingTimeInterval(-3600), token: Data(repeating: 42, count: 32).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: ""))
        try validate(saved)
        var q = query(saved.scope.requestID)
        q[kSecValueData as String] = try JSONEncoder().encode(Envelope(kind: "ouchi-closure-read-custody/v1", credential: saved))
        q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess, try read(binding) == saved else { throw Failure.unavailable }
    }
    #endif
    /// Expiry never proves server completion. Only the exact expired local
    /// reference may be discarded; no API, renewal or new submission follows.
    func removeExpired(_ reference: Reference) throws {
        guard reference.expiresAt.timeIntervalSince1970.isFinite, reference.expiresAt <= Date() else { throw Failure.invalidInput }
        try remove(reference)
    }
    /// Explicit local lifecycle only, never remote cancellation or renewal.
    func remove(_ reference: Reference) throws {
        guard let saved = try read(requestID: reference.scope.requestID) else { return }
        guard saved.accountID == reference.accountID, saved.scope == reference.scope,
              saved.credentialID == reference.credentialID, saved.expiresAt == reference.expiresAt else { throw Failure.scopeMismatch }
        let code = SecItemDelete(query(saved.scope.requestID) as CFDictionary)
        guard code == errSecSuccess || code == errSecItemNotFound, try read(requestID: saved.scope.requestID) == nil else { throw Failure.unavailable }
    }
}
