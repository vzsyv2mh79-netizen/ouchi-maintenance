import Foundation
import OuchiCore

@main struct MutationSmoke {
    static func main() async throws {
        let id = UUID().uuidString.lowercased(), home = UUID().uuidString.lowercased()
        let product = Appliance(id: id, homeId: home, categoryId: "washer", maker: "メーカー", name: "洗濯機", modelNumber: "TEST", purchaseDate: nil, installedDate: nil, memo: nil)
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_only")
        let update = HouseholdAPI(config: config) { request in
            precondition(request.httpMethod == "PATCH")
            precondition(request.url?.path == "/rest/v1/products")
            precondition(request.url?.query == "id=eq.\(id)&select=id")
            precondition(request.value(forHTTPHeaderField: "Prefer") == "return=representation")
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer synthetic")
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            precondition(body["memo"] is NSNull && body["purchaseDate"] is NSNull)
            precondition(body["homeId"] as? String == home)
            return (Data("[{\"id\":\"\(id)\"}]".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        try await update.saveProduct(product, creating: false, token: "synthetic")
        let zero = HouseholdAPI(config: config) { request in (Data("[]".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
        do { try await zero.saveProduct(product, creating: false, token: "synthetic"); fatalError("zero rows accepted") }
        catch { precondition(error as? CloudError == .unavailable) }
        let create = HouseholdAPI(config: config) { request in
            precondition(request.httpMethod == "POST" && request.url?.path == "/rest/v1/rpc/add_product_with_tasks")
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            precondition((body["task_data"] as? [Any])?.isEmpty == true)
            return (Data("null".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        try await create.saveProduct(product, creating: true, token: "synthetic")
        let task = CareTask(id: UUID().uuidString, productId: id, name: "フィルター掃除", kind: "掃除", intervalDays: 7, lastCompletedAt: nil, nextDueAt: "2026-10-17", sourceKind: "ユーザー設定", sourceUrl: nil, sourceNote: nil, sourceFrequency: nil)
        let insert = HouseholdAPI(config: config) { request in
            precondition(request.httpMethod == "POST" && request.url?.path == "/rest/v1/maintenance_tasks")
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            precondition(body["lastCompletedAt"] is NSNull && body["sourceFrequency"] is NSNull)
            return (Data("[{\"id\":\"\(task.id)\"}]".utf8), HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!)
        }
        try await insert.saveTask(task, creating: true, token: "synthetic")
        precondition(!RecordRules.date("2026-02-30") && RecordRules.date("2024-02-29") && !RecordRules.date("2026-2-1"))
        print("MutationSmoke PASS: create/update, user token, zero-row refusal, nullable clearing, custom task, date validation")
    }
}
