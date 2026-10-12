import XCTest
@testable import OuchiCore

final class DeletionReceiptAPITests: XCTestCase {
    private let token = String(repeating: "A", count: 43)
    func testStatusUsesHeaderAndNoJWTOrURLSecret() async throws {
        let id = UUID(), secret = token
        let api = DeletionReceiptAPI(transport: { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Deletion-Receipt"), secret)
            XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
            XCTAssertNil(request.url?.query); XCTAssertNil(request.httpBody)
            XCTAssertFalse(request.url!.absoluteString.contains(secret))
            XCTAssertEqual(request.url!.path, "/api/account/deletion/" + id.uuidString.lowercased() + "/receipt")
            return (Data("{\"state\":\"complete\",\"notification\":\"unconfirmed\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let result = try await api.status(requestID: id, receiptToken: token)
        XCTAssertEqual(result, .complete)
    }
    func testRegistrationSendsDeadlineOnlyAndRequiresExactAcknowledgement() async throws {
        let secret = token
        let api = DeletionReceiptAPI(transport: { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer synthetic-auth")
            let json = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
            XCTAssertEqual(Set(json.keys), ["expiresAt"])
            XCTAssertFalse(String(data: request.httpBody!, encoding: .utf8)!.contains(secret))
            let data = try JSONSerialization.data(withJSONObject: ["registered": true, "expiresAt": json["expiresAt"]!] as [String: Any])
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        try await api.register(requestID: UUID(), receiptToken: token, expiresAt: Date(timeIntervalSince1970: 1800000000), bearer: "synthetic-auth")
    }
    func testChangedDeadlineAcknowledgementIsRejected() async {
        let api = DeletionReceiptAPI(transport: { request in
            (Data("{\"registered\":true,\"expiresAt\":\"2020-01-01T00:00:00.000Z\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        do { try await api.register(requestID: UUID(), receiptToken: token, expiresAt: Date(timeIntervalSince1970: 1800000000), bearer: nil); XCTFail("Mismatched acknowledgement accepted") } catch {}
    }
    func testUnauthorizedAndRedirectedResponseAreRejected() async {
        for redirect in [false, true] {
            let api = DeletionReceiptAPI(transport: { request in
                (Data("{\"state\":\"complete\"}".utf8), HTTPURLResponse(url: redirect ? URL(string: "https://foreign.invalid/receipt")! : request.url!, statusCode: redirect ? 200 : 401, httpVersion: nil, headerFields: nil)!)
            })
            do { _ = try await api.status(requestID: UUID(), receiptToken: token); XCTFail("Untrusted completion accepted") } catch {}
        }
    }
    func testNoncanonicalTokenIsRejectedBeforeTransport() async {
        let api = DeletionReceiptAPI(transport: { _ in XCTFail("Transport reached for noncanonical token"); throw CloudError.unavailable })
        for invalid in [String(repeating: "a", count: 43), String(repeating: "A", count: 42) + "B"] {
            do { _ = try await api.status(requestID: UUID(), receiptToken: invalid); XCTFail("Noncanonical token accepted") } catch {}
        }
    }
    func testInvalidTokenIsRejectedBeforeTransport() async {
        let api = DeletionReceiptAPI(transport: { _ in XCTFail("Transport reached for invalid input"); throw CloudError.unavailable })
        do { _ = try await api.status(requestID: UUID(), receiptToken: "invalid"); XCTFail("Invalid token accepted") } catch {}
    }
}
