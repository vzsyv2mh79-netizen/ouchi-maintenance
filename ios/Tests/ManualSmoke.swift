import Foundation
import OuchiCore

@main struct ManualSmoke {
    static func main() async throws {
        let url = "https://jp.sharp/support/air_purifier/doc/kirx75.pdf"
        let payload: [String: Any] = ["maker": "SHARP", "name": "空気清浄機", "pageCount": 20, "manualUrl": url,
            "suggestions": [["name": "フィルター掃除", "kind": "掃除", "intervalDays": 30, "sourceKind": "取扱説明書",
                "sourceUrl": url + "#page=10", "frequency": "月1回", "conditions": "対象と条件を確認"]]]
        let bytes = try JSONSerialization.data(withJSONObject: payload)
        let lookup = ManualLookup { request in
            precondition(request.url?.path == "/api/manual-suggestions" && request.httpMethod == "POST")
            precondition(request.value(forHTTPHeaderField: "Authorization") == nil)
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            precondition(body["model"] as? String == "KI-RX75" && body["manualConsentConfirmed"] as? Bool == true)
            precondition(body["url"] as? String == url)
            return (bytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let result = try await lookup.inspect(model: "ｋｉーｒｘ７５", url: url + "#page=2", consentConfirmed: true)
        precondition(result.suggestions.count == 1 && result.pageCount == 20)
        do { _ = try await lookup.inspect(model: "KI-RX75", url: url, consentConfirmed: false); fatalError("missing consent") }
        catch { precondition(error as? CloudError == .invalidInput) }
        for bad in ["https://jp.sharp/other.pdf", url + "?x=1", "http://jp.sharp/support/air_purifier/doc/kirx75.pdf", "https://jp.sharp.attacker.invalid/support/air_purifier/doc/kirx75.pdf"] {
            precondition(ManualLookup.supportedURL(bad) == nil)
        }
        for page in [0, 21] {
            var invalid = payload
            var suggestions = payload["suggestions"] as! [[String: Any]]
            suggestions[0]["sourceUrl"] = url + "#page=\(page)"; invalid["suggestions"] = suggestions
            let data = try JSONSerialization.data(withJSONObject: invalid)
            let rejected = ManualLookup { request in (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) }
            do { _ = try await rejected.inspect(model: "KI-RX75", url: url, consentConfirmed: true); fatalError("invalid page") }
            catch { precondition(error as? CloudError == .malformedResponse) }
        }
        print("ManualSmoke PASS: explicit consent, normalized model, fixed API, no credentials, supported PDF and evidence page bounds. Mock only.")
    }
}
