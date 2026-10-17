import Foundation
import OuchiCore

@main struct FormalReminderSettingsSmoke {
    static let epoch = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    static let other = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    static func payload(revision: Int = 0, premium: Bool = false) throws -> Data {
        let schedule = try ReminderSchedule(minuteOfDay: 1230, weekdays: [7], leadDays: 1, includeOverdue: false)
        struct Receipt: Encodable {
            let environment = "Production", salesEnabled = false
            let purchaseAccountToken = FormalReminderSettingsSmoke.epoch
            let revision: Int, saved: ReminderSchedule?, effective: ReminderSchedule, premiumActive: Bool
        }
        return try JSONEncoder().encode(Receipt(revision:revision,saved:revision == 0 ? nil : schedule,effective:premium ? schedule : .free,premiumActive:premium))
    }
    static func api(_ data: Data, headers: [String:String] = ["Content-Type":"application/json","Cache-Control":"no-store"]) -> FormalReminderSettingsAPI {
        FormalReminderSettingsAPI(environment:.production,isolatedDevelopment:true,loopbackPort:1) { request in
            precondition(request.url?.absoluteString == "https://ouchi-maintenance.vercel.app/api/reminder-settings")
            precondition(request.value(forHTTPHeaderField:"X-Ouchi-App-Epoch") == epoch.uuidString.lowercased())
            return (data,HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:headers)!)
        }
    }
    static func main() async throws {
        // Encode explicit saved:null for revision zero, which JSONEncoder omits for optional nil.
        var first = try JSONSerialization.jsonObject(with:payload()) as! [String:Any];first["saved"] = NSNull()
        let initial = try await api(JSONSerialization.data(withJSONObject:first)).load(epoch:epoch,token:"synthetic")
        precondition(initial.environment == "Production" && initial.saved == nil && initial.effective == .free)
        let schedule = try ReminderSchedule(minuteOfDay:1230,weekdays:[7],leadDays:1,includeOverdue:false)
        let saved = try await api(payload(revision:1,premium:true)).save(schedule,revision:0,epoch:epoch,token:"synthetic")
        precondition(saved.saved == schedule && saved.revision == 1)
        let expired = try await api(payload(revision:1)).load(epoch:epoch,token:"synthetic")
        precondition(expired.saved == schedule && expired.effective == .free && !expired.premiumActive)
        for change in ["environment","purchaseAccountToken","saved"] {
            var value = first
            if change == "environment" { value[change] = "Sandbox" }
            else if change == "purchaseAccountToken" { value[change] = other.uuidString }
            else { value.removeValue(forKey:change) }
            do { _ = try await api(JSONSerialization.data(withJSONObject:value)).load(epoch:epoch,token:"synthetic");fatalError("Unsafe scope accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        for headers in [["Content-Type":"text/html","Cache-Control":"no-store"],["Content-Type":"application/json","Cache-Control":"public"],["Content-Type":"application/json","Cache-Control":"no-store","Content-Length":"4097"]] {
            do { _ = try await api(JSONSerialization.data(withJSONObject:first),headers:headers).load(epoch:epoch,token:"synthetic");fatalError("Unsafe response accepted") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        do { _ = try await api(payload(revision:2,premium:true)).save(schedule,revision:0,epoch:epoch,token:"synthetic");fatalError("Wrong revision accepted") }
        catch { precondition(error as? CloudError == .malformedResponse) }
        do { _ = try await api(payload()).load(epoch:UUID(uuidString:"00000000-0000-0000-0000-000000000000")!,token:"synthetic");fatalError("Zero epoch accepted") }
        catch { precondition(error as? CloudError == .invalidInput) }
        print("PASS: formal reminder transport pins HTTPS/path, Production ignores loopback, exact epoch/environment, explicit saved:null, revision acknowledgement, expiry fallback and bounded MIME/no-store responses. Mock only, no notification or Apple purchase.")
    }
}
