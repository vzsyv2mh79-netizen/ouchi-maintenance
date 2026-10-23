import Foundation
import OuchiCore

@main struct LookupSmoke {
    static func main() async throws {
        let fixtures = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures")
        let bytes = try Data(contentsOf: fixtures.appendingPathComponent("sharp-candidate.json"))
        let lookup = ProductLookup { request in
            precondition(request.url?.host == "ouchi-maintenance.vercel.app" && request.url?.path == "/api/product-lookup")
            precondition(["model=KI-RX75", "model=KI-RX100"].contains(request.url?.query ?? "") && request.httpMethod == "GET")
            precondition(request.value(forHTTPHeaderField: "Authorization") == nil)
            return (bytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let results = try await lookup.search(" ｋｉーｒｘ７５ ")
        precondition(results.count == 1 && results[0].modelNumber == "KI-RX75")
        let product = UUID().uuidString
        let task = try results[0].suggestions[0].task(productID: product, now: ISO8601DateFormatter().date(from: "2026-10-10T23:30:00Z")!)
        precondition(task.productId == product && task.nextDueAt == "2026-11-10" && task.sourceKind == "メーカー公式")
        precondition(task.sourceFrequency == results[0].suggestions[0].frequency && task.sourceNote == results[0].suggestions[0].conditions)
        do { _ = try await lookup.search("KI-RX100"); fatalError("mismatched model accepted") } catch { }
        precondition(ProductLookup.officialURL("https://jp.sharp.attacker.invalid/manual.pdf") == nil)
        precondition(ProductLookup.officialURL("http://jp.sharp/manual.pdf") == nil)
        precondition(ProductLookup.officialURL("https://user:secret@jp.sharp/manual.pdf") == nil)
        let appliance = Appliance(id: product, homeId: UUID().uuidString, categoryId: "air-purifier", maker: "SHARP", name: "空気清浄機", modelNumber: "KI-RX75", purchaseDate: nil, installedDate: nil, memo: nil)
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_only")
        let save = HouseholdAPI(config: config) { request in
            precondition(request.url?.path == "/rest/v1/rpc/add_product_with_tasks")
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            let tasks = body["task_data"] as! [[String: Any]]
            precondition(tasks.count == 1 && tasks[0]["productId"] as? String == product)
            precondition(tasks[0]["sourceNote"] as? String == results[0].suggestions[0].conditions)
            return (Data("null".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        try await save.saveProduct(appliance, creating: true, tasks: [task], token: "synthetic")
        let unrelated = try results[0].suggestions[0].task(productID: UUID().uuidString)
        do { try await save.saveProduct(appliance, creating: true, tasks: [unrelated], token: "synthetic"); fatalError("unrelated suggestion accepted") }
        catch { precondition(error as? CloudError == .invalidInput) }
        let known = CommandLine.arguments.count > 1 ? try JSONDecoder().decode([ProductCandidate].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) : results
        for candidate in known {
            precondition(ProductLookup.officialURL(candidate.productUrl) != nil, candidate.productUrl)
            precondition(ProductLookup.officialURL(candidate.manualUrl) != nil, candidate.manualUrl)
            for suggestion in candidate.suggestions {
                precondition(ProductLookup.officialURL(suggestion.sourceUrl ?? "") != nil, suggestion.sourceUrl ?? "missing")
                _ = try suggestion.task(productID: product)
            }
        }
        let source = CommandLine.arguments.count > 1 ? "provided Web catalog" : "single synthetic fixture"
        print("LookupSmoke PASS: \(source), \(known.count) entries, exact model/normalization, source allowlist, Tokyo dates, preserved conditions. No network.")
    }
}
