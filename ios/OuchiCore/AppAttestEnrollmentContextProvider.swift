import Foundation
import CoreFoundation

/// Disabled by default. Formatting/configuration checks are not proof of a
/// signed Team/App ID or live Apple environment; those require device evidence.
public struct AppAttestRegistrationConfiguration: Equatable, Sendable {
    public let appID: String, environment: String
    public let referenceRetentionMilliseconds: Int64
    public static func parse(info: [String:Any], bundleIdentifier: String?) throws -> Self? {
        guard let value=info["OUCHI_APP_ATTEST_REGISTRATION_ENABLED"] else { return nil }
        guard let enabled=value as? NSNumber,CFGetTypeID(enabled)==CFBooleanGetTypeID() else { throw CloudError.invalidInput }
        guard enabled.boolValue else { return nil }
        guard let bundleIdentifier,
              bundleIdentifier.range(of:"^[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+$",options:.regularExpression) != nil,
              let appID=info["OUCHI_APP_ATTEST_APP_ID"] as? String,
              appID.range(of:"^[A-Z0-9]{10}\\.[A-Za-z0-9][A-Za-z0-9.-]{1,200}$",options:.regularExpression) != nil,
              String(appID.dropFirst(11))==bundleIdentifier,
              let environment=info["OUCHI_APP_ATTEST_ENVIRONMENT"] as? String,["development","production"].contains(environment),
              let retention=info["OUCHI_APP_ATTEST_REFERENCE_RETENTION_SECONDS"] as? NSNumber,
              CFGetTypeID(retention) != CFBooleanGetTypeID(),retention.doubleValue.isFinite,
              retention.doubleValue.rounded(.towardZero)==retention.doubleValue,
              retention.doubleValue>=300,retention.doubleValue<=7_776_000 else { throw CloudError.invalidInput }
        return Self(appID:appID,environment:environment,referenceRetentionMilliseconds:retention.int64Value*1000)
    }
}

/// Read-only fresh enrollment lookup. Local session storage/JWT payload alone
/// cannot create this context: the authenticated server response must match.
public struct AppAttestEnrollmentContextProvider: Sendable {
    private let session: SessionController
    private let enrollment: AccountEnrollmentAPI
    private let configuration: AppAttestRegistrationConfiguration
    public init(session: SessionController, enrollment: AccountEnrollmentAPI = AccountEnrollmentAPI(), configuration: AppAttestRegistrationConfiguration) {
        self.session=session;self.enrollment=enrollment;self.configuration=configuration
    }
    public func load(expectedAccount: UUID) async throws -> AppAttestRegistrationContext {
        try Task.checkCancellation()
        guard expectedAccount != UUID(uuidString:"00000000-0000-0000-0000-000000000000")! else { throw CloudError.invalidInput }
        let before=try await session.credentials()
        guard before.user.id==expectedAccount else { throw CloudError.authenticationRequired }
        let state=try await enrollment.load(account:expectedAccount,token:before.access_token)
        try Task.checkCancellation()
        let after=try await session.credentials()
        let zero=UUID(uuidString:"00000000-0000-0000-0000-000000000000")!
        guard after.user.id==expectedAccount,after.access_token==before.access_token,
              state.userID==expectedAccount,state.sessionID != zero,
              let epoch=state.epochID,epoch != zero,epoch != expectedAccount else { throw CloudError.authenticationRequired }
        return .init(userID:expectedAccount,sessionID:state.sessionID,epochID:epoch,appID:configuration.appID,environment:configuration.environment,bearer:after.access_token)
    }
}
