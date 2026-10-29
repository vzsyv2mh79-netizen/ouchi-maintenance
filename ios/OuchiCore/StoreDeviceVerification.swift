import Foundation
import CryptoKit

// Consistency check only: this helper neither verifies a JWS signature nor
// authorizes a purchase, restore or ownership transfer.
public enum StoreDeviceVerification {
    public static func matches(nonce: UUID, deviceID: UUID, signedDigest: Data) -> Bool {
        guard signedDigest.count == 48 else { return false }
        let message = nonce.uuidString.lowercased() + deviceID.uuidString.lowercased()
        let expected = Data(SHA384.hash(data: Data(message.utf8)))
        return expected == signedDigest
    }
}
