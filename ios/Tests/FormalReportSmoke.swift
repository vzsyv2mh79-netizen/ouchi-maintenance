import Foundation
import OuchiCore
@main struct FormalReportSmoke {
    static func main() async throws {
        let home = "11111111-1111-4111-8111-111111111111"
        let product = "22222222-2222-4222-8222-222222222222"
        let report: [String: Any] = ["homeId": home, "homeName": "自宅", "generatedAt": "2026-10-10T00:00:00.000Z", "today": "2026-10-10", "productCount": 1, "taskCount": 2, "overdue": 1, "dueToday": 1,
            "months": (5...10).map { ["month": "2026-\(String(format: "%02d", $0))", "completed": 1] },
            "perProduct": [["productId": product, "name": "空気清浄機", "completedThisMonth": 1, "overdue": 1, "dueToday": 1]], "explanation": "記録の集計"]
        let epoch = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        let bytes = try JSONSerialization.data(withJSONObject: ["environment":"Production", "purchaseAccountToken":epoch.uuidString, "report":report])
        let headers = ["Content-Type":"application/json", "Cache-Control":"no-store"]
        let api = FormalReportAPI(environment: .production, isolatedDevelopment: true, loopbackPort: 1) { request in
            precondition(request.url?.host == "ouchi-maintenance.vercel.app" && request.url?.scheme == "https")
            precondition(request.url?.path == "/api/maintenance-report")
            precondition(request.url?.query == "homeId=" + home)
            precondition(request.value(forHTTPHeaderField:"X-Ouchi-App-Epoch") == epoch.uuidString.lowercased())
            precondition(request.value(forHTTPHeaderField:"Authorization") == "Bearer synthetic")
            return (bytes, HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:headers)!)
        }
        let value = try await api.load(home:home,epoch:epoch,token:"synthetic");precondition(value.overdue == 1)
        for patch in [["environment":"Sandbox"],["purchaseAccountToken":home]] {
            var object:[String:Any] = ["environment":"Production","purchaseAccountToken":epoch.uuidString,"report":report]
            object.merge(patch) { _,new in new }
            let wrong = try JSONSerialization.data(withJSONObject:object)
            let invalid = FormalReportAPI(environment:.production) { request in (wrong, HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:headers)!) }
            do { _ = try await invalid.load(home:home,epoch:epoch,token:"synthetic");fatalError("Wrong report scope accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        for badHeaders in [["Content-Type":"text/html","Cache-Control":"no-store"],["Content-Type":"application/json","Cache-Control":"public"],["Content-Type":"application/json","Cache-Control":"no-store","Content-Length":"2000001"]] {
            let invalid = FormalReportAPI(environment:.production) { request in (bytes, HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:badHeaders)!) }
            do { _ = try await invalid.load(home:home,epoch:epoch,token:"synthetic");fatalError("Unsafe response accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        let redirected = FormalReportAPI(environment:.production) { _ in (bytes, HTTPURLResponse(url:URL(string:"https://foreign.example/")!,statusCode:200,httpVersion:nil,headerFields:headers)!) }
        do { _ = try await redirected.load(home:home,epoch:epoch,token:"synthetic");fatalError("Foreign response accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        let cancellation = Task {
            let cancelled = FormalReportAPI(environment:.production) { request in
                withUnsafeCurrentTask { $0?.cancel() }
                return (bytes, HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:headers)!)
            }
            return try await cancelled.load(home:home,epoch:epoch,token:"synthetic")
        }
        do { _ = try await cancellation.value;fatalError("Cancelled report accepted") }
        catch { precondition(error is CancellationError) }
        let zero = UUID(uuidString:"00000000-0000-0000-0000-000000000000")!
        for invalidHome in ["bad",zero.uuidString] {
            do { _ = try await api.load(home:invalidHome,epoch:epoch,token:"synthetic");fatalError("Invalid home accepted") }
            catch { precondition(error as? CloudError == .invalidInput) }
        }
        do { _ = try await api.load(home:home,epoch:zero,token:"synthetic");fatalError("Zero epoch accepted") }
        catch { precondition(error as? CloudError == .invalidInput) }
        print("PASS: formal report pins HTTPS origin/path, ignores Production loopback, sends exact epoch, matches environment/epoch/home, refuses unsafe/oversized/foreign responses and cancellation. Mock transport, no real paid report.")
    }
}
