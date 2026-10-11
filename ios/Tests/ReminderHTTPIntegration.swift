import Foundation
import OuchiCore

@main struct ReminderHTTPIntegration {
    static func main() async throws {
        guard CommandLine.arguments.count == 2, let port = UInt16(CommandLine.arguments[1]) else { fatalError("fixture port required") }
        let api = ReminderSettingsAPI(isolatedDevelopment: true, loopbackPort: port)
        let first = try await api.load(token: "synthetic")
        precondition(first.premiumActive && first.revision == 0 && first.saved == nil)
        let chosen = try ReminderSchedule(minuteOfDay: 1230, weekdays: [7], leadDays: 1, includeOverdue: false)
        let saved = try await api.save(chosen, revision: 0, token: "synthetic")
        precondition(saved.revision == 1 && saved.saved == chosen && saved.effective == chosen)
        let retry = try await api.save(chosen, revision: 0, token: "synthetic")
        precondition(retry == saved)
        do {
            _ = try await api.save(.free, revision: 0, token: "synthetic")
            fatalError("stale settings accepted")
        } catch { precondition(error as? CloudError == .rejected(409)) }
        let expired = try await api.load(token: "synthetic")
        precondition(!expired.premiumActive && expired.saved == chosen && expired.effective == .free)
        do {
            _ = try await api.save(chosen, revision: 1, token: "synthetic")
            fatalError("expired write accepted")
        } catch { precondition(error as? CloudError == .rejected(403)) }
        do {
            _ = try await api.load(token: "synthetic")
            fatalError("redirect followed")
        } catch { precondition(error as? CloudError == .rejected(302)) }
        print("Native HTTP settings: save, retry, conflict, expiry and redirect refusal passed. Synthetic rights only.")
    }
}
