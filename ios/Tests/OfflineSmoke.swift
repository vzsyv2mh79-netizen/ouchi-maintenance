import Foundation
import OuchiCore
@main struct OfflineSmoke {
    static func main() throws {
        let account = UUID(), other = UUID()
        let data = try JSONDecoder().decode(Household.self, from: Data(#"{"homes":[],"products":[],"tasks":[],"history":[]}"#.utf8))
        let bytes = try OfflineSnapshot(account: account, household: data).encode()
        let decoded = try OfflineSnapshot.decode(bytes, account: account)
        precondition(decoded.account == account)
        do { _ = try OfflineSnapshot.decode(bytes, account: other); fatalError("other account accepted") }
        catch { precondition(error as? CloudError == .authenticationRequired) }
        do { _ = try OfflineSnapshot.decode(Data(repeating: 0, count: 10 * 1024 * 1024 + 1), account: account); fatalError("oversize accepted") }
        catch { precondition(error as? CloudError == .invalidInput) }
        precondition(!String(decoding: bytes, as: UTF8.self).contains("access_token"))
        print("OfflineSmoke PASS: account isolation, size limit and credential-free snapshot. No filesystem/network.")
    }
}
