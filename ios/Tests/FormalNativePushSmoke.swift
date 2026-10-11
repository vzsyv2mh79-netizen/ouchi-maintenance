import Foundation
import OuchiCore

@main struct FormalNativePushSmoke {
    static let epoch = UUID(uuidString:"11111111-1111-4111-8111-111111111111")!
    static let registration = UUID(uuidString:"22222222-2222-4222-8222-222222222222")!
    static func payload(disable: Bool = false) throws -> Data {
        var value: [String:Any] = ["notificationEnvironment":"Production","purchaseEnvironment":"Sandbox","purchaseAccountToken":epoch.uuidString.lowercased()]
        if disable { value["disabled"] = true } else { value["registrationId"] = registration.uuidString.lowercased() }
        return try JSONSerialization.data(withJSONObject:value)
    }
    static func api(_ data:Data, headers:[String:String] = ["Content-Type":"application/json","Cache-Control":"no-store"], foreign:Bool=false) -> FormalNativePushAPI {
        FormalNativePushAPI(notificationEnvironment:.production,purchaseEnvironment:.sandbox,isolatedDevelopment:true,loopbackPort:1) { request in
            precondition(request.url!.absoluteString == "https://ouchi-maintenance.vercel.app/api/native-push-registration")
            precondition(request.value(forHTTPHeaderField:"X-Ouchi-App-Epoch") == epoch.uuidString.lowercased())
            precondition(request.value(forHTTPHeaderField:"Authorization") == "Bearer synthetic")
            let body = try JSONSerialization.jsonObject(with:request.httpBody!) as! [String:Any]
            if request.httpMethod == "POST" { precondition(Set(body.keys)==Set(["deviceToken"]));precondition(body["deviceToken"] as? String == String(repeating:"ab",count:32)) }
            else { precondition(request.httpMethod == "DELETE");precondition(Set(body.keys)==Set(["registrationId"]));precondition(body["registrationId"] as? String == registration.uuidString.lowercased()) }
            return (data,HTTPURLResponse(url:foreign ? URL(string:"https://foreign.invalid/")! : request.url!,statusCode:200,httpVersion:nil,headerFields:headers)!)
        }
    }
    static func main() async throws {
        let token = Data(repeating:0xab,count:32)
        let receipt = try await api(payload()).register(deviceToken:token,epoch:epoch,token:"synthetic")
        precondition(receipt.registrationID == registration && receipt.epoch == epoch && receipt.notificationEnvironment == .production && receipt.purchaseEnvironment == .sandbox)
        let stopped = try await api(payload(disable:true)).disable(receipt,token:"synthetic");precondition(stopped)
        var negative = try JSONSerialization.jsonObject(with:payload(disable:true)) as! [String:Any];negative["disabled"] = false
        let disabled = try await api(JSONSerialization.data(withJSONObject:negative)).disable(receipt,token:"synthetic");precondition(!disabled)
        for field in ["notificationEnvironment","purchaseEnvironment","purchaseAccountToken","registrationId"] {
            var object = try JSONSerialization.jsonObject(with:payload()) as! [String:Any]
            if field == "notificationEnvironment" { object[field] = "Sandbox" }
            else if field == "purchaseEnvironment" { object[field] = "Production" }
            else { object[field] = "00000000-0000-0000-0000-000000000000" }
            do { _ = try await api(JSONSerialization.data(withJSONObject:object)).register(deviceToken:token,epoch:epoch,token:"synthetic");fatalError("Wrong scope accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        for headers in [["Content-Type":"text/html","Cache-Control":"no-store"],["Content-Type":"application/json","Cache-Control":"public"],["Content-Type":"application/json","Cache-Control":"no-store","Content-Length":"4097"]] {
            do { _ = try await api(payload(),headers:headers).register(deviceToken:token,epoch:epoch,token:"synthetic");fatalError("Unsafe headers accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        do { _ = try await api(payload(),foreign:true).register(deviceToken:token,epoch:epoch,token:"synthetic");fatalError("Foreign URL accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        do { _ = try await api(payload()).register(deviceToken:Data(),epoch:epoch,token:"synthetic");fatalError("Invalid token accepted") }
        catch { precondition(error as? CloudError == .invalidInput) }
        print("PASS: formal native registration pins HTTPS and exact epoch, separates distribution APNs/Sandbox purchases, validates register/disable acknowledgements and bounded no-store response scope. Mock transport only; no Apple or device token.")
    }
}
