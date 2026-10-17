import Foundation

public struct MaintenanceSuggestion: Codable, Sendable {
    public let name: String
    public let kind: String
    public let intervalDays: Int
    public let sourceKind: String
    public let sourceUrl: String?
    public let frequency: String
    public let conditions: String
    public func task(productID: String, now: Date = Date()) throws -> CareTask {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let format = DateFormatter(); format.locale = Locale(identifier: "en_US_POSIX")
        format.calendar = calendar; format.timeZone = calendar.timeZone; format.dateFormat = "yyyy-MM-dd"
        guard let next = calendar.date(byAdding: .day, value: intervalDays, to: now) else { throw CloudError.invalidInput }
        let value = CareTask(id: UUID().uuidString.lowercased(), productId: productID, name: name, kind: kind,
            intervalDays: intervalDays, lastCompletedAt: nil, nextDueAt: format.string(from: next), sourceKind: sourceKind,
            sourceUrl: sourceUrl, sourceNote: conditions, sourceFrequency: frequency)
        try value.validate()
        return value
    }
}
public struct ProductCandidate: Codable, Sendable {
    public let maker: String
    public let name: String
    public let modelNumber: String
    public let categoryId: String
    public let productUrl: String
    public let manualUrl: String
    public let verifiedAt: String
    public let lookupNote: String?
    public let productLinkLabel: String?
    public let manualLinkLabel: String?
    public let suggestions: [MaintenanceSuggestion]
}
public struct ProductLookup: Sendable {
    private let transport: HouseholdAPI.Transport
    public init(transport: @escaping HouseholdAPI.Transport = { request in
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
        return (data, response)
    }) { self.transport = transport }
    public static func normalize(_ model: String) -> String {
        let value = model.precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return String(value.map { "‐‑‒–—−ー".contains($0) ? Character("-") : $0 }.filter { !$0.isWhitespace })
    }
    public static func officialURL(_ value: String) -> URL? {
        let hosts: Set<String> = ["jp.sharp", "corporate.jp.sharp", "cs.sharp.co.jp", "panasonic.jp", "jpn.faq.panasonic.com", "news.panasonic.com", "www.free.dtnet.daikin.co.jp", "www.ac.daikin.co.jp", "www.daikin.co.jp", "www.daikincc.com", "www.zojirushi.co.jp", "www.toshiba-lifestyle.com", "faq-toshiba-lifestyle.dga.jp", "shop.toshiba-lifestyle.com", "dl.mitsubishielectric.co.jp", "www.mitsubishielectric.co.jp", "kadenfan.hitachi.co.jp", "www.hitachi.co.jp", "www.irisohyama.co.jp", "www.siroca.co.jp", "aqua-has.com", "www.irobot-jp.com", "store.irobot-jp.com", "prod-help-content.care.irobotapi.com"]
        guard let url = URL(string: value), url.scheme == "https", let host = url.host?.lowercased(), hosts.contains(host),
              url.user == nil, url.password == nil, url.port == nil || url.port == 443 else { return nil }
        return url
    }
    public func search(_ input: String) async throws -> [ProductCandidate] {
        let model = Self.normalize(input)
        guard model.range(of: #"^[A-Z0-9][A-Z0-9-]{1,79}$"#, options: .regularExpression) != nil else { throw CloudError.invalidInput }
        var url = URLComponents(string: "https://ouchi-maintenance.vercel.app/api/product-lookup")!
        url.queryItems = [URLQueryItem(name: "model", value: model)]
        var request = URLRequest(url: url.url!); request.httpMethod = "GET"; request.timeoutInterval = 20
        let (data, response) = try await transport(request)
        guard response.url?.host == "ouchi-maintenance.vercel.app", response.statusCode == 200, data.count <= 2_000_000 else { throw CloudError.malformedResponse }
        struct Result: Decodable { let candidates: [ProductCandidate] }
        let result = try JSONDecoder().decode(Result.self, from: data)
        guard result.candidates.count <= 20 else { throw CloudError.malformedResponse }
        for candidate in result.candidates {
            guard Self.normalize(candidate.modelNumber) == model, RecordRules.categories.contains(candidate.categoryId),
                  !candidate.name.isEmpty, candidate.name.count <= 200, !candidate.maker.isEmpty,
                  Self.officialURL(candidate.productUrl) != nil, Self.officialURL(candidate.manualUrl) != nil,
                  RecordRules.date(candidate.verifiedAt), candidate.suggestions.count <= 100 else { throw CloudError.malformedResponse }
            for suggestion in candidate.suggestions {
                guard ["メーカー公式", "取扱説明書", "公的情報"].contains(suggestion.sourceKind),
                      let source = suggestion.sourceUrl, Self.officialURL(source) != nil else { throw CloudError.malformedResponse }
                _ = try suggestion.task(productID: UUID().uuidString)
            }
        }
        return result.candidates
    }
}
