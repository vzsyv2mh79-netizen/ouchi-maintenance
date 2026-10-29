import Foundation
import OuchiCore

@main
struct StoreDeviceVerificationSmoke {
    static func main() {
        let nonce = UUID(uuidString: "12345678-ABCD-4ABC-8ABC-123456789ABC")!
        let device = UUID(uuidString: "87654321-DCBA-4CBA-8CBA-CBA987654321")!
        // Independently generated SHA-384 vector for the lowercase ASCII UUIDs.
        let hex = "1285536639af429121e48d0cb1a737b732fff5989f6070d6e253f5611bd620c5b238e155b34dd48ea587b7e00fa2788c"
        let bytes = stride(from: 0, to: hex.count, by: 2).map { offset -> UInt8 in
            let start = hex.index(hex.startIndex, offsetBy: offset)
            return UInt8(hex[start..<hex.index(start, offsetBy: 2)], radix: 16)!
        }
        let digest = Data(bytes)
        precondition(StoreDeviceVerification.matches(nonce: nonce, deviceID: device, signedDigest: digest))
        precondition(!StoreDeviceVerification.matches(nonce: device, deviceID: nonce, signedDigest: digest))
        precondition(!StoreDeviceVerification.matches(nonce: nonce, deviceID: UUID(), signedDigest: digest))
        precondition(!StoreDeviceVerification.matches(nonce: UUID(), deviceID: device, signedDigest: digest))
        var altered = digest; altered[0] ^= 1
        precondition(!StoreDeviceVerification.matches(nonce: nonce, deviceID: device, signedDigest: altered))
        for size in [0, 32, 47, 49, 64] {
            precondition(!StoreDeviceVerification.matches(nonce: nonce, deviceID: device, signedDigest: Data(repeating: 0, count: size)))
        }
        print("PASS: StoreKit device digest consistency; synthetic vector, no signed transaction or rights")
    }
}
