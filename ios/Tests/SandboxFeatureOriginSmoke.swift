import Foundation
import OuchiCore

@main struct SandboxFeatureOriginSmoke {
    static let epoch = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    static let product = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    static let attachment = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    static let host = "ouchi-maintenance-7gmdv28id-gfgz4m9pkm-8942.vercel.app"
    static func rejects(_ expected: CloudError, _ action: @Sendable () async throws -> Void) async {
        do { try await action(); fatalError("Unexpected feature acknowledgement") }
        catch { precondition(error as? CloudError == expected, "Unexpected feature failure: \(error)") }
    }
    static func main() async {
        // A 503 deliberately proves routing without fabricating a paid right,
        // successful upload, saved setting or a real push registration.
        for mode in 0...2 {
            let environment: BillingEnvironment = mode == 1 ? .production : .sandbox
            let expected: CloudError = mode == 1 ? .invalidInput : mode == 2 ? .malformedResponse : .rejected(503)
            let transport: HouseholdAPI.Transport = { request in
                precondition(mode != 1, "Production credentials reached review transport")
                precondition(request.url?.scheme == "https" && request.url?.host == host)
                precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
                precondition(request.cachePolicy == .reloadIgnoringLocalCacheData)
                let path = request.url!.path
                precondition(["/api/product-attachments", "/api/maintenance-report", "/api/reminder-settings",
                              "/api/notification-channel", "/api/native-push-registration", "/api/native-push-registration/lookup"].contains(path))
                if path != "/api/product-attachments" || request.httpMethod != "GET" {
                    precondition(request.value(forHTTPHeaderField: "X-Ouchi-App-Epoch") == epoch.uuidString.lowercased())
                }
                if path == "/api/product-attachments" && request.httpMethod == "POST" {
                    precondition(request.httpBody == Data([37, 80, 68, 70, 45]))
                    precondition(request.value(forHTTPHeaderField: "Content-Type") == "application/pdf")
                }
                let responseURL = mode == 2 ? URL(string: "https://ouchi-maintenance.vercel.app" + path)! : request.url!
                return (Data(), HTTPURLResponse(url: responseURL, statusCode: 503, httpVersion: nil, headerFields: nil)!)
            }
            let files = AttachmentAPI(server: .sandboxReview, environment: environment, isolatedDevelopment: true, transport: transport)
            await rejects(expected) { _ = try await files.binding(token: "synthetic") }
            await rejects(expected) { _ = try await files.usage(token: "synthetic") }
            await rejects(expected) { _ = try await files.page(product: product, token: "synthetic", scope: .household) }
            await rejects(expected) { _ = try await files.list(product: product, token: "synthetic") }
            await rejects(expected) { _ = try await files.download(attachment: attachment, token: "synthetic") }
            await rejects(expected) { try await files.remove(attachment: attachment, token: "synthetic", confirmed: true, expectedEpoch: epoch) }
            await rejects(expected) { try await files.upload(product: product, attachment: attachment,
                bytes: Data([37, 80, 68, 70, 45]), mime: "application/pdf", token: "synthetic", confirmed: true, expectedEpoch: epoch) }
            let report = FormalReportAPI(environment: environment, server: .sandboxReview, isolatedDevelopment: true, transport: transport)
            await rejects(expected) { _ = try await report.load(home: product.uuidString, epoch: epoch, token: "synthetic") }
            let reminders = FormalReminderSettingsAPI(environment: environment, server: .sandboxReview, isolatedDevelopment: true, transport: transport)
            await rejects(expected) { _ = try await reminders.load(epoch: epoch, token: "synthetic") }
            await rejects(expected) { _ = try await reminders.save(.free, revision: 0, epoch: epoch, token: "synthetic") }
            let channel = FormalNotificationChannelAPI(environment: environment, server: .sandboxReview, isolatedDevelopment: true, transport: transport)
            await rejects(expected) { _ = try await channel.load(epoch: epoch, token: "synthetic") }
            await rejects(expected) { _ = try await channel.save(.both, revision: 0, epoch: epoch, token: "synthetic") }
            // TestFlight uses Production APNs with Sandbox purchases. Keep
            // those scopes independent while restricting the server origin.
            let push = FormalNativePushAPI(notificationEnvironment: .production, purchaseEnvironment: environment,
                server: .sandboxReview, isolatedDevelopment: true, transport: transport)
            await rejects(expected) { _ = try await push.register(deviceToken: Data(repeating: 0xab, count: 32), epoch: epoch, token: "synthetic") }
            await rejects(expected) { _ = try await push.lookup(deviceToken: Data(repeating: 0xab, count: 32), epoch: epoch, token: "synthetic") }
        }
        print("PASS: five feature adapters pin the Sandbox review host, refuse Production before bearer/file/device-token transport, reject foreign-origin replies and retain independent APNs scope. Synthetic rejection responses only; no rights, files, settings or pushes persisted.")
    }
}
