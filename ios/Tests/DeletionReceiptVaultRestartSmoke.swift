import Foundation
import CryptoKit

@main struct VaultRestartSmoke {
 struct Marker: Codable {
  let service: String
  let request: UUID
  let user: UUID
  let inventory: String
  let expiry: Date
  let hash: String
 }
 static func fingerprint(_ token: String) -> String {
  SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined()
 }
 static func main() throws {
  guard CommandLine.arguments.count == 3 else { throw TestFailure.invalid }
  let mode = CommandLine.arguments[1], file = URL(fileURLWithPath: CommandLine.arguments[2])
  if mode == "save" {
   guard !FileManager.default.fileExists(atPath: file.path) else { throw TestFailure.invalid }
   let vault = DeletionReadCredentialVault(service: "dev.ouchi.review.restart." + UUID().uuidString)
   let request = UUID(), user = UUID(), inventory = String(repeating: "b", count: 64)
   let expiry = Date(timeIntervalSince1970: floor(Date().timeIntervalSince1970) + 600)
   let receipt = try vault.prepare(requestID: request, userID: user, inventoryDigest: inventory, expiresAt: expiry)
   do {
    try JSONEncoder().encode(Marker(service: vault.service, request: request, user: user, inventory: inventory, expiry: expiry, hash: fingerprint(receipt.token))).write(to: file, options: .atomic)
   } catch { try vault.remove(requestID: request); throw error }
   print("PASS: saved isolated receipt; marker contains hash only")
  } else if mode == "restore" {
   let marker = try JSONDecoder().decode(Marker.self, from: Data(contentsOf: file))
   guard marker.service.hasPrefix("dev.ouchi.review.restart.") else { throw TestFailure.invalid }
   let vault = DeletionReadCredentialVault(service: marker.service)
   defer { try? vault.remove(requestID: marker.request) }
   let receipt = try vault.prepare(requestID: marker.request, userID: marker.user, inventoryDigest: marker.inventory, expiresAt: marker.expiry)
   guard fingerprint(receipt.token) == marker.hash else { throw TestFailure.changed }
   try vault.remove(requestID: marker.request)
   try FileManager.default.removeItem(at: file)
   print("PASS: fresh process restored exact receipt and removed isolated test data")
  } else { throw TestFailure.invalid }
 }
 enum TestFailure: Error { case invalid, changed }
}
