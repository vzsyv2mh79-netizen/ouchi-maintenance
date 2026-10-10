import Foundation
import OuchiCore

@main struct DeletionSmoke {
    static func main() async throws {
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_only")
        let id = UUID().uuidString.lowercased()
        for record in [HouseholdAPI.DeletableRecord.product, .task] {
            let api = HouseholdAPI(config: config) { request in
                precondition(request.httpMethod == "DELETE" && request.url?.path == "/rest/v1/" + record.rawValue)
                precondition(request.url?.query == "id=eq.\(id)&select=id")
                precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
                precondition(request.value(forHTTPHeaderField: "Prefer") == "return=representation")
                return (Data("[{\"id\":\"\(id)\"}]".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            try await api.deleteRecord(record, id: id, token: "synthetic")
        }
        let zero = HouseholdAPI(config: config) { request in (Data("[]".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
        do { try await zero.deleteRecord(.task, id: id, token: "synthetic"); fatalError("zero deletion accepted") }
        catch { precondition(error as? CloudError == .unavailable) }
        do { try await zero.deleteRecord(.product, id: "bad&or=id", token: "synthetic"); fatalError("invalid filter sent") }
        catch { precondition(error as? CloudError == .invalidInput) }
        let denied = HouseholdAPI(config: config) { request in (Data(), HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!) }
        do { try await denied.deleteRecord(.product, id: id, token: "synthetic"); fatalError("denied deletion accepted") }
        catch { precondition(error as? CloudError == .rejected(403)) }
        print("DeletionSmoke PASS: table allowlist, UUID filter, user authentication, zero-row and denied deletion refusal. Mock only; no records deleted.")
    }
}
