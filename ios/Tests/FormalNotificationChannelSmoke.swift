import Foundation
import OuchiCore
@main struct FormalNotificationChannelSmoke {
    static let epoch = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    static func payload(channel: String = "both", revision: Int = 0) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["environment":"Production","purchaseAccountToken":epoch.uuidString,"channel":channel,"revision":revision,"nativeRegistered":true])
    }
    static func api(_ data: Data, headers: [String:String] = ["Content-Type":"application/json","Cache-Control":"no-store"], status: Int = 200, foreign: Bool = false) -> FormalNotificationChannelAPI {
        FormalNotificationChannelAPI(environment:.production, isolatedDevelopment:true, loopbackPort:1) { request in
            precondition(request.url?.absoluteString == "https://ouchi-maintenance.vercel.app/api/notification-channel")
            precondition(request.value(forHTTPHeaderField:"X-Ouchi-App-Epoch") == epoch.uuidString.lowercased())
            precondition(request.value(forHTTPHeaderField:"Authorization") == "Bearer synthetic")
            precondition(request.cachePolicy == .reloadIgnoringLocalCacheData)
            if request.httpMethod == "PUT" {
                let input = try JSONSerialization.jsonObject(with:request.httpBody!) as! [String:Any]
                precondition(Set(input.keys) == Set(["revision","channel"]))
            }
            return (data, HTTPURLResponse(url:foreign ? URL(string:"https://foreign.example/")! : request.url!,statusCode:status,httpVersion:nil,headerFields:headers)!)
        }
    }
    static func main() async throws {
        let first = try await api(payload()).load(epoch:epoch,token:"synthetic")
        precondition(first.channel == .both && first.revision == 0)
        for channel in NotificationChannel.allCases {
            let saved = try await api(payload(channel:channel.rawValue,revision:1)).save(channel,revision:0,epoch:epoch,token:"synthetic")
            precondition(saved.channel == channel && saved.revision == 1)
        }
        for field in ["environment","purchaseAccountToken","channel","revision","nativeRegistered","extra"] {
            var value = try JSONSerialization.jsonObject(with:payload()) as! [String:Any]
            switch field {
            case "environment": value[field] = "Sandbox"
            case "purchaseAccountToken": value[field] = "22222222-2222-4222-8222-222222222222"
            case "channel": value[field] = "web" // revision zero must preserve default
            case "revision": value[field] = -1
            case "nativeRegistered": value[field] = "true"
            default: value[field] = true
            }
            do { _ = try await api(JSONSerialization.data(withJSONObject:value)).load(epoch:epoch,token:"synthetic");fatalError("Invalid receipt accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        for headers in [["Content-Type":"text/html","Cache-Control":"no-store"],["Content-Type":"application/json","Cache-Control":"public"],["Content-Type":"application/json","Cache-Control":"no-store","Content-Length":"1"]] {
            do { _ = try await api(payload(),headers:headers).load(epoch:epoch,token:"synthetic");fatalError("Invalid headers accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        do { _ = try await api(payload(channel:"web",revision:2)).save(.web,revision:0,epoch:epoch,token:"synthetic");fatalError("Wrong revision accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        do { _ = try await api(payload(channel:"both",revision:1)).save(.web,revision:0,epoch:epoch,token:"synthetic");fatalError("Wrong channel accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        do { _ = try await api(payload(),foreign:true).load(epoch:epoch,token:"synthetic");fatalError("Foreign accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        for status in [409,412,503] {
            do { _ = try await api(payload(),status:status).load(epoch:epoch,token:"synthetic");fatalError("Failure accepted") }
            catch { precondition(error as? CloudError == .rejected(status)) }
        }
        let task = Task { () throws -> NotificationChannelReceipt in
            try Task.checkCancellation()
            return try await api(payload()).load(epoch:epoch,token:"synthetic")
        };task.cancel();do { _ = try await task.value;fatalError("Cancellation accepted") } catch { precondition(error is CancellationError) }
        print("PASS: channel API fixed HTTPS/path, exact environment/epoch/revision/channel, free choices, declared size/MIME/cache, foreign URL and failed/cancelled responses refused. Synthetic transport only; no Apple or notification.")
    }
}
