import Foundation
import OuchiCore

@main struct ReminderHTTPIntegration {
    @MainActor static func main() async throws {
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
        let reports = ReportAPI(isolatedDevelopment: true, loopbackPort: port)
        let home = "44444444-4444-4444-8444-444444444444"
        let report = try await reports.load(home: home, token: "synthetic")
        precondition(report.homeId == home && report.productCount == 1 && report.taskCount == 2)
        precondition(report.overdue == 1 && report.dueToday == 1 && report.months.last?.completed == 1)
        do {
            _ = try await reports.load(home: "99999999-9999-4999-8999-999999999999", token: "synthetic")
            fatalError("foreign home report accepted")
        } catch { precondition(error as? CloudError == .rejected(403)) }
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
        do { _ = try await reports.load(home: home, token: "synthetic"); fatalError("inactive report accepted") }
        catch { precondition(error as? CloudError == .rejected(403)) }
        do { _ = try await reports.load(home: home, token: "synthetic"); fatalError("report redirect followed") }
        catch { precondition(error as? CloudError == .rejected(302)) }
        do { _ = try await reports.load(home: home, token: "synthetic"); fatalError("oversized streamed report accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        do {
            _ = try await api.save(chosen, revision: 1, token: "synthetic")
            fatalError("expired write accepted")
        } catch { precondition(error as? CloudError == .rejected(403)) }
        do {
            _ = try await api.load(token: "synthetic")
            fatalError("redirect followed")
        } catch { precondition(error as? CloudError == .rejected(302)) }
        let deletionAPI = AccountDeletionAPI(isolatedDevelopment: true, loopbackPort: port)
        let deletionFlow = AccountDeletionFlow(api: deletionAPI)
        deletionFlow.bind(accountID: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!, revision: UUID())
        let absent = try await deletionFlow.recover(token: "synthetic")
        precondition(absent == nil)
        do { _ = try await deletionAPI.request(password: "wrong", token: "synthetic"); fatalError("wrong password accepted") }
        catch { precondition(error as? CloudError == .rejected(403)) }
        do { _ = try await deletionFlow.submit(password: "synthetic-password", token: "synthetic"); fatalError("lost ack claimed accepted") }
        catch { precondition(error as? CloudError == .rejected(503)) }
        precondition(deletionFlow.receipt == nil)
        let recoveredDeletion = try await deletionFlow.recover(token: "synthetic")
        precondition(recoveredDeletion?.state == .pending)
        // Existing durable status prevents a second POST, even when the caller
        // tries submitting again with a password that cannot reauthenticate.
        let duplicate = try await deletionFlow.submit(password: "wrong", token: "synthetic")
        precondition(duplicate?.requestID == recoveredDeletion?.requestID && duplicate?.state == .pending)
        let deletionID = UUID(uuidString: "66666666-6666-4666-8666-666666666666")!
        let progress = try await deletionAPI.progress(requestID: deletionID, token: "synthetic")
        precondition(progress.state == .pending)
        do { _ = try await deletionAPI.progress(requestID: UUID(uuidString: "99999999-9999-4999-8999-999999999999")!, token: "synthetic"); fatalError("foreign request found") }
        catch { precondition(error as? CloudError == .rejected(404)) }
        do { _ = try await deletionAPI.currentProgress(token: "synthetic"); fatalError("deletion redirect followed") }
        catch { precondition(error as? CloudError == .rejected(302)) }
        do { _ = try await deletionAPI.currentProgress(token: "synthetic"); fatalError("oversized deletion status accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        print("Native HTTP deletion: reauthentication refusal, lost ack recovery, no duplicate POST, exact request scope, pending-not-complete and redirect/stream bounds passed. Synthetic identity and queue only; no data erased.")
        print("Native HTTP billing/settings: shared purchase account, save, retry, conflict, expiry/revocation and redirect refusal passed. Synthetic transactions only.")
    }
}
