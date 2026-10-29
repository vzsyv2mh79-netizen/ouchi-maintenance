import Foundation
import OuchiCore

@main struct ReminderSettingsSmoke {
    static let free = #"{"minuteOfDay":540,"weekdays":[1,2,3,4,5,6,7],"leadDays":0,"includeOverdue":true}"#
    static let custom = #"{"minuteOfDay":1230,"weekdays":[7],"leadDays":1,"includeOverdue":false}"#
    static func payload(revision: Int = 0, saved: String = "null", effective: String = free, premium: Bool = false) -> String {
        "{\"environment\":\"Sandbox\",\"salesEnabled\":false,\"revision\":\(revision),\"saved\":\(saved),\"effective\":\(effective),\"premiumActive\":\(premium)}"
    }
    static func api(_ payload: String, status: Int = 200, destination: String? = nil) -> ReminderSettingsAPI {
        ReminderSettingsAPI { request in
            (Data(payload.utf8), HTTPURLResponse(url: destination.flatMap(URL.init(string:)) ?? request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }
    static func main() async throws {
        let first = try await api(payload()).load(token: "synthetic")
        precondition(first.revision == 0 && first.saved == nil && first.effective == .free && !first.premiumActive)
        // This suite links the Release core. A caller cannot select loopback
        // transport in a released binary, even by passing development arguments.
        let released = ReminderSettingsAPI(isolatedDevelopment: true, loopbackPort: 1) { request in
            precondition(request.url?.absoluteString == "https://ouchi-maintenance.vercel.app/api/development/reminder-settings")
            return (Data(payload().utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        _ = try await released.load(token: "synthetic")
        let schedule = try ReminderSchedule(minuteOfDay: 1230, weekdays: [7], leadDays: 1, includeOverdue: false)
        let saving = ReminderSettingsAPI { request in
            precondition(request.httpMethod == "PUT" && request.url?.path == "/api/development/reminder-settings")
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
            struct Input: Decodable { let revision: Int; let schedule: ReminderSchedule }
            let body = try JSONDecoder().decode(Input.self, from: request.httpBody!)
            precondition(body.revision == 0 && body.schedule == schedule)
            return (Data(payload(revision: 1, saved: custom, effective: custom, premium: true).utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let saved = try await saving.save(schedule, revision: 0, token: "synthetic")
        precondition(saved.revision == 1 && saved.saved == schedule && saved.effective == schedule)
        let expired = try await api(payload(revision: 1, saved: custom)).load(token: "synthetic")
        precondition(!expired.premiumActive && expired.saved == schedule && expired.effective == .free)
        for invalid in [
            payload().replacingOccurrences(of: "Sandbox", with: "Production"),
            payload().replacingOccurrences(of: "\"salesEnabled\":false", with: "\"salesEnabled\":true"),
            payload().replacingOccurrences(of: "\"saved\":null,", with: ""),
            payload(revision: 1), payload(saved: custom), payload(revision: -1),
            payload(revision: 9_007_199_254_740_992, saved: custom),
            payload(revision: 1, saved: custom, effective: custom),
            payload().replacingOccurrences(of: "[1,2,3,4,5,6,7]", with: "[1,1]"),
            payload().replacingOccurrences(of: "540", with: "1440")
        ] {
            do { _ = try await api(invalid).load(token: "synthetic"); fatalError("invalid settings accepted") }
            catch { /* Both decoding and semantic validation must fail closed. */ }
        }
        for wrongAck in [payload(revision: 2, saved: custom, effective: custom, premium: true), payload(revision: 1, saved: free, premium: true)] {
            do { _ = try await api(wrongAck).save(schedule, revision: 0, token: "synthetic"); fatalError("unconfirmed save accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        for status in [401,403,409,503] {
            do { _ = try await api("{}", status: status).load(token: "synthetic"); fatalError("failed request accepted") }
            catch { precondition(error as? CloudError == (status == 401 ? .authenticationRequired : .rejected(status))) }
        }
        for destination in ["https://foreign.example.invalid/api/development/reminder-settings", "https://ouchi-maintenance.vercel.app/api/development/reminder-settings?x=1", "http://ouchi-maintenance.vercel.app/api/development/reminder-settings"] {
            do { _ = try await api(payload(), destination: destination).load(token: "synthetic"); fatalError("foreign acknowledgement accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        do { _ = try await api(String(repeating: " ", count: 4097)).load(token: "synthetic"); fatalError("oversized response accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        let unused = ReminderSettingsAPI { _ in fatalError("invalid input reached transport") }
        for token in ["", "has space", String(repeating: "a", count: 16385)] {
            do { _ = try await unused.load(token: token); fatalError("invalid bearer accepted") }
            catch { precondition(error as? CloudError == .authenticationRequired) }
        }
        for revision in [-1, 9_007_199_254_740_991] {
            do { _ = try await unused.save(schedule, revision: revision, token: "synthetic"); fatalError("invalid revision accepted") }
            catch { precondition(error as? CloudError == .invalidInput) }
        }
        print("Reminder settings transport, expiry fallback and authoritative save acknowledgement verified")
    }
}
