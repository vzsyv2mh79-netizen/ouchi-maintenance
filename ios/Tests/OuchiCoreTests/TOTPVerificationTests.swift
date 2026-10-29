import Foundation
import XCTest
@testable import OuchiCore

final class TOTPVerificationTests: XCTestCase {
    private let account = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let factor = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let challengeID = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private func configuration() throws -> CloudConfiguration {
        try CloudConfiguration(url: URL(string: "https://abcdefghijklmnopqrst.supabase.co")!, publishableKey: "sb_publishable_synthetic_key_only")
    }
    func testOnlyVerifiedTOTPFactorsAreListedAndAccountMustMatch() async throws {
        let account = account, factor = factor
        let api = try TOTPVerificationAPI(config: configuration(), transport: { request in
            XCTAssertEqual(request.httpMethod, "GET"); XCTAssertEqual(request.url?.path, "/auth/v1/user")
            let data = Data("{\"id\":\"\(account)\",\"factors\":[{\"id\":\"\(factor)\",\"factor_type\":\"totp\",\"status\":\"verified\"},{\"id\":\"33333333-3333-4333-8333-333333333333\",\"factor_type\":\"totp\",\"status\":\"unverified\"}]}".utf8)
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let factors = try await api.factors(token: "synthetic", accountID: account); XCTAssertEqual(factors.map(\.id), [factor])
        do { _ = try await api.factors(token: "synthetic", accountID: UUID()); XCTFail("Foreign account") }
        catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
    }
    func testVerificationUsesExactChallengeAndNeverPersistsOrClaimsHandoffSuccess() async throws {
        let account = account, challengeID = challengeID
        let api = try TOTPVerificationAPI(config: configuration(), transport: { request in
            XCTAssertEqual(request.httpMethod, "POST"); XCTAssertTrue(request.url!.path.hasSuffix("/verify"))
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
            XCTAssertEqual(body, ["challenge_id": challengeID.uuidString.lowercased(), "code": "123456"])
            let data = Data("{\"access_token\":\"promoted\",\"refresh_token\":\"synthetic-refresh\",\"expires_in\":3600,\"user\":{\"id\":\"\(account)\"}}".utf8)
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let challenge = TOTPChallenge(factorID: factor, id: challengeID, expiresAt: Date().addingTimeInterval(60))
        let result = try await api.verify(challenge, code: "123456", token: "synthetic", accountID: account)
        XCTAssertEqual(result.user.id, account); XCTAssertEqual(result.access_token, "promoted")
        for code in ["12345", "１２３４５６", "12345x"] {
            do { _ = try await api.verify(challenge, code: code, token: "synthetic", accountID: account); XCTFail("Invalid OTP") }
            catch { XCTAssertEqual(error as? CloudError, .invalidInput) }
        }
        let expired = TOTPChallenge(factorID: factor, id: challengeID, expiresAt: Date(timeIntervalSince1970: 0))
        do { _ = try await api.verify(expired, code: "123456", token: "synthetic", accountID: account); XCTFail("Expired") }
        catch { XCTAssertEqual(error as? CloudError, .invalidInput) }
    }
    func testChallengeChecksExistingVerifiedFactorBeforePosting() async throws {
        let account = account, factor = factor, challengeID = challengeID
        let api = try TOTPVerificationAPI(config: configuration(), transport: { request in
            let data: Data
            if request.httpMethod == "GET" {
                data = Data("{\"id\":\"\(account)\",\"factors\":[{\"id\":\"\(factor)\",\"factor_type\":\"totp\",\"status\":\"verified\"}]}".utf8)
            } else {
                XCTAssertEqual(request.url?.path, "/auth/v1/factors/" + factor.uuidString.lowercased() + "/challenge")
                XCTAssertEqual(request.httpBody, Data("{}".utf8))
                data = Data("{\"id\":\"\(challengeID)\",\"type\":\"totp\",\"expires_at\":4102444800}".utf8)
            }
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let created = try await api.challenge(factorID: factor, token: "synthetic", accountID: account)
        XCTAssertEqual(created.id, challengeID); XCTAssertEqual(created.factorID, factor)
        do { _ = try await api.challenge(factorID: UUID(), token: "synthetic", accountID: account); XCTFail("Unregistered factor") }
        catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
    }
    func testForeignVerificationProfileAndRedirectCannotPromoteSession() async throws {
        for redirected in [true, false] {
            let api = try TOTPVerificationAPI(config: configuration(), transport: { request in
                let data = Data("{\"access_token\":\"promoted\",\"refresh_token\":\"synthetic-refresh\",\"expires_in\":3600,\"user\":{\"id\":\"44444444-4444-4444-8444-444444444444\"}}".utf8)
                return (data, HTTPURLResponse(url: redirected ? URL(string: "https://example.invalid/verify")! : request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            })
            do { _ = try await api.verify(.init(factorID: factor, id: challengeID, expiresAt: Date().addingTimeInterval(60)), code: "123456", token: "synthetic", accountID: account); XCTFail("Foreign proof") }
            catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
        }
    }
    func testExactMFARefusalIsTypedButUnknown403RemainsGeneric() async throws {
        for exact in [true, false] {
            let api = HomeHandoffAPI(transport: { request in
                let data = Data((exact ? "{\"error\":\"Additional verification required\",\"code\":\"additional_verification_required\"}" : "{\"error\":\"forbidden\"}").utf8)
                return (data, HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!)
            })
            do { _ = try await api.read(requestID: challengeID, homeID: factor, epochID: account, token: "synthetic"); XCTFail("MFA required") }
            catch { if exact { XCTAssertEqual(error as? HomeHandoffAuthenticationError, .additionalVerificationRequired) } else { XCTAssertEqual(error as? CloudError, .rejected(403)) } }
        }
    }
    func testControllerDiscardsFactorReadAfterLogoutOrSameAccountRestore() async throws {
        let account = account, factor = factor, config = try configuration()
        for logout in [true, false] {
            let original = Session(access_token: "original", refresh_token: "synthetic-refresh", expires_at: 4_102_444_800, user: .init(id: account))
            let storage = TOTPTestStorage(data: try JSONEncoder().encode(original), discardWrites: false)
            let controller = SessionController(api: HouseholdAPI(config: config), storage: storage)
            _ = try await controller.restore()
            let api = TOTPVerificationAPI(config: config, transport: { request in
                if logout { try await controller.signOut() } else { _ = try await controller.restore() }
                let data = Data("{\"id\":\"\(account)\",\"factors\":[{\"id\":\"\(factor)\",\"factor_type\":\"totp\",\"status\":\"verified\"}]}".utf8)
                return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            })
            do { _ = try await controller.totpFactors(api: api, expectedAccount: account); XCTFail("Stale factor response") }
            catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
        }
    }
    func testControllerDiscardsChallengeAfterLogoutDuringResponse() async throws {
        let account = account, factor = factor, challengeID = challengeID, config = try configuration()
        let original = Session(access_token: "original", refresh_token: "synthetic-refresh", expires_at: 4_102_444_800, user: .init(id: account))
        let storage = TOTPTestStorage(data: try JSONEncoder().encode(original), discardWrites: false)
        let controller = SessionController(api: HouseholdAPI(config: config), storage: storage)
        _ = try await controller.restore()
        let api = TOTPVerificationAPI(config: config, transport: { request in
            let data: Data
            if request.httpMethod == "GET" {
                data = Data("{\"id\":\"\(account)\",\"factors\":[{\"id\":\"\(factor)\",\"factor_type\":\"totp\",\"status\":\"verified\"}]}".utf8)
            } else {
                try await controller.signOut()
                data = Data("{\"id\":\"\(challengeID)\",\"type\":\"totp\",\"expires_at\":4102444800}".utf8)
            }
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        do { _ = try await controller.totpChallenge(api: api, factorID: factor, expectedAccount: account); XCTFail("Stale challenge") }
        catch { XCTAssertEqual(error as? CloudError, .authenticationRequired) }
        XCTAssertNil(try storage.read())
    }
    func testControllerRejectsPromotionAfterLogoutAndRequiresDurableReadback() async throws {
        let account = account, config = try configuration()
        for logout in [true, false] {
            let original = Session(access_token: "original", refresh_token: "synthetic-original-refresh", expires_at: 4_102_444_800, user: .init(id: account))
            let storage = TOTPTestStorage(data: try JSONEncoder().encode(original), discardWrites: !logout)
            let controller = SessionController(api: HouseholdAPI(config: config), storage: storage)
            let restored = try await controller.restore(); XCTAssertTrue(restored)
            let api = TOTPVerificationAPI(config: config, transport: { request in
                if logout { try await controller.signOut() }
                let data = Data("{\"access_token\":\"promoted\",\"refresh_token\":\"synthetic-refresh\",\"expires_in\":3600,\"user\":{\"id\":\"\(account)\"}}".utf8)
                return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            })
            do { try await controller.verifyTOTP(api: api, challenge: .init(factorID: factor, id: challengeID, expiresAt: Date().addingTimeInterval(60)), code: "123456", expectedAccount: account); XCTFail("Must not adopt unbound/unpersisted session") }
            catch { XCTAssertEqual(error as? CloudError, logout ? .authenticationRequired : .unavailable) }
            if logout { let current = await controller.localAccount(); XCTAssertNil(current) }
            else { let current = try await controller.credentials(); XCTAssertEqual(current.access_token, "original") }
        }
    }
}
private final class TOTPTestStorage: SessionStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var data: Data?
    private let discardWrites: Bool
    init(data: Data?, discardWrites: Bool) { self.data = data; self.discardWrites = discardWrites }
    func read() throws -> Data? { lock.lock(); defer { lock.unlock() }; return data }
    func write(_ value: Data?) throws { lock.lock(); defer { lock.unlock() }; if !discardWrites { data = value } }
}
