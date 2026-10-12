import Foundation
import CoreFoundation
import CryptoKit
import Darwin

/// Own-device SDK evidence retained for one Sandbox restore attempt. Parsing and
/// hashes only: Apple signatures and authorization are verified on the server.
public struct PendingRestore: Equatable, Sendable {
    public let scope: AppAttestRegistrationScope
    public let challenge: RestoreAssertionChallenge
    public let signedAppTransaction: String
    public let signedTransaction: String
    public let assertion: Data
    public var pairSHA256: String { get throws { try RestoreAssertionChallenge.pairDigest(signedApp: signedAppTransaction, signedTransaction: signedTransaction) } }
    public var assertionSHA256: String { SHA256.hash(data: assertion).map { String(format: "%02x", $0) }.joined() }
    public init(scope: AppAttestRegistrationScope, challenge: RestoreAssertionChallenge,
                signedAppTransaction: String, signedTransaction: String, assertion: Data, nowMilliseconds: Int64) throws {
        guard !assertion.isEmpty, assertion.count <= 131072 else { throw CloudError.invalidInput }
        let hash = try RestoreAssertionChallenge.pairDigest(signedApp: signedAppTransaction, signedTransaction: signedTransaction)
        let expected = RestoreAssertionScope(userID: scope.userID, sessionID: scope.sessionID, epochID: scope.epochID,
            keyID: scope.keyID, appID: scope.appID, environment: scope.environment, requestID: challenge.requestID, proofSHA256: hash)
        _ = try RestoreAssertionChallenge.parse(canonicalClientData: challenge.clientData, expected: expected, nowMilliseconds: nowMilliseconds)
        self.scope = scope; self.challenge = challenge; self.signedAppTransaction = signedAppTransaction
        self.signedTransaction = signedTransaction; self.assertion = assertion
        // Match the commit service's combined body bound before retaining bytes.
        let body = try JSONSerialization.data(withJSONObject: ["requestID":challenge.requestID.uuidString.lowercased(),"keyID":scope.keyID,
            "signedAppTransaction":signedAppTransaction,"signedTransaction":signedTransaction,"assertionBase64":assertion.base64EncodedString()])
        guard body.count <= 262144 else { throw CloudError.invalidInput }
    }
}

