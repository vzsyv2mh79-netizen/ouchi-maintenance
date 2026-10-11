import Foundation

/// Server status only; erased files or records do not imply account completion.
public struct AccountDeletionStatus: Decodable, Sendable {
    public enum State: String, Decodable, Sendable { case pending, running, complete, failed }
    public let requestID: UUID
    public let state: State

    public static func accepted(_ data: Data, httpStatus: Int) throws -> AccountDeletionStatus {
        let result = try checked(data, httpStatus: httpStatus, expectedStatus: 202)
        guard result.state == .pending else { throw CloudError.malformedResponse }
        return result
    }

    public static func progress(_ data: Data, httpStatus: Int, expectedRequestID: UUID) throws -> AccountDeletionStatus {
        let result = try checked(data, httpStatus: httpStatus, expectedStatus: 200)
        guard result.requestID == expectedRequestID else { throw CloudError.malformedResponse }
        return result
    }

    private static func checked(_ data: Data, httpStatus: Int, expectedStatus: Int) throws -> AccountDeletionStatus {
        guard httpStatus == expectedStatus, data.count <= 4096 else { throw CloudError.malformedResponse }
        let result = try JSONDecoder().decode(AccountDeletionStatus.self, from: data)
        guard result.requestID != UUID(uuidString: "00000000-0000-0000-0000-000000000000") else { throw CloudError.malformedResponse }
        return result
    }
}
