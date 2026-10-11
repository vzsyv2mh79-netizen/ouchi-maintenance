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

/// Immutable generated/confirmed records. Device-only Keychain protects values;
/// no credential/private key or purchase entitlement is stored in this schema.
/// Not instantiated by the release app. Operations are injectable for tests.
public final class AppAttestKeyReferenceStorage: @unchecked Sendable {
    private struct Envelope: Codable { let version: Int; let reference: AppAttestKeyReference }
    private let namespace: String
    private let operations: AppAttestEncryptionKeyStorage.Operations
    private let lock=NSLock()
    public init(namespace: String, operations: AppAttestEncryptionKeyStorage.Operations = .device) throws {
        guard !namespace.isEmpty, namespace.utf8.count<=160,
              namespace.unicodeScalars.allSatisfy({ CharacterSet(charactersIn:"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-").contains($0) }) else { throw CloudError.invalidInput }
        self.namespace=namespace+".attest-reference.v1"; self.operations=operations
    }
    private func query(account: UUID, epoch: UUID? = nil, confirmed: Bool = false) throws -> [String:Any] {
        let zero=UUID(uuidString:"00000000-0000-0000-0000-000000000000")!
        guard account != zero, epoch == nil || (epoch != zero && epoch != account) else { throw CloudError.invalidInput }
        let context=LAContext();context.interactionNotAllowed=true
        var q:[String:Any]=[kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:namespace+"."+account.uuidString.lowercased(),
            kSecAttrSynchronizable as String:false,kSecUseDataProtectionKeychain as String:true,
            kSecUseAuthenticationContext as String:context]
        if let epoch { q[kSecAttrAccount as String]=epoch.uuidString.lowercased()+(confirmed ? ".confirmed" : ".generated") }
        return q
    }
    private func encoded(_ reference: AppAttestKeyReference) throws -> Data {
        let encoder=JSONEncoder();encoder.outputFormatting=[.sortedKeys]
        return try encoder.encode(Envelope(version:1,reference:reference))
    }
    private func readUnlocked(account: UUID, epoch: UUID, confirmed: Bool) throws -> AppAttestKeyReference? {
        var q=try query(account:account,epoch:epoch,confirmed:confirmed)
        q[kSecReturnAttributes as String]=true;q[kSecReturnData as String]=true;q[kSecMatchLimit as String]=kSecMatchLimitOne
        let (status,item)=operations.copy(q)
        if status==errSecItemNotFound { return nil }
        guard status==errSecSuccess, let item,
              item[kSecAttrService as String] as? String == q[kSecAttrService as String] as? String,
              item[kSecAttrAccount as String] as? String == q[kSecAttrAccount as String] as? String,
              item[kSecAttrAccessible as String] as? String == kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String,
              let sync=item[kSecAttrSynchronizable as String] as? NSNumber, sync==false,
              let bytes=item[kSecValueData as String] as? Data, !bytes.isEmpty, bytes.count<=4096 else { throw CloudError.unavailable }
        let envelope=try JSONDecoder().decode(Envelope.self,from:bytes)
        let reference=envelope.reference;try reference.validate()
        guard envelope.version==1, reference.userID==account,reference.epochID==epoch,
              try encoded(reference)==bytes else { throw CloudError.malformedResponse }
        return reference
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
}
