import Foundation
import Security
import LocalAuthentication

/// Retention is mandatory caller policy, not an Apple entitlement expiry.
public struct AppAttestKeyReference: Codable, Equatable, Sendable {
    public let userID: UUID, sessionID: UUID, epochID: UUID, requestID: UUID
    public let keyID: String, appID: String, environment: String
    public let createdAtMilliseconds: Int64, retainUntilMilliseconds: Int64
    public var scope: AppAttestRegistrationScope {
        .init(userID:userID,sessionID:sessionID,epochID:epochID,keyID:keyID,appID:appID,environment:environment)
    }
    public init(scope: AppAttestRegistrationScope, requestID: UUID, createdAtMilliseconds: Int64, retainUntilMilliseconds: Int64) throws {
        userID=scope.userID; sessionID=scope.sessionID; epochID=scope.epochID; keyID=scope.keyID
        appID=scope.appID; environment=scope.environment; self.requestID=requestID
        self.createdAtMilliseconds=createdAtMilliseconds; self.retainUntilMilliseconds=retainUntilMilliseconds
        try validate()
    }
    fileprivate func validate() throws {
        let zero=UUID(uuidString:"00000000-0000-0000-0000-000000000000")!
        guard ![userID,sessionID,epochID,requestID].contains(zero), userID != epochID,
              ["development","production"].contains(environment),
              appID.range(of:"^[A-Z0-9]{10}\\.[A-Za-z0-9][A-Za-z0-9.-]{1,200}$",options:.regularExpression) != nil,
              keyID.range(of:"^[A-Za-z0-9+/]{43}=$",options:.regularExpression) != nil,
              let key=Data(base64Encoded:keyID), key.count==32, key.base64EncodedString()==keyID,
              createdAtMilliseconds>0, createdAtMilliseconds<=9_007_199_254_740_991,
              retainUntilMilliseconds>createdAtMilliseconds, retainUntilMilliseconds<=9_007_199_254_740_991,
              retainUntilMilliseconds-createdAtMilliseconds<=7_776_000_000 else { throw CloudError.invalidInput }
    }
    fileprivate func live(_ now: Int64) throws {
        try validate()
        guard now>=createdAtMilliseconds, now<retainUntilMilliseconds else { throw CloudError.unavailable }
    }
}

/// Durable intent BEFORE generation. Its descriptor's zero key is a marker,
/// never a DeviceCheck key, attestation input or authorization credential.
public struct AppAttestGenerationIntent: Codable, Equatable, Sendable {
    private let descriptor: AppAttestKeyReference
    private static let placeholder=Data(repeating:0,count:32).base64EncodedString()
    public var userID: UUID { descriptor.userID }
    public var epochID: UUID { descriptor.epochID }
    public init(context: AppAttestRegistrationContext, requestID: UUID, createdAtMilliseconds: Int64, retainUntilMilliseconds: Int64) throws {
        descriptor=try AppAttestKeyReference(scope:context.session(keyID:Self.placeholder).scope,requestID:requestID,createdAtMilliseconds:createdAtMilliseconds,retainUntilMilliseconds:retainUntilMilliseconds)
    }
    fileprivate func validate() throws {
        try descriptor.validate();guard descriptor.keyID==Self.placeholder else { throw CloudError.invalidInput }
    }
    public func reference(keyID: String) throws -> AppAttestKeyReference {
        try validate()
        let scope=AppAttestRegistrationScope(userID:descriptor.userID,sessionID:descriptor.sessionID,epochID:descriptor.epochID,keyID:keyID,appID:descriptor.appID,environment:descriptor.environment)
        return try AppAttestKeyReference(scope:scope,requestID:descriptor.requestID,createdAtMilliseconds:descriptor.createdAtMilliseconds,retainUntilMilliseconds:descriptor.retainUntilMilliseconds)
    }
}

