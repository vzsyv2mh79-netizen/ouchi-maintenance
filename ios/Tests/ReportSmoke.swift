import Foundation
import OuchiCore

@main struct ReportSmoke {
    static func main() async throws {
        let home = "11111111-1111-4111-8111-111111111111"
        let product = "22222222-2222-4222-8222-222222222222"
        let report: [String: Any] = ["homeId": home, "homeName": "自宅", "generatedAt": "2026-10-10T00:00:00.000Z", "today": "2026-10-10", "productCount": 1, "taskCount": 2, "overdue": 1, "dueToday": 1,
            "months": (5...10).map { ["month": "2026-\(String(format: "%02d", $0))", "completed": 1] },
            "perProduct": [["productId": product, "name": "空気清浄機", "completedThisMonth": 1, "overdue": 1, "dueToday": 1]], "explanation": "記録の集計"]
        let envelope: [String: Any] = ["environment": "Sandbox", "salesEnabled": false, "report": report]
        let bytes = try JSONSerialization.data(withJSONObject: envelope)
        let api = ReportAPI { request in
            precondition(request.url?.host == "ouchi-maintenance.vercel.app")
            precondition(request.url?.path == "/api/development/maintenance-report")
            precondition(request.url?.query == "homeId=" + home)
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
            precondition(request.httpMethod == "GET" && request.httpBody == nil)
            return (bytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let value = try await api.load(home: home.uppercased(), token: "synthetic")
        precondition(value.overdue == 1 && value.months.count == 6)
        for patch in [["homeId": product], ["today": "2026-02-30"], ["overdue": 5], ["generatedAt": "bad"], ["productCount": 9], ["months": (4...9).map { ["month": "2026-\(String(format: "%02d", $0))", "completed": 1] }], ["perProduct": [["productId": product, "name": "空気清浄機", "completedThisMonth": 2, "overdue": 1, "dueToday": 1]]]] as [[String: Any]] {
            var bad = report; bad.merge(patch) { _, new in new }
            let payload = try JSONSerialization.data(withJSONObject: ["environment": "Sandbox", "salesEnabled": false, "report": bad])
            let invalid = ReportAPI { request in (payload, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
            do { _ = try await invalid.load(home: home, token: "synthetic"); fatalError("malformed report accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        let preview = ReportAPI(sandboxPreview: true) { request in
            precondition(request.url?.host == "ouchi-maintenance-n2u08a2mo-gfgz4m9pkm-8942.vercel.app")
            return (bytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        _ = try await preview.load(home: home, token: "synthetic")
        let redirected = ReportAPI { _ in (bytes, HTTPURLResponse(url: URL(string: "https://untrusted.example/")!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
        do { _ = try await redirected.load(home: home, token: "synthetic"); fatalError("foreign response accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        let denied = ReportAPI { request in (Data(), HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!) }
        do { _ = try await denied.load(home: home, token: "synthetic"); fatalError("denied report accepted") }
        catch { precondition(error as? CloudError == .rejected(403)) }
        print("ReportSmoke PASS: JWT scope, fixed host, fractional timestamp, home identity, dates/totals and failure refusal. No network.")
    }
}
