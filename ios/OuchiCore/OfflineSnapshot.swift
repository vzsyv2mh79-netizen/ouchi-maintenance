import Foundation

/// Local viewing copy only; never evidence of authentication or paid access.
public struct OfflineSnapshot: Codable, Sendable {
    public let account: UUID
    public let savedAt: Date
    public let household: Household
    public init(account: UUID, household: Household, savedAt: Date = Date()) {
        self.account = account; self.household = household; self.savedAt = savedAt
    }
    public func encode() throws -> Data {
        let bytes = try JSONEncoder().encode(self)
        guard bytes.count <= 10 * 1024 * 1024 else { throw CloudError.invalidInput }
        return bytes
    }
    public static func decode(_ bytes: Data, account: UUID) throws -> OfflineSnapshot {
        guard bytes.count <= 10 * 1024 * 1024 else { throw CloudError.invalidInput }
        let value = try JSONDecoder().decode(Self.self, from: bytes)
        guard value.account == account else { throw CloudError.authenticationRequired }
        return value
    }
}
