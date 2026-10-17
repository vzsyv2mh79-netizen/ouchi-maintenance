import Foundation
import OuchiCore

/// Actual default URLSession + native clients/flow -> owned HTTP/Auth/SQL.
/// File custody below is a fixture; iOS Keychain/UI have separate witnesses.
@main struct NativeAccountIntakeService {
    struct Input: Decodable { let email: String; let password: String; let publicKey: String; let backendPort: UInt16; let marker: String }
    enum Failure: Error { case unexpectedResult }
    @MainActor static func main() async throws {
        let input = try JSONDecoder().decode(Input.self, from: FileHandle.standardInput.readDataToEndOfFile())
        guard input.email.hasSuffix("@example.invalid"), input.backendPort > 0 else { throw Failure.unexpectedResult }
        let config = try CloudConfiguration(url: URL(string:"http://127.0.0.1:54321")!, publishableKey:input.publicKey, isolatedDevelopment:true)
        let auth = HouseholdAPI(config:config)
        let session = try await auth.signIn(email:input.email,password:input.password)
        let account = session.user.id, token = session.access_token
        let enrollment = AccountEnrollmentAPI(isolatedDevelopment:true,loopbackPort:input.backendPort)
        let before = try await enrollment.load(account:account,token:token)
        guard !before.enrolled else { throw Failure.unexpectedResult }
        let epoch = try await enrollment.register(account:account,token:token,password:input.password,requestID:UUID())
        let after = try await enrollment.load(account:account,token:token)
        guard after.enrolled, after.epochID == epoch, before.sessionID == after.sessionID else { throw Failure.unexpectedResult }
        let marker = URL(fileURLWithPath:input.marker)
        var persisted = 0
        let api = AccountClosureReviewAPI(isolatedDevelopment:true,loopbackPort:input.backendPort)
        let flow = AccountClosureReviewFlow(api:api,persist:{ binding in
            persisted += 1
            let bytes = try JSONEncoder().encode(binding)
            try bytes.write(to:marker,options:.atomic)
            try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:marker.path)
            let readback = try JSONDecoder().decode(AccountClosureReviewBinding.self,from:Data(contentsOf:marker))
            guard readback == binding else { throw Failure.unexpectedResult }
            return readback
        })
        flow.bind(accountID:account,epochID:epoch,revision:UUID())
        do { _ = try await flow.startNew(password:"Wrong-synthetic-password",token:token); throw Failure.unexpectedResult }
        catch CloudError.rejected(403) {}
        guard let original = flow.binding, flow.resultUnconfirmed, persisted == 1 else { throw Failure.unexpectedResult }
        _ = try await flow.refresh(token:token)
        guard flow.canRetrySameSubmission else { throw Failure.unexpectedResult }
        do { _ = try await flow.retry(password:input.password,token:token); throw Failure.unexpectedResult }
        catch CloudError.rejected(503) {}
        guard flow.binding == original, flow.resultUnconfirmed, persisted == 1 else { throw Failure.unexpectedResult }
        // Reconstruct caller from the saved exact reference after lost reply.
        let restored = try JSONDecoder().decode(AccountClosureReviewBinding.self,from:Data(contentsOf:marker))
        let restarted = AccountClosureReviewFlow(api:api)
        restarted.bind(accountID:account,epochID:epoch,revision:UUID(),restored:restored)
        let receipt = try await restarted.refresh(token:token)
        guard receipt?.state == .reviewRequired, receipt?.submissionID == original.submissionID, !restarted.canRetrySameSubmission else { throw Failure.unexpectedResult }
        let cancelled = try await restarted.cancel(token:token)
        guard cancelled?.state == .cancelled, cancelled?.submissionID == original.submissionID, persisted == 1 else { throw Failure.unexpectedResult }
        let report:[String:Any] = ["status":"passed","accountID":account.uuidString.lowercased(),"sessionID":after.sessionID.uuidString.lowercased(),"epochID":epoch.uuidString.lowercased(),"submissionID":original.submissionID.uuidString.lowercased(),"persistedReferences":persisted,"actualDefaultURLSession":true,"fixtureFileCustodyNotIOSKeychain":true]
        print(String(data:try JSONSerialization.data(withJSONObject:report,options:.sortedKeys),encoding:.utf8)!)
    }
}
