import Foundation
import CoreFoundation
import CryptoKit

/// Scope captured from the authenticated enrollment and configured native app,
/// never from a submitted challenge. These are comparisons, not server Auth.
public struct RestoreAssertionScope: Equatable, Sendable {
    public let userID: UUID
    public let sessionID: UUID
    public let epochID: UUID
    public let keyID: String
    public let appID: String
    public let environment: String
    public let requestID: UUID
    public let proofSHA256: String
    public init(userID: UUID, sessionID: UUID, epochID: UUID, keyID: String, appID: String, environment: String, requestID: UUID, proofSHA256: String) {
        self.userID = userID; self.sessionID = sessionID; self.epochID = epochID
        self.keyID = keyID; self.appID = appID; self.environment = environment
        self.requestID = requestID; self.proofSHA256 = proofSHA256
    }
}

/// Sandbox-only parser for the exact canonical UTF8 challenge bytes returned by a future
/// server transport. No endpoint, DeviceCheck operation or local trust flag is
/// enabled here. The server must verify Apple proof and consume/persist once.
public struct RestoreAssertionChallenge: Equatable, Sendable {
    public let requestID: UUID
    public let expiresAtMilliseconds: Int64
    public let clientData: Data
    public var clientDataHash: Data { Data(SHA256.hash(data: clientData)) }
    public static func pairDigest(signedApp: String, signedTransaction: String) throws -> String {
        let values = [Data(signedApp.utf8), Data(signedTransaction.utf8)]
        guard values.allSatisfy({ !$0.isEmpty && $0.count <= 131072 }) else { throw CloudError.invalidInput }
        var message = Data("ouchi.restore.pair.v1\0".utf8)
        for value in values { message.append(Data("\(value.count):".utf8)); message.append(value) }
        return SHA256.hash(data: message).map { String(format: "%02x", $0) }.joined()
    }
    private static let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
    private static func matches(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: .regularExpression) != nil
    }
    private static func integer(_ value: Any?) throws -> Int64 {
        guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(),
              n.doubleValue.isFinite, n.doubleValue.rounded(.towardZero) == n.doubleValue,
              n.doubleValue > 0, n.doubleValue <= 9_007_199_254_740_991 else { throw CloudError.malformedResponse }
        return n.int64Value
    }
    public static func parse(canonicalClientData data: Data, expected: RestoreAssertionScope, nowMilliseconds: Int64) throws -> Self {
        guard !data.isEmpty, data.count <= 2048, nowMilliseconds > 0,
              nowMilliseconds <= 9_007_199_254_740_991,
              let c = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(c.keys) == Set(["version","purpose","nonce","issuedAt","expiresAt","userID","sessionID","epochID","requestID","keyID","appID","attestEnvironment","purchaseEnvironment","proofSHA256"]),
              try integer(c["version"]) == 1, c["purpose"] as? String == "restore_ouchi_subscription",
              let nonce = c["nonce"] as? String, matches(nonce, "^[A-Za-z0-9_-]{43}$"),
              let nonceData = Data(base64Encoded: nonce.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") + "="), nonceData.count == 32,
              nonceData.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") == nonce,
              let key = c["keyID"] as? String, matches(key, "^[A-Za-z0-9+/]{43}=$"),
              let keyData = Data(base64Encoded: key), keyData.count == 32, keyData.base64EncodedString() == key,
              key == expected.keyID,
              let app = c["appID"] as? String, matches(app, "^[A-Z0-9]{10}\\.[A-Za-z0-9][A-Za-z0-9.-]{1,200}$"), app == expected.appID,
              let environment = c["attestEnvironment"] as? String, ["development","production"].contains(environment), environment == expected.environment,
              let request = c["requestID"] as? String, matches(request, "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"),
              let requestID = UUID(uuidString: request), requestID != zero, requestID == expected.requestID,
              c["purchaseEnvironment"] as? String == "Sandbox",
              let pair = c["proofSHA256"] as? String, matches(pair, "^[0-9a-f]{64}$"), pair == expected.proofSHA256,
              expected.userID != zero, expected.sessionID != zero, expected.epochID != zero, expected.userID != expected.epochID,
              c["userID"] as? String == expected.userID.uuidString.lowercased(),
              c["sessionID"] as? String == expected.sessionID.uuidString.lowercased(),
              c["epochID"] as? String == expected.epochID.uuidString.lowercased() else { throw CloudError.malformedResponse }
        let issued = try integer(c["issuedAt"]), expiry = try integer(c["expiresAt"])
        guard expiry - issued == 300_000, issued <= nowMilliseconds, nowMilliseconds < expiry else { throw CloudError.malformedResponse }
        let canonical = "{\"version\":1,\"purpose\":\"restore_ouchi_subscription\",\"nonce\":\"\(nonce)\",\"issuedAt\":\(issued),\"expiresAt\":\(expiry),\"userID\":\"\(expected.userID.uuidString.lowercased())\",\"sessionID\":\"\(expected.sessionID.uuidString.lowercased())\",\"epochID\":\"\(expected.epochID.uuidString.lowercased())\",\"requestID\":\"\(request)\",\"keyID\":\"\(key)\",\"appID\":\"\(app)\",\"attestEnvironment\":\"\(environment)\",\"purchaseEnvironment\":\"Sandbox\",\"proofSHA256\":\"\(pair)\"}"
        // Byte equality also refuses duplicate JSON keys, booleans, escaped
        // alternatives, reordered fields and noncanonical numeric spellings.
        guard Data(canonical.utf8) == data else { throw CloudError.malformedResponse }
        return Self(requestID: requestID, expiresAtMilliseconds: expiry, clientData: data)
    }
}
