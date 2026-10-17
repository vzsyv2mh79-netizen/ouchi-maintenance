import Foundation

public struct AccountClosureReviewReceipt: Equatable, Sendable {
    public enum State: String, Sendable { case reviewRequired = "review_required", cancelled }
    public let reviewRequestID: UUID
    public let epochID: UUID
    public let submissionID: UUID
    public let state: State
}
public struct AccountClosureProgressReceipt: Equatable, Sendable {
    public enum State: String, Sendable { case pending, running, complete, failed }
    public let requestID: UUID
    public let epochID: UUID
    public let submissionID: UUID
    public let state: State
}
private final class ClosureReviewRedirectBlocker: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
/// Prepared client; no production endpoint is enabled. Review never means erased.
public struct AccountClosureReviewAPI: Sendable {
    private let transport: HouseholdAPI.Transport
    private let origin: String
    public init(isolatedDevelopment: Bool = false, loopbackPort: UInt16 = 3000, transport: HouseholdAPI.Transport? = nil) {
        #if DEBUG
        origin = isolatedDevelopment && loopbackPort > 0 ? "http://127.0.0.1:\(loopbackPort)" : "https://ouchi-maintenance.vercel.app"
        #else
        origin = "https://ouchi-maintenance.vercel.app"
        #endif
        self.transport = transport ?? { request in
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForResource = 35
            let session = URLSession(configuration: config, delegate: ClosureReviewRedirectBlocker(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.expectedContentLength <= 4096 else { throw CloudError.malformedResponse }
            var data = Data()
            for try await byte in bytes {
                try Task.checkCancellation()
                guard data.count < 4096 else { throw CloudError.malformedResponse }
                data.append(byte)
            }
            return (data, response)
        }
    }
    public func request(password: String, token: String, epochID: UUID, submissionID: UUID) async throws -> AccountClosureReviewReceipt {
        guard !password.isEmpty, password.count <= 1024 else { throw CloudError.invalidInput }
        guard let result = try await send(action: "request", token: token, epochID: epochID, submissionID: submissionID,
                                         extra: ["password": password, "confirmation": "REQUEST_OUCHI_ACCOUNT_DELETION"]) else { throw CloudError.malformedResponse }
        return result
    }
    public func read(token: String, epochID: UUID, submissionID: UUID) async throws -> AccountClosureReviewReceipt? {
        try await send(action: "read", token: token, epochID: epochID, submissionID: submissionID)
    }
    public func cancel(token: String, epochID: UUID, submissionID: UUID) async throws -> AccountClosureReviewReceipt? {
        try await send(action: "cancel", token: token, epochID: epochID, submissionID: submissionID,
                       extra: ["confirmation": "CANCEL_OUCHI_DELETION_REVIEW"])
    }
    /// Read-only bridge to a real deletion job after app enrollment closes.
    /// nil means progress unavailable/unmapped, never permission to resubmit.
    public func progress(token: String, epochID: UUID, submissionID: UUID) async throws -> AccountClosureProgressReceipt? {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard epochID != zero, submissionID != zero else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.utf8.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        let url = URL(string: origin + "/api/account/closure-review/progress")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"; request.timeoutInterval = 30; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpBody = try JSONEncoder().encode(["expectedEpochID": epochID.uuidString.lowercased(), "submissionID": submissionID.uuidString.lowercased()])
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (bytes, response) = try await transport(request)
        try Task.checkCancellation()
        guard response.url == url, bytes.count <= 4096, response.expectedContentLength <= 4096,
              response.mimeType == "application/json",
              response.value(forHTTPHeaderField: "Cache-Control")?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "no-store" else { throw CloudError.malformedResponse }
        if let declared = response.value(forHTTPHeaderField: "Content-Length") {
            guard !declared.isEmpty, declared.allSatisfy({ $0.isASCII && $0.isNumber }), Int(declared) == bytes.count else { throw CloudError.malformedResponse }
        }
        if response.statusCode == 401 { throw CloudError.authenticationRequired }
        guard response.statusCode == 200 || response.statusCode == 404 else { throw CloudError.rejected(response.statusCode) }
        guard let object = try JSONSerialization.jsonObject(with: bytes) as? [String: String],
              object["kind"] == "app-closure-progress/v1", object["epochID"] == epochID.uuidString.lowercased(),
              object["submissionID"] == submissionID.uuidString.lowercased() else { throw CloudError.malformedResponse }
        if response.statusCode == 404 {
            guard Set(object.keys) == ["kind", "state", "epochID", "submissionID"], object["state"] == "progress_unavailable" else { throw CloudError.malformedResponse }
            return nil
        }
        guard Set(object.keys) == ["kind", "state", "requestID", "epochID", "submissionID"],
              let raw = object["requestID"], let id = UUID(uuidString: raw), id != zero, raw == id.uuidString.lowercased(),
              let state = object["state"].flatMap(AccountClosureProgressReceipt.State.init(rawValue:)) else { throw CloudError.malformedResponse }
        return .init(requestID: id, epochID: epochID, submissionID: submissionID, state: state)
    }
    private func send(action: String, token: String, epochID: UUID, submissionID: UUID, extra: [String: String] = [:]) async throws -> AccountClosureReviewReceipt? {
        let zero = UUID(uuidString: "00000000-0000-0000-0000-000000000000")!
        guard epochID != zero, submissionID != zero else { throw CloudError.invalidInput }
        guard !token.isEmpty, token.count <= 16384, !token.contains(where: { $0.isWhitespace }) else { throw CloudError.authenticationRequired }
        try Task.checkCancellation()
        var body = extra
        body["expectedEpochID"] = epochID.uuidString.lowercased()
        body["submissionID"] = submissionID.uuidString.lowercased()
        let data = try JSONEncoder().encode(body)
        guard data.count <= 4096 else { throw CloudError.invalidInput }
        let url = URL(string: origin + "/api/account/closure-review/" + action)!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"; request.httpBody = data; request.timeoutInterval = 30
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (bytes, response) = try await transport(request)
        try Task.checkCancellation()
        guard response.url == url, bytes.count <= 4096, response.expectedContentLength <= 4096,
              response.mimeType == "application/json",
              response.value(forHTTPHeaderField: "Cache-Control")?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "no-store",
              String(data: bytes, encoding: .utf8) != nil else { throw CloudError.malformedResponse }
        if let declared = response.value(forHTTPHeaderField: "Content-Length") {
            guard !declared.isEmpty, declared.allSatisfy({ $0.isASCII && $0.isNumber }),
                  Int(declared) == bytes.count else { throw CloudError.malformedResponse }
        }
        if response.statusCode == 401 { throw CloudError.authenticationRequired }
        guard response.statusCode == (action == "request" ? 202 : 200) || (action != "request" && response.statusCode == 404) else { throw CloudError.rejected(response.statusCode) }
        guard let object = try JSONSerialization.jsonObject(with: bytes) as? [String: String],
              object["kind"] == "app-closure-review/v2", object["epochID"] == epochID.uuidString.lowercased(),
              object["submissionID"] == submissionID.uuidString.lowercased() else { throw CloudError.malformedResponse }
        if response.statusCode == 404 {
            guard Set(object.keys) == ["kind", "state", "epochID", "submissionID"], object["state"] == "review_not_found" else { throw CloudError.malformedResponse }
            return nil // No matching review only; never proof of no deletion job.
        }
        guard Set(object.keys) == ["kind", "state", "reviewRequestID", "epochID", "submissionID"],
              let raw = object["reviewRequestID"], let review = UUID(uuidString: raw), review != zero, raw == review.uuidString.lowercased(),
              let state = object["state"].flatMap(AccountClosureReviewReceipt.State.init(rawValue:)) else { throw CloudError.malformedResponse }
        return .init(reviewRequestID: review, epochID: epochID, submissionID: submissionID, state: state)
    }
}