/// AES-GCM device-key storage for exact retries and status recovery. No bearer,
/// password or Apple private key is retained. An expired challenge cannot be
/// re-committed, but unknown outcome records are never silently expired: a
/// verified server status/retention reconciliation is needed before removal.
/// Not connected to live UI, Keychain or deletion cleanup yet.
public actor PendingRestoreStorage {
    public typealias KeyProvider = @Sendable (UUID, UUID) throws -> SymmetricKey
    private let root: URL
    private let keyProvider: KeyProvider
    private let maximumBytes = 350_000
    public init(root: URL, keyProvider: @escaping KeyProvider) { self.root = root.standardizedFileURL; self.keyProvider = keyProvider }
    private func directory(account: UUID, create: Bool = false) throws -> URL {
        guard root.isFileURL, account != UUID(uuidString: "00000000-0000-0000-0000-000000000000")! else { throw CloudError.invalidInput }
        let folder = root.appendingPathComponent(account.uuidString.lowercased(), isDirectory: true)
        for directory in [root, folder] {
            if FileManager.default.fileExists(atPath: directory.path) {
                guard try FileManager.default.attributesOfItem(atPath: directory.path)[.type] as? FileAttributeType == .typeDirectory else { throw CloudError.invalidInput }
            } else if create {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            }
            #if os(iOS)
            if create { var url = directory; var values = URLResourceValues(); values.isExcludedFromBackup = true; try url.setResourceValues(values) }
            #endif
        }
        return folder
    }
    private func file(account: UUID, epoch: UUID, create: Bool = false) throws -> URL {
        guard epoch != account, epoch != UUID(uuidString: "00000000-0000-0000-0000-000000000000")! else { throw CloudError.invalidInput }
        return try directory(account: account, create: create).appendingPathComponent(epoch.uuidString.lowercased() + ".restore-pending")
    }
    private func aad(account: UUID, epoch: UUID) -> Data {
        Data(("ouchi.restore.pending.v1\u{0}" + account.uuidString.lowercased() + "\u{0}" + epoch.uuidString.lowercased()).utf8)
    }
    private func readBounded(_ url: URL) throws -> Data? {
        let descriptor = open(url.path, O_RDONLY | O_NOFOLLOW)
        if descriptor < 0 { if errno == ENOENT { return nil }; throw CloudError.unavailable }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true); defer { try? handle.close() }
        var info = stat(); guard fstat(descriptor, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG, info.st_size > 0, info.st_size <= maximumBytes else { throw CloudError.malformedResponse }
        var data = Data()
        while data.count <= maximumBytes {
            guard let chunk = try handle.read(upToCount: min(16384, maximumBytes + 1 - data.count)), !chunk.isEmpty else { break }
            data.append(chunk)
        }
        guard !data.isEmpty, data.count <= maximumBytes, data.count == info.st_size else { throw CloudError.malformedResponse }
        return data
    }
    private func synchronize(_ url: URL) throws {
        // Do not acknowledge staging before the encrypted bytes and directory
        // entry have been synchronized. Failure leaves the exact record for retry.
        let fd = open(url.path,O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard fd >= 0 else { throw CloudError.unavailable }
        defer { Darwin.close(fd) }
        guard fsync(fd) == 0 else { throw CloudError.unavailable }
        let directoryFD = open(url.deletingLastPathComponent().path,O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard directoryFD >= 0 else { throw CloudError.unavailable }
        defer { Darwin.close(directoryFD) }
        guard fsync(directoryFD) == 0 else { throw CloudError.unavailable }
    }
    private func decode(_ encrypted: Data, account: UUID, epoch: UUID) throws -> PendingRestore {
        let key = try keyProvider(account, epoch); guard key.bitCount == 256 else { throw CloudError.invalidInput }
        let plain = try AES.GCM.open(AES.GCM.SealedBox(combined: encrypted), using: key, authenticating: aad(account: account, epoch: epoch))
        guard let object = try JSONSerialization.jsonObject(with: plain) as? [String: Any],
              Set(object.keys) == Set(["version","clientDataBase64","assertionBase64","signedAppTransaction","signedTransaction"]),
              let version = object["version"] as? NSNumber, CFGetTypeID(version) != CFBooleanGetTypeID(), version == 1,
              let client = object["clientDataBase64"] as? String, client.utf8.count <= 2732,
              let bytes = Data(base64Encoded: client), bytes.base64EncodedString() == client,
              let proof = object["assertionBase64"] as? String, proof.utf8.count <= 174764,
              let assertion = Data(base64Encoded: proof), assertion.base64EncodedString() == proof,
              let app = object["signedAppTransaction"] as? String, let transaction = object["signedTransaction"] as? String,
              let c = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              let session = c["sessionID"] as? String, let sessionID = UUID(uuidString: session),
              let keyID = c["keyID"] as? String, let appID = c["appID"] as? String, let environment = c["attestEnvironment"] as? String,
              let request = c["requestID"] as? String, let requestID = UUID(uuidString: request),
              let expiry = c["expiresAt"] as? NSNumber, CFGetTypeID(expiry) != CFBooleanGetTypeID(),
              expiry.doubleValue.isFinite, expiry.doubleValue.rounded(.towardZero) == expiry.doubleValue,
              expiry.doubleValue > 1, expiry.doubleValue <= 9_007_199_254_740_991 else { throw CloudError.malformedResponse }
        let scope = AppAttestRegistrationScope(userID: account, sessionID: sessionID, epochID: epoch, keyID: keyID, appID: appID, environment: environment)
        let expected = RestoreAssertionScope(userID:account,sessionID:sessionID,epochID:epoch,keyID:keyID,appID:appID,environment:environment,
            requestID:requestID,proofSHA256:try RestoreAssertionChallenge.pairDigest(signedApp:app,signedTransaction:transaction))
        // Authenticate historical bytes for status recovery, never bypass the
        // current deadline when sending a commit. Stored proof expiry is not an
        // acknowledgement that the server did not reserve or update a purchase.
        let challenge = try RestoreAssertionChallenge.parse(canonicalClientData: bytes, expected: expected, nowMilliseconds: expiry.int64Value - 1)
        return try PendingRestore(scope:scope,challenge:challenge,signedAppTransaction:app,signedTransaction:transaction,assertion:assertion,nowMilliseconds:expiry.int64Value - 1)
    }
    private func readUnlocked(scope: AppAttestRegistrationScope) throws -> PendingRestore? {
        guard let bytes = try readBounded(file(account:scope.userID,epoch:scope.epochID)) else { return nil }
        let pending = try decode(bytes,account:scope.userID,epoch:scope.epochID)
        guard pending.scope == scope else { throw CloudError.authenticationRequired }
        return pending
    }
    /// Probe only; never decrypts, reads a key or creates a directory.
    public func hasPendingRecords(account: UUID) throws -> Bool {
        let folder = try directory(account: account)
        guard FileManager.default.fileExists(atPath: folder.path) else { return false }
        return try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
            .contains { $0.pathExtension == "restore-pending" }
    }
    public func read(scope: AppAttestRegistrationScope) throws -> PendingRestore? {
        _ = try directory(account:scope.userID)
        guard FileManager.default.fileExists(atPath:root.path) else { return nil }
        let lease = try AppAttestMutationLease.acquire(root:root); defer { lease.release() }
        return try readUnlocked(scope:scope)
    }
    public func stage(_ pending: PendingRestore, nowMilliseconds: Int64) throws {
        _ = try PendingRestore(scope:pending.scope,challenge:pending.challenge,signedAppTransaction:pending.signedAppTransaction,
            signedTransaction:pending.signedTransaction,assertion:pending.assertion,nowMilliseconds:nowMilliseconds)
        _ = try directory(account:pending.scope.userID,create:true)
        let lease = try AppAttestMutationLease.acquire(root:root); defer { lease.release() }
        if let old = try readUnlocked(scope:pending.scope) {
            guard old == pending else { throw CloudError.invalidInput }
            try synchronize(file(account:pending.scope.userID,epoch:pending.scope.epochID)); return
        }
        let url = try file(account:pending.scope.userID,epoch:pending.scope.epochID,create:true)
        let files = try FileManager.default.contentsOfDirectory(at:url.deletingLastPathComponent(),includingPropertiesForKeys:nil).filter { $0.pathExtension == "restore-pending" }
        guard files.count < 5 else { throw CloudError.unavailable }
        let plain = try JSONSerialization.data(withJSONObject:["version":1,"clientDataBase64":pending.challenge.clientData.base64EncodedString(),
            "signedAppTransaction":pending.signedAppTransaction,"signedTransaction":pending.signedTransaction,"assertionBase64":pending.assertion.base64EncodedString()])
        let key = try keyProvider(pending.scope.userID,pending.scope.epochID); guard key.bitCount == 256 else { throw CloudError.invalidInput }
        guard let encrypted = try AES.GCM.seal(plain,using:key,authenticating:aad(account:pending.scope.userID,epoch:pending.scope.epochID)).combined,
              encrypted.count <= maximumBytes else { throw CloudError.invalidInput }
        #if os(iOS)
        try encrypted.write(to:url,options:[.atomic,.completeFileProtection])
        #else
        try encrypted.write(to:url,options:.atomic)
        #endif
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:url.path)
        try synchronize(url)
    }

    /// Caller must obtain a matching authenticated complete status first. This
    /// only erases exact local bytes; it does not create a purchase entitlement.
    public func removeCompleted(_ expected: PendingRestore) throws {
        guard FileManager.default.fileExists(atPath:root.path) else { return }
        let lease = try AppAttestMutationLease.acquire(root:root); defer { lease.release() }
        guard let actual = try readUnlocked(scope:expected.scope) else { return }
        guard actual == expected else { throw CloudError.invalidInput }
        try FileManager.default.removeItem(at:file(account:expected.scope.userID,epoch:expected.scope.epochID))
    }
    /// Explicit logout/deletion cleanup covers every retained epoch for this
    /// account, including corrupted records, without decrypting or touching keys.
    public func eraseAccount(_ account: UUID) throws {
        guard FileManager.default.fileExists(atPath: root.path) else { return }
        let lease = try AppAttestMutationLease.acquire(root: root); defer { lease.release() }
        let folder = try directory(account: account)
        guard FileManager.default.fileExists(atPath: folder.path) else { return }
        for url in try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) where url.pathExtension == "restore-pending" {
            let name = url.deletingPathExtension().lastPathComponent
            guard let epoch = UUID(uuidString: name), epoch.uuidString.lowercased() == name else { throw CloudError.invalidInput }
            _ = try directory(account: account)
            guard try FileManager.default.attributesOfItem(atPath: url.path)[.type] as? FileAttributeType == .typeRegular else { throw CloudError.invalidInput }
            try FileManager.default.removeItem(at: url)
        }
        _ = try directory(account: account)
        guard try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil).allSatisfy({ $0.pathExtension != "restore-pending" }) else { throw CloudError.unavailable }
    }
}
