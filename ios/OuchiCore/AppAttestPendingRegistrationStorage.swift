import Foundation
import CoreFoundation
import CryptoKit
import Darwin

public struct AppAttestPendingRegistration: Equatable, Sendable {
    public let scope: AppAttestRegistrationScope
    public let challenge: AppAttestRegistrationChallenge
    public let attestation: Data
    public init(scope: AppAttestRegistrationScope, challenge: AppAttestRegistrationChallenge, attestation: Data, nowMilliseconds: Int64) throws {
        guard !attestation.isEmpty, attestation.count <= 131072 else { throw CloudError.invalidInput }
        _ = try AppAttestRegistrationChallenge.parse(canonicalClientData: challenge.clientData, expected: scope, nowMilliseconds: nowMilliseconds)
        self.scope = scope; self.challenge = challenge; self.attestation = attestation
    }
}

/// Serialized, bounded encrypted pending-proof storage. The injected key must
/// come from the app's device-only Keychain provider before activation. Tests
/// inject synthetic keys; this core never reads an owner's Keychain or grants
/// purchase rights. It is not yet connected to the native registration UI.
public actor AppAttestPendingRegistrationStorage {
    public typealias KeyProvider = @Sendable (UUID, UUID) throws -> SymmetricKey
    private let root: URL
    private let keyProvider: KeyProvider
    private let maximumBytes = 200_000
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
        return try directory(account: account, create: create).appendingPathComponent(epoch.uuidString.lowercased() + ".attest-pending")
    }
    private func aad(account: UUID, epoch: UUID) -> Data {
        Data(("ouchi.attest.pending.v1\u{0}" + account.uuidString.lowercased() + "\u{0}" + epoch.uuidString.lowercased()).utf8)
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
    private func decode(_ encrypted: Data, account: UUID, epoch: UUID) throws -> AppAttestPendingRegistration {
        let key = try keyProvider(account, epoch)
        guard key.bitCount == 256 else { throw CloudError.invalidInput }
        let plain = try AES.GCM.open(AES.GCM.SealedBox(combined: encrypted), using: key, authenticating: aad(account: account, epoch: epoch))
        guard let object = try JSONSerialization.jsonObject(with: plain) as? [String: Any], Set(object.keys) == Set(["version","clientDataBase64","attestationBase64"]),
              let version = object["version"] as? NSNumber, CFGetTypeID(version) != CFBooleanGetTypeID(), version == 1,
              let client = object["clientDataBase64"] as? String, client.utf8.count <= 2732, let bytes = Data(base64Encoded: client), bytes.base64EncodedString() == client,
              let proof = object["attestationBase64"] as? String, proof.utf8.count <= 174764, let attestation = Data(base64Encoded: proof), attestation.base64EncodedString() == proof,
              let c = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              let session = c["sessionID"] as? String, let sessionID = UUID(uuidString: session),
              let keyID = c["keyID"] as? String, let appID = c["appID"] as? String, let environment = c["attestEnvironment"] as? String,
              let expiry = c["expiresAt"] as? NSNumber, CFGetTypeID(expiry) != CFBooleanGetTypeID(), expiry.doubleValue.isFinite, expiry.doubleValue.rounded(.towardZero) == expiry.doubleValue,
              expiry.doubleValue > 1, expiry.doubleValue <= 9_007_199_254_740_991 else { throw CloudError.malformedResponse }
        let scope = AppAttestRegistrationScope(userID: account, sessionID: sessionID, epochID: epoch, keyID: keyID, appID: appID, environment: environment)
        // Validate an authenticated stored record at its final valid millisecond;
        // read() separately enforces the caller's current scope and wall clock.
        let challenge = try AppAttestRegistrationChallenge.parse(canonicalClientData: bytes, expected: scope, nowMilliseconds: expiry.int64Value - 1)
        return try AppAttestPendingRegistration(scope: scope, challenge: challenge, attestation: attestation, nowMilliseconds: expiry.int64Value - 1)
    }
    public func read(scope: AppAttestRegistrationScope, nowMilliseconds: Int64) throws -> AppAttestPendingRegistration? {
        guard nowMilliseconds > 0, nowMilliseconds <= 9_007_199_254_740_991 else { throw CloudError.invalidInput }
        let url = try file(account: scope.userID, epoch: scope.epochID)
        guard let data = try readBounded(url) else { return nil }
        let stored = try decode(data, account: scope.userID, epoch: scope.epochID)
        if nowMilliseconds >= stored.challenge.expiresAtMilliseconds { try FileManager.default.removeItem(at: url); return nil }
        guard stored.scope == scope else { throw CloudError.authenticationRequired }
        _ = try AppAttestRegistrationChallenge.parse(canonicalClientData: stored.challenge.clientData, expected: scope, nowMilliseconds: nowMilliseconds)
        return stored
    }
    /// An unknown existing proof must block generation rather than replacement.
    public func hasPendingRecord(account: UUID, epoch: UUID) throws -> Bool {
        try readBounded(file(account: account, epoch: epoch)) != nil
    }
    public func stage(_ pending: AppAttestPendingRegistration, nowMilliseconds: Int64) throws {
        _ = try AppAttestRegistrationChallenge.parse(canonicalClientData: pending.challenge.clientData, expected: pending.scope, nowMilliseconds: nowMilliseconds)
        if let old = try read(scope: pending.scope, nowMilliseconds: nowMilliseconds) {
            guard old == pending else { throw CloudError.invalidInput }
            try FileManager.default.setAttributes([.posixPermissions:0o600], ofItemAtPath: file(account: pending.scope.userID, epoch: pending.scope.epochID).path); return
        }
        let url = try file(account: pending.scope.userID, epoch: pending.scope.epochID, create: true)
        let retained = try FileManager.default.contentsOfDirectory(at: url.deletingLastPathComponent(), includingPropertiesForKeys: nil).filter { $0.pathExtension == "attest-pending" }
        guard retained.count < 5 else { throw CloudError.unavailable }
        let plain = try JSONSerialization.data(withJSONObject: ["version":1,"clientDataBase64":pending.challenge.clientData.base64EncodedString(),"attestationBase64":pending.attestation.base64EncodedString()])
        let key = try keyProvider(pending.scope.userID, pending.scope.epochID); guard key.bitCount == 256 else { throw CloudError.invalidInput }
        guard let encrypted = try AES.GCM.seal(plain, using: key, authenticating: aad(account: pending.scope.userID, epoch: pending.scope.epochID)).combined, encrypted.count <= maximumBytes else { throw CloudError.invalidInput }
        #if os(iOS)
        try encrypted.write(to: url, options: [.atomic, .completeFileProtection])
        #else
        // macOS synthetic fixtures retain AES-GCM and owner-only permissions;
        // iOS data-protection behavior requires its separate device validation.
        try encrypted.write(to: url, options: [.atomic])
        #endif
        try FileManager.default.setAttributes([.posixPermissions:0o600], ofItemAtPath: url.path)
    }
    public func removeAcknowledged(_ receipt: AppAttestRegistrationReceipt, scope: AppAttestRegistrationScope, nowMilliseconds: Int64) throws {
        guard receipt.scope == scope else { throw CloudError.authenticationRequired }
        guard let pending = try read(scope: scope, nowMilliseconds: nowMilliseconds) else { return }
        guard pending.challenge.requestID == receipt.requestID else { throw CloudError.invalidInput }
        try FileManager.default.removeItem(at: file(account: scope.userID, epoch: scope.epochID))
    }
    /// Explicit logout/deletion cleanup covers every retained epoch for this
    /// account, including corrupted records, without decrypting or touching keys.
    public func eraseAccount(_ account: UUID) throws {
        let folder = try directory(account: account)
        guard FileManager.default.fileExists(atPath: folder.path) else { return }
        for url in try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) where url.pathExtension == "attest-pending" {
            let name = url.deletingPathExtension().lastPathComponent
            guard let epoch = UUID(uuidString: name), epoch.uuidString.lowercased() == name else { throw CloudError.invalidInput }
            _ = try directory(account: account)
            guard try FileManager.default.attributesOfItem(atPath: url.path)[.type] as? FileAttributeType == .typeRegular else { throw CloudError.invalidInput }
            try FileManager.default.removeItem(at: url)
        }
        _ = try directory(account: account)
        guard try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil).allSatisfy({ $0.pathExtension != "attest-pending" }) else { throw CloudError.unavailable }
    }
}
