import XCTest
@testable import OuchiCore

final class HouseholdAttachmentAPITests: XCTestCase {
    func testHouseholdPageUsesReadNamespaceAndRequiresHouseholdMarker() async throws {
        let product = UUID(), file = UUID()
        let body = Data("{\"items\":[{\"id\":\"\(file.uuidString.lowercased())\",\"size\":8,\"mime\":\"image/png\",\"createdAt\":\"2026-10-17T00:00:00Z\",\"scope\":\"household\"}],\"next\":null}".utf8)
        let api = AttachmentAPI(transport: { request in
            let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(query.first(where: { $0.name == "scope" })?.value, "household")
            XCTAssertEqual(query.first(where: { $0.name == "productId" })?.value, product.uuidString.lowercased())
            XCTAssertNil(request.value(forHTTPHeaderField: "X-Ouchi-App-Epoch"))
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let page = try await api.page(product: product, token: "synthetic", scope: .household)
        XCTAssertEqual(page.items.first?.id, file)
        XCTAssertEqual(page.items.first?.scope, .household)
        XCTAssertNil(page.next)
        for marker in ["", ",\"scope\":\"personal\""] {
            let wrong = Data("{\"items\":[{\"id\":\"\(file.uuidString)\",\"size\":8,\"mime\":\"image/png\",\"createdAt\":\"2026-10-17T00:00:00Z\"\(marker)}],\"next\":null}".utf8)
            let rejected = AttachmentAPI(transport: { request in (wrong, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) })
            do { _ = try await rejected.page(product: product, token: "synthetic", scope: .household); XCTFail("Unconfirmed namespace accepted") }
            catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
        }
    }
    func testPersonalPageCannotMislabelHouseholdFileAndDownloadKeepsNamespace() async throws {
        let id = UUID(), bytes = Data([137,80,78,71,13,10,26,10])
        let body = Data("{\"items\":[{\"id\":\"\(id.uuidString)\",\"size\":8,\"mime\":\"image/png\",\"createdAt\":\"2026-10-17T00:00:00Z\",\"scope\":\"household\"}],\"next\":null}".utf8)
        let personal = AttachmentAPI(transport: { request in
            XCTAssertFalse(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!.contains(where: { $0.name == "scope" }))
            return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        do { _ = try await personal.page(product: id, token: "synthetic"); XCTFail("Household file accepted as personal") }
        catch { XCTAssertEqual(error as? CloudError, .malformedResponse) }
        let household = AttachmentAPI(transport: { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!.first(where: { $0.name == "scope" })?.value, "household")
            return (bytes, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type":"image/png", "Content-Disposition":"attachment; filename=\"ouchi-attachment-\(id.uuidString.lowercased()).png\""])!)
        })
        let file = try await household.download(attachment: id, token: "synthetic", scope: .household)
        XCTAssertEqual(file.bytes, bytes)
    }
}
