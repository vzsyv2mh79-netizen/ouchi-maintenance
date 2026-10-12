import Foundation
import Security

/// Prepared adapter; not wired to the shipping app or a production endpoint.
/// Call prepare before network registration. The same request keeps its token
/// and deadline; logout must not discard a pending deletion receipt implicitly.
struct DeletionReadCredentialVault {
    struct Receipt: Codable, Equatable {
        let requestID: UUID
        let userID: UUID
        let inventoryDigest: String
        let token: String
        let expiresAt: Date
    }
    /// Metadata only. Tokens stay in the individual Keychain item.
    struct Reference: Equatable, Sendable {
        let requestID: UUID
        let userID: UUID
        let inventoryDigest: String
        let expiresAt: Date
    }
    enum Failure: Error { case unavailable, scopeMismatch, expired, invalidInput }
    let service: String

    private func query(_ requestID: UUID) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: "deletion-read-" + requestID.uuidString.lowercased(),
         kSecAttrSynchronizable as String: false]
    }
    func read(requestID: UUID) throws -> Receipt? {
        guard !service.isEmpty else { throw Failure.invalidInput }
        var q = query(requestID)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data, data.count <= 4096 else { throw Failure.unavailable }
        let saved = try JSONDecoder().decode(Receipt.self, from: data)
        guard saved.requestID == requestID else { throw Failure.scopeMismatch }
        let encoded = saved.token.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") + "="
        guard saved.token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              let bytes = Data(base64Encoded: encoded), bytes.count == 32,
              bytes.base64EncodedString() == encoded,
              saved.inventoryDigest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              saved.expiresAt.timeIntervalSince1970.isFinite else { throw Failure.invalidInput }
        return saved
    }
    /// Discover existing receipts after restart without creating or extending any.
    /// Expired references remain visible for explicit lifecycle handling.
    func references(userID: UUID? = nil) throws -> [Reference] {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard !service.isEmpty, userID != zero else { throw Failure.invalidInput }
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrSynchronizable as String: false,
            kSecReturnAttributes as String: true, kSecMatchLimit as String: kSecMatchLimitAll]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return [] }
        guard status == errSecSuccess, let items = result as? [[String: Any]], items.count <= 32 else { throw Failure.unavailable }
        var references: [Reference] = []
        var seen = Set<UUID>()
        for item in items {
            guard let account = item[kSecAttrAccount as String] as? String,
                  account.hasPrefix("deletion-read-"),
                  let request = UUID(uuidString: String(account.dropFirst("deletion-read-".count))), request != zero,
                  seen.insert(request).inserted,
                  let saved = try read(requestID: request), saved.userID != zero else { throw Failure.invalidInput }
            if userID == nil || saved.userID == userID {
                references.append(.init(requestID: saved.requestID, userID: saved.userID,
                                        inventoryDigest: saved.inventoryDigest, expiresAt: saved.expiresAt))
            }
        }
        return references.sorted { $0.requestID.uuidString < $1.requestID.uuidString }
    }
    func prepare(requestID: UUID, userID: UUID, inventoryDigest: String, expiresAt: Date) throws -> Receipt {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard requestID != zero, userID != zero, !service.isEmpty,
              inventoryDigest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              expiresAt.timeIntervalSince1970.isFinite else { throw Failure.invalidInput }
        func checked(_ saved: Receipt) throws -> Receipt {
            guard saved.userID == userID, saved.inventoryDigest == inventoryDigest,
                  saved.expiresAt == expiresAt else { throw Failure.scopeMismatch }
            guard saved.expiresAt > Date() else { throw Failure.expired }
            return saved
        }
        if let saved = try read(requestID: requestID) { return try checked(saved) }
        guard expiresAt > Date() else { throw Failure.expired }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw Failure.unavailable }
        let token = Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let proposed = Receipt(requestID: requestID, userID: userID, inventoryDigest: inventoryDigest, token: token, expiresAt: expiresAt)
        var q = query(requestID)
        q[kSecValueData as String] = try JSONEncoder().encode(proposed)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(q as CFDictionary, nil)
        guard status == errSecSuccess || status == errSecDuplicateItem else { throw Failure.unavailable }
        guard let stored = try read(requestID: requestID) else { throw Failure.unavailable }
        return try checked(stored)
    }
    /// Explicit lifecycle call after expiry or verified completion/dismissal.
    /// Production caller must confirm which scoped receipt is being removed.
    func remove(requestID: UUID) throws {
        guard !service.isEmpty else { throw Failure.invalidInput }
        let status = SecItemDelete(query(requestID) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure.unavailable }
        guard try read(requestID: requestID) == nil else { throw Failure.unavailable }
    }
}

#if canImport(OuchiCore)
import OuchiCore
extension DeletionReadCredentialVault {
    /// Recovery reads only the original item; it never creates or renews one.
    func recoveryReceipt(_ binding: OuchiCore.DeletionReceiptRecoveryFlow.Binding) throws -> OuchiCore.DeletionReceiptRecoveryFlow.Receipt? {
        guard let saved = try read(requestID: binding.requestID) else { return nil }
        guard saved.userID == binding.userID, saved.inventoryDigest == binding.inventoryDigest,
              saved.expiresAt == binding.expiresAt else { throw Failure.scopeMismatch }
        return .init(requestID: saved.requestID, userID: saved.userID, inventoryDigest: saved.inventoryDigest,
                     expiresAt: saved.expiresAt, token: saved.token)
    }
    /// Returns only the Keychain read-back; failed persistence prevents HTTP.
    func registrationReceipt(_ binding: OuchiCore.DeletionReceiptRegistrationFlow.Binding) throws -> OuchiCore.DeletionReceiptRegistrationFlow.PersistedReceipt {
        let saved = try prepare(requestID: binding.requestID, userID: binding.userID,
                                inventoryDigest: binding.inventoryDigest, expiresAt: binding.expiresAt)
        return .init(requestID: saved.requestID, userID: saved.userID, inventoryDigest: saved.inventoryDigest,
                     expiresAt: saved.expiresAt, token: saved.token)
    }
}

#endif