/// Local cleanup intent only; never authorizes server deletion or paid access.
public struct AppAttestAccountClosure: Codable, Equatable, Sendable {
    public let accountID: UUID, requestID: UUID
    public let createdAtMilliseconds: Int64, retainUntilMilliseconds: Int64
    public init(accountID: UUID, requestID: UUID, createdAtMilliseconds: Int64, retainUntilMilliseconds: Int64) throws {
        self.accountID=accountID;self.requestID=requestID
        self.createdAtMilliseconds=createdAtMilliseconds;self.retainUntilMilliseconds=retainUntilMilliseconds
        try validate()
    }
    fileprivate func validate() throws {
        let zero=UUID(uuidString:"00000000-0000-0000-0000-000000000000")!
        guard accountID != zero,requestID != zero,createdAtMilliseconds>0,
              retainUntilMilliseconds>createdAtMilliseconds,retainUntilMilliseconds<=9_007_199_254_740_991,
              retainUntilMilliseconds-createdAtMilliseconds<=7_776_000_000 else { throw CloudError.invalidInput }
    }
}

/// Immutable generated/confirmed records. Device-only Keychain protects values;
/// no credential/private key or purchase entitlement is stored in this schema.
/// Not instantiated by the release app. Operations are injectable for tests.
public final class AppAttestKeyReferenceStorage: @unchecked Sendable {
    public struct ClosureListingOperations: Sendable {
        public let copy: @Sendable ([String: Any]) -> (OSStatus, [[String: Any]]?)
        public init(copy: @escaping @Sendable ([String: Any]) -> (OSStatus, [[String: Any]]?)) { self.copy = copy }
        public static let device = ClosureListingOperations(copy: { query in
            var value: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &value)
            return (status, value as? [[String: Any]])
        })
    }
    private struct Envelope: Codable { let version: Int; let reference: AppAttestKeyReference }
    private struct IntentEnvelope: Codable { let version: Int; let intent: AppAttestGenerationIntent }
    private struct ClosureEnvelope: Codable { let version: Int; let closure: AppAttestAccountClosure }
    private let namespace: String
    private let operations: AppAttestEncryptionKeyStorage.Operations
    private let closureListing: ClosureListingOperations
    private let lock=NSLock()
    public init(namespace: String, operations: AppAttestEncryptionKeyStorage.Operations = .device,
                closureListing: ClosureListingOperations = .device) throws {
        guard !namespace.isEmpty, namespace.utf8.count<=160,
              namespace.unicodeScalars.allSatisfy({ CharacterSet(charactersIn:"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-").contains($0) }) else { throw CloudError.invalidInput }
        self.namespace=namespace+".attest-reference.v1"; self.operations=operations; self.closureListing=closureListing
    }
    private func query(account: UUID, epoch: UUID? = nil, confirmed: Bool = false, intent: Bool = false) throws -> [String:Any] {
        let zero=UUID(uuidString:"00000000-0000-0000-0000-000000000000")!
        guard account != zero, epoch == nil || (epoch != zero && epoch != account) else { throw CloudError.invalidInput }
        let context=LAContext();context.interactionNotAllowed=true
        var q:[String:Any]=[kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:namespace+"."+account.uuidString.lowercased(),
            kSecAttrSynchronizable as String:false,kSecUseDataProtectionKeychain as String:true,
            kSecUseAuthenticationContext as String:context]
        if let epoch { q[kSecAttrAccount as String]=epoch.uuidString.lowercased()+(intent ? ".intent" : confirmed ? ".confirmed" : ".generated") }
        return q
    }
    private func encoded(_ reference: AppAttestKeyReference) throws -> Data {
        let encoder=JSONEncoder();encoder.outputFormatting=[.sortedKeys]
        return try encoder.encode(Envelope(version:1,reference:reference))
    }
    private func bytesUnlocked(_ identity: [String:Any]) throws -> Data? {
        var q=identity
        q[kSecReturnAttributes as String]=true;q[kSecReturnData as String]=true;q[kSecMatchLimit as String]=kSecMatchLimitOne
        let (status,item)=operations.copy(q)
        if status==errSecItemNotFound { return nil }
        guard status==errSecSuccess, let item,
              item[kSecAttrService as String] as? String == q[kSecAttrService as String] as? String,
              item[kSecAttrAccount as String] as? String == q[kSecAttrAccount as String] as? String,
              item[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String,
              let sync=item[kSecAttrSynchronizable as String] as? NSNumber, sync==false,
              let bytes=item[kSecValueData as String] as? Data, !bytes.isEmpty, bytes.count<=4096 else { throw CloudError.unavailable }
        return bytes
    }
    private func readUnlocked(account: UUID, epoch: UUID, confirmed: Bool) throws -> AppAttestKeyReference? {
        guard let bytes=try bytesUnlocked(query(account:account,epoch:epoch,confirmed:confirmed)) else { return nil }
        let envelope=try JSONDecoder().decode(Envelope.self,from:bytes)
        let reference=envelope.reference;try reference.validate()
        guard envelope.version==1, reference.userID==account,reference.epochID==epoch,
              try encoded(reference)==bytes else { throw CloudError.malformedResponse }
        return reference
    }
    private func intentBytes(_ intent: AppAttestGenerationIntent) throws -> Data {
        let encoder=JSONEncoder();encoder.outputFormatting=[.sortedKeys]
        return try encoder.encode(IntentEnvelope(version:1,intent:intent))
    }
    private func intentUnlocked(account: UUID, epoch: UUID) throws -> AppAttestGenerationIntent? {
        guard let bytes=try bytesUnlocked(query(account:account,epoch:epoch,intent:true)) else { return nil }
        let envelope=try JSONDecoder().decode(IntentEnvelope.self,from:bytes),intent=envelope.intent
        try intent.validate()
        guard envelope.version==1,intent.userID==account,intent.epochID==epoch,try intentBytes(intent)==bytes else { throw CloudError.malformedResponse }
        return intent
    }
    public func generationIntent(account: UUID, epoch: UUID) throws -> AppAttestGenerationIntent? {
        lock.lock();defer { lock.unlock() };return try intentUnlocked(account:account,epoch:epoch)
    }
    public func persistGenerationIntent(_ intent: AppAttestGenerationIntent) throws {
        lock.lock();defer { lock.unlock() };try intent.validate()
        guard try readUnlocked(account:intent.userID,epoch:intent.epochID,confirmed:false)==nil,
              try readUnlocked(account:intent.userID,epoch:intent.epochID,confirmed:true)==nil else { throw CloudError.invalidInput }
        if let old=try intentUnlocked(account:intent.userID,epoch:intent.epochID) {
            guard old==intent else { throw CloudError.invalidInput };return
        }
        var q=try query(account:intent.userID,epoch:intent.epochID,intent:true)
        let bytes=try intentBytes(intent);guard bytes.count<=4096 else { throw CloudError.invalidInput }
        q[kSecValueData as String]=bytes;q[kSecAttrAccessible as String]=kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status=operations.add(q)
        guard status==errSecSuccess || status==errSecDuplicateItem,
              try intentUnlocked(account:intent.userID,epoch:intent.epochID)==intent else { throw CloudError.unavailable }
    }
    /// Record even an expired COMPLETED generation, so its identifier is not
    /// lost. Normal generated()/confirmed() readers still refuse expired use.
    public func persistCompletedGeneration(_ reference: AppAttestKeyReference) throws {
        lock.lock();defer { lock.unlock() };try reference.validate()
        guard let intent=try intentUnlocked(account:reference.userID,epoch:reference.epochID),
              try intent.reference(keyID:reference.keyID)==reference else { throw CloudError.invalidInput }
        try persistUnlocked(reference,confirmed:false)
    }
    private func persistUnlocked(_ reference: AppAttestKeyReference, confirmed: Bool) throws {
        if let old=try readUnlocked(account:reference.userID,epoch:reference.epochID,confirmed:confirmed) {
            guard old==reference else { throw CloudError.invalidInput };return
        }
        var q=try query(account:reference.userID,epoch:reference.epochID,confirmed:confirmed)
        let bytes=try encoded(reference);guard bytes.count<=4096 else { throw CloudError.invalidInput }
        q[kSecValueData as String]=bytes;q[kSecAttrAccessible as String]=kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status=operations.add(q)
        guard status==errSecSuccess || status==errSecDuplicateItem,
              try readUnlocked(account:reference.userID,epoch:reference.epochID,confirmed:confirmed)==reference else { throw CloudError.unavailable }
    }
    public func persistGenerated(_ reference: AppAttestKeyReference, nowMilliseconds: Int64) throws {
        lock.lock();defer { lock.unlock() };try reference.live(nowMilliseconds)
        if let confirmed=try readUnlocked(account:reference.userID,epoch:reference.epochID,confirmed:true) {
            guard confirmed==reference else { throw CloudError.invalidInput }
        }
        try persistUnlocked(reference,confirmed:false)
    }
    public func generated(account: UUID, epoch: UUID, nowMilliseconds: Int64) throws -> AppAttestKeyReference? {
        lock.lock();defer { lock.unlock() }
        let reference=try readUnlocked(account:account,epoch:epoch,confirmed:false)
        try reference?.live(nowMilliseconds);return reference
    }
    public func confirm(_ receipt: AppAttestRegistrationReceipt, nowMilliseconds: Int64) throws {
        lock.lock();defer { lock.unlock() }
        guard let reference=try readUnlocked(account:receipt.scope.userID,epoch:receipt.scope.epochID,confirmed:false),
              reference.scope==receipt.scope, reference.requestID==receipt.requestID else { throw CloudError.invalidInput }
        try reference.live(nowMilliseconds);try persistUnlocked(reference,confirmed:true)
    }
    public func confirmed(account: UUID, epoch: UUID, nowMilliseconds: Int64) throws -> AppAttestKeyReference? {
        lock.lock();defer { lock.unlock() }
        guard let confirmed=try readUnlocked(account:account,epoch:epoch,confirmed:true) else { return nil }
        guard try readUnlocked(account:account,epoch:epoch,confirmed:false)==confirmed else { throw CloudError.malformedResponse }
        try confirmed.live(nowMilliseconds);return confirmed
    }
    public func erase(account: UUID) throws {
        lock.lock();defer { lock.unlock() }
        let q=try query(account:account),status=operations.delete(q)
        guard status==errSecSuccess || status==errSecItemNotFound else { throw CloudError.unavailable }
        var confirmation=q;confirmation[kSecMatchLimit as String]=kSecMatchLimitOne
        guard operations.copy(confirmation).0==errSecItemNotFound else { throw CloudError.unavailable }
    }
    private func closureQuery(account: UUID) throws -> [String:Any] {
        var q=try query(account:account)
        // Separate service survives erasure of generated/confirmed references.
        q[kSecAttrService as String]=namespace+".closing.v2"
        q[kSecAttrAccount as String]=account.uuidString.lowercased()
        return q
    }
    private func legacyClosureQuery(account: UUID) throws -> [String: Any] {
        var q = try closureQuery(account: account)
        q[kSecAttrService as String] = namespace+".closing."+account.uuidString.lowercased()
        q[kSecAttrAccount as String] = "closing"
        return q
    }
    private func closureBytes(_ closure: AppAttestAccountClosure) throws -> Data {
        let encoder=JSONEncoder();encoder.outputFormatting=[.sortedKeys]
        return try encoder.encode(ClosureEnvelope(version:1,closure:closure))
    }
    private func closureUnlocked(account: UUID) throws -> AppAttestAccountClosure? {
        guard let bytes = try bytesUnlocked(closureQuery(account: account)) ?? bytesUnlocked(legacyClosureQuery(account: account)) else { return nil }
        let envelope=try JSONDecoder().decode(ClosureEnvelope.self,from:bytes)
        try envelope.closure.validate()
        guard envelope.version==1,envelope.closure.accountID==account,
              try closureBytes(envelope.closure)==bytes else { throw CloudError.malformedResponse }
        return envelope.closure
    }
    /// Expired cleanup intent remains closed until explicit confirmed cleanup;
    /// expiration never grants permission to recreate registration information.
    public func pendingClosure(account: UUID) throws -> AppAttestAccountClosure? {
        lock.lock();defer { lock.unlock() };return try closureUnlocked(account:account)
    }
    /// Attributes-only lookup scoped to this app's exact closure service. Each
    /// record is then read individually; no passwords or other services are listed.
    /// Pre-v2 development records require an already known account for recovery.
    public func pendingClosures() throws -> [AppAttestAccountClosure] {
        lock.lock(); defer { lock.unlock() }
        var q = try closureQuery(account: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!)
        q.removeValue(forKey: kSecAttrAccount as String)
        q[kSecReturnAttributes as String] = true
        q[kSecMatchLimit as String] = 65
        let (status, items) = closureListing.copy(q)
        if status == errSecItemNotFound { return [] }
        guard status == errSecSuccess, let items, items.count <= 64 else { throw CloudError.unavailable }
        var seen = Set<UUID>(), records: [AppAttestAccountClosure] = []
        for item in items {
            guard item[kSecAttrService as String] as? String == namespace+".closing.v2",
                  item[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String,
                  let sync = item[kSecAttrSynchronizable as String] as? NSNumber, sync == false,
                  let text = item[kSecAttrAccount as String] as? String,
                  let account = UUID(uuidString: text), text == account.uuidString.lowercased(),
                  seen.insert(account).inserted,
                  let record = try closureUnlocked(account: account) else { throw CloudError.unavailable }
            records.append(record)
        }
        return records.sorted { $0.accountID.uuidString < $1.accountID.uuidString }
    }
    @discardableResult public func beginClosure(_ proposed: AppAttestAccountClosure) throws -> AppAttestAccountClosure {
        lock.lock();defer { lock.unlock() };try proposed.validate()
        if let existing=try closureUnlocked(account:proposed.accountID) { return existing }
        var q=try closureQuery(account:proposed.accountID)
        q[kSecValueData as String]=try closureBytes(proposed)
        q[kSecAttrAccessible as String]=kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status=operations.add(q)
        guard status==errSecSuccess || status==errSecDuplicateItem,
              let stored=try closureUnlocked(account:proposed.accountID) else { throw CloudError.unavailable }
        // A concurrent winner is returned without replacing its request/deadline.
        return stored
    }
    /// Finalize local registration cleanup only inside the exact controller's
    /// confirmed-erasure generation. This does not authorize server deletion.
    public func completeLocalClosure(confirmation: LocalSessionErasureConfirmation,
                                     session: SessionController,
                                     pending: AppAttestPendingRegistrationStorage,
                                     encryptionKeys: AppAttestEncryptionKeyStorage) async throws {
        let lease = try await pending.acquireMutationLease()
        defer { lease.release() }
        let account = confirmation.accountID
        guard let record = try pendingClosure(account: account) else { throw CloudError.authenticationRequired }
        try await session.withConfirmedErasure(confirmation) {}
        try Task.checkCancellation()
        try await pending.eraseAccount(account)
        try Task.checkCancellation()
        // No suspension between credential readback, final key erasure and
        // removal of the matching immutable closure record.
        try await session.withConfirmedErasure(confirmation) { [self] in
            try erase(account: account)
            try encryptionKeys.erase(account: account)
            try removeClosure(record)
        }
    }

    /// Explicit restart recovery for an existing local cleanup intent only.
    /// An empty credential store never authorizes a new closure or server deletion.
    /// Caller must reserve its login UI throughout this asynchronous operation.
    public func recoverAbandonedLocalClosure(expected: AppAttestAccountClosure,
                                            session: SessionController,
                                            pending: AppAttestPendingRegistrationStorage,
                                            encryptionKeys: AppAttestEncryptionKeyStorage) async throws {
        let lease = try await pending.acquireMutationLease()
        defer { lease.release() }
        guard try pendingClosure(account: expected.accountID) == expected else { throw CloudError.authenticationRequired }
        let permit = try await session.prepareLocalClosureRecovery(accountID: expected.accountID)
        try Task.checkCancellation()
        try await pending.eraseAccount(expected.accountID)
        try Task.checkCancellation()
        try await session.withLocalClosureRecovery(permit) { [self] in
            guard try pendingClosure(account: expected.accountID) == expected else { throw CloudError.authenticationRequired }
            try erase(account: expected.accountID)
            try encryptionKeys.erase(account: expected.accountID)
            try removeClosure(expected)
        }
    }

    func removeClosure(_ expected: AppAttestAccountClosure) throws {
        lock.lock();defer { lock.unlock() }
        guard try closureUnlocked(account:expected.accountID)==expected else { throw CloudError.authenticationRequired }
        for q in [try closureQuery(account: expected.accountID), try legacyClosureQuery(account: expected.accountID)] {
            let status = operations.delete(q)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw CloudError.unavailable }
        }
        guard try closureUnlocked(account: expected.accountID) == nil else { throw CloudError.unavailable }
    }
}
