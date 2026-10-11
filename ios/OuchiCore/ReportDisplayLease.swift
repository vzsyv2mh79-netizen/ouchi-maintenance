import Foundation

/// A transient display lease, never a persisted premium entitlement.
/// Revalidate after five minutes even when the paid period is longer.
public struct ReportDisplayLease: Sendable {
    public let report: MaintenanceReport
    public let deadline: Date
    private let checkedAt: Date
    private let clockDeadline: ContinuousClock.Instant
    public init(report: MaintenanceReport, rights: VerifiedEntitlement, environment: BillingEnvironment,
                now: Date = Date(), instant: ContinuousClock.Instant = .now) throws {
        guard rights.premiumIsCurrent(now: now, expectedEnvironment: environment), let expiry = rights.expiresAt else {
            throw CloudError.authenticationRequired
        }
        let duration = min(300, expiry / 1000 - now.timeIntervalSince1970)
        self.report = report; checkedAt = now
        deadline = now.addingTimeInterval(duration)
        clockDeadline = instant.advanced(by: .seconds(duration))
    }
    public func isCurrent(now: Date = Date(), instant: ContinuousClock.Instant = .now) -> Bool {
        now >= checkedAt && now < deadline && instant < clockDeadline
    }
}
