import Foundation
import OuchiCore

@main struct AppAttestRegistrationSmoke {
    static func main() throws {
        let scope = AppAttestRegistrationScope(userID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!, sessionID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!, epochID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, keyID: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=", appID: "SYNTHETIC1.dev.synthetic.ouchi", environment: "production")
        let text = #"{"version":1,"purpose":"register_ouchi_attested_key","nonce":"AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM","issuedAt":1791727200000,"expiresAt":1791727500000,"userID":"11111111-1111-4111-8111-111111111111","sessionID":"22222222-2222-4222-8222-222222222222","epochID":"33333333-3333-4333-8333-333333333333","requestID":"44444444-4444-4444-8444-444444444444","keyID":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=","appID":"SYNTHETIC1.dev.synthetic.ouchi","attestEnvironment":"production"}"#
        let data = Data(text.utf8), now: Int64 = 1_791_727_200_000
        let result = try AppAttestRegistrationChallenge.parse(canonicalClientData: data, expected: scope, nowMilliseconds: now)
        precondition(result.clientData == data)
        // Independently generated with Node SHA256 over the server byte format.
        precondition(result.clientDataHash.map { String(format: "%02x", $0) }.joined() == "b11311774c5c5bc13025ed3c865fe21b8e396f42c49c840726c26a3a45e27fd0")
        _ = try AppAttestRegistrationChallenge.parse(canonicalClientData: data, expected: scope, nowMilliseconds: result.expiresAtMilliseconds - 1)
        func refuses(_ value: String, time: Int64 = now, expected: AppAttestRegistrationScope = scope) {
            do { _ = try AppAttestRegistrationChallenge.parse(canonicalClientData: Data(value.utf8), expected: expected, nowMilliseconds: time); fatalError("accepted invalid registration challenge") } catch {}
        }
        for time in [Int64(0), now - 1, result.expiresAtMilliseconds, Int64.max] { refuses(text, time: time) }
        for (old, new) in [("register_ouchi_attested_key", "restore_ouchi_subscription"), ("\"version\":1", "\"version\":true"), ("\"version\":1", "\"version\":1.0"), ("1791727500000", "1791727500001"), (scope.keyID, "B" + scope.keyID.dropFirst()), (scope.appID, "SYNTHETIC2.dev.synthetic.other"), ("\"production\"", "\"development\""), ("44444444-4444-4444-8444-444444444444", "00000000-0000-0000-0000-000000000000")] {
            refuses(text.replacingOccurrences(of: old, with: new))
        }
        refuses(" " + text)
        refuses(text.replacingOccurrences(of: "{", with: "{\"version\":2,"))
        refuses(text.replacingOccurrences(of: "{", with: "{\"extra\":true,"))
        refuses(text.replacingOccurrences(of: scope.userID.uuidString.lowercased(), with: scope.sessionID.uuidString.lowercased()))
        let wrongScope = AppAttestRegistrationScope(userID: scope.userID, sessionID: UUID(), epochID: scope.epochID, keyID: scope.keyID, appID: scope.appID, environment: scope.environment)
        refuses(text, expected: wrongScope)
        refuses(String(repeating: "x", count: 2049))
        print("PASS: canonical registration bytes/hash match server fixture; account/session/key/environment, expiry, duplicate fields, booleans and restore-purpose substitution refused. No DeviceCheck or registration performed.")
    }
}
