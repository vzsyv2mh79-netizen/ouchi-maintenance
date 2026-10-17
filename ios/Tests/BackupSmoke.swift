import Foundation
import OuchiCore

@main struct BackupSmoke {
    static func main() async throws {
        let fixtures = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures")
        let file = fixtures.appendingPathComponent("web-backup.json")
        let data = try Backup.decode(Data(contentsOf: file))
        let canonical = try Backup.canonical(data)
        let expected = try Data(contentsOf: fixtures.appendingPathComponent("web-canonical.json"))
        precondition(canonical == expected, "Web and native normalization differ")
        let roundtrip = try Backup.decode(Backup.encode(data))
        precondition(roundtrip.products.count == 1 && roundtrip.history.count == 1)
        let restored = try Backup.prepareRestore(data)
        let expectedHash = try String(contentsOf: fixtures.appendingPathComponent("web-hash.txt"), encoding: .utf8)
        precondition(restored.hash == expectedHash)
        let payload = try JSONDecoder().decode(Household.self, from: restored.payload)
        precondition(payload.homes[0].id != data.homes[0].id && UUID(uuidString: payload.homes[0].id) != nil)
        precondition(payload.products[0].homeId == payload.homes[0].id && payload.tasks[0].productId == payload.products[0].id && payload.history[0].taskId == payload.tasks[0].id)
        do { _ = try Backup.decode(Data(repeating: 32, count: Backup.maximumBytes + 1)); fatalError("large file accepted") } catch { }
        let config = try CloudConfiguration(url: URL(string: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!, publishableKey: "sb_publishable_synthetic_only")
        let api = HouseholdAPI(config: config) { request in
            precondition(request.url?.path == "/rest/v1/rpc/restore_maintenance_backup")
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            precondition(body["backup_hash"] as? String == restored.hash)
            return (Data("false".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        do { try await api.restoreBackup(restored, token: "synthetic"); fatalError("duplicate restore accepted") }
        catch { precondition(error as? CloudError == .unavailable) }
        try Backup.encode(data).write(to: URL(fileURLWithPath: "/private/tmp/ouchi-native-backup-output.json"))
        print("BackupSmoke PASS: actual Web envelope/canonical/hash, native roundtrip, legacy-ID remapping, related rows, size limit and duplicate restore rejection. No network.")
    }
}
