import Foundation
import OuchiCore

@main struct ReminderHTTPIntegration {
    static func main() async throws {
        guard CommandLine.arguments.count == 2, let port = UInt16(CommandLine.arguments[1]) else { fatalError("fixture port required") }
        let api = ReminderSettingsAPI(isolatedDevelopment: true, loopbackPort: port)
        let billing = BillingAPI(isolatedDevelopment: true, loopbackPort: port)
        let rights = try await billing.entitlement(token: "synthetic")
        let account = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        precondition(rights.purchaseAccountToken == account && rights.premiumIsCurrent())
        // Even the DEBUG adapter must never route Production billing to loopback.
        let production = BillingAPI(environment: .production, isolatedDevelopment: true, loopbackPort: port) { request in
            precondition(request.url?.absoluteString == "https://ouchi-maintenance.vercel.app/api/billing/entitlement")
            return (Data(#"{"plan":"free","environment":"Production","salesEnabled":false}"#.utf8),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        _ = try await production.entitlement(token: "synthetic")
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
        let expiredRights = try await billing.entitlement(token: "synthetic")
        precondition(!expiredRights.premiumIsCurrent() && expiredRights.purchaseAccountToken == account)
        let revokedRights = try await billing.entitlement(token: "synthetic")
        precondition(!revokedRights.premiumIsCurrent() && revokedRights.purchaseAccountToken == account)
        do {
            _ = try await api.save(chosen, revision: 1, token: "synthetic")
            fatalError("expired write accepted")
        } catch { precondition(error as? CloudError == .rejected(403)) }
        do {
            _ = try await api.load(token: "synthetic")
            fatalError("redirect followed")
        } catch { precondition(error as? CloudError == .rejected(302)) }
        print("Native HTTP billing/settings: shared purchase account, save, retry, conflict, expiry/revocation and redirect refusal passed. Synthetic transactions only.")
    }
}
