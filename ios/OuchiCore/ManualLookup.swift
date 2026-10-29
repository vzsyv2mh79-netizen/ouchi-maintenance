import Foundation

public struct ManualInspection: Decodable, Sendable {
    public let maker: String
    public let name: String
    public let pageCount: Int
    public let manualUrl: String
    public let suggestions: [MaintenanceSuggestion]
}

/// Explicit consent and review remain necessary; extracted text is not AI evidence.
public struct ManualLookup: Sendable {
    private let transport: HouseholdAPI.Transport
    public init(transport: @escaping HouseholdAPI.Transport = { request in
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw CloudError.malformedResponse }
        return (data, response)
    }) { self.transport = transport }

    public static func supportedURL(_ input: String) -> URL? {
        guard let url = ProductLookup.officialURL(input), url.port == nil,
              url.query == nil, let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let path = url.path.removingPercentEncoding ?? url.path
        let sharp = url.host == "jp.sharp" && path.range(of: #"^/(?:restricted/support/manual/air_purifier|support/air_purifier/doc)/[a-zA-Z0-9_-]+\.pdf$"#, options: .regularExpression) != nil
        let panasonic = url.host == "panasonic.jp" && path.range(of: #"^/content/dam/panasonic/jp/ja/pim-assets/support/manual/(?:[0-9]+/)+[\p{L}\p{N}_ .()-]{1,180}\.pdf$"#, options: .regularExpression) != nil
        guard sharp || panasonic else { return nil }
        var cleaned = components; cleaned.fragment = nil
        return cleaned.url
    }

    public func inspect(model input: String, url inputURL: String, consentConfirmed: Bool) async throws -> ManualInspection {
        let model = ProductLookup.normalize(input)
        guard consentConfirmed, model.range(of: #"^[A-Z0-9][A-Z0-9-]{1,79}$"#, options: .regularExpression) != nil,
              let manual = Self.supportedURL(inputURL) else { throw CloudError.invalidInput }
        let endpoint = URL(string: "https://ouchi-maintenance.vercel.app/api/manual-suggestions")!
        var request = URLRequest(url: endpoint); request.httpMethod = "POST"; request.timeoutInterval = 70
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["model": model, "url": manual.absoluteString, "manualConsentConfirmed": true])
        let (data, response) = try await transport(request)
        guard response.url == endpoint, response.statusCode == 200, data.count <= 2_000_000 else { throw CloudError.malformedResponse }
        let result = try JSONDecoder().decode(ManualInspection.self, from: data)
        guard result.manualUrl == manual.absoluteString, (1...100).contains(result.pageCount),
              result.maker == (manual.host == "jp.sharp" ? "SHARP" : "Panasonic"),
              !result.name.isEmpty, result.name.count <= 200, result.suggestions.count <= 100 else { throw CloudError.malformedResponse }
        for suggestion in result.suggestions {
            guard suggestion.sourceKind == "取扱説明書", let source = suggestion.sourceUrl,
                  let sourceURL = URL(string: source), Self.supportedURL(source) == manual,
                  let fragment = sourceURL.fragment, fragment.hasPrefix("page="),
                  let page = Int(fragment.dropFirst(5)), (1...result.pageCount).contains(page),
                  !suggestion.frequency.isEmpty, !suggestion.conditions.isEmpty else { throw CloudError.malformedResponse }
            _ = try suggestion.task(productID: UUID().uuidString)
        }
        return result
    }
}
