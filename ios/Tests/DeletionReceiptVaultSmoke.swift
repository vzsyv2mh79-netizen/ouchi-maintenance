import Foundation

@main struct VaultSmoke {
 static func main() throws {
  let service = "dev.ouchi.review.deletion-read." + UUID().uuidString.lowercased()
  let vault = DeletionReadCredentialVault(service: service)
  let request = UUID(), user = UUID(), deadline = Date(timeIntervalSince1970: floor(Date().timeIntervalSince1970) + 600)
  defer { try? vault.remove(requestID: request) }
  let first = try vault.prepare(requestID: request, userID: user, inventoryDigest: String(repeating: "a", count: 64), expiresAt: deadline)
  precondition(first.token.count == 43)
  let storedFirst = try vault.read(requestID: request); precondition(storedFirst == first)
  let retry = try vault.prepare(requestID: request, userID: user, inventoryDigest: String(repeating: "a", count: 64), expiresAt: deadline)
  precondition(retry == first)
  func refuses(_ work: () throws -> Void) {
   do { try work(); preconditionFailure("Expected scoped refusal") }
   catch DeletionReadCredentialVault.Failure.scopeMismatch {}
   catch DeletionReadCredentialVault.Failure.expired {}
   catch DeletionReadCredentialVault.Failure.invalidInput {}
   catch { preconditionFailure("Unexpected vault failure") }
  }
  refuses { _ = try vault.prepare(requestID: request, userID: UUID(), inventoryDigest: String(repeating: "a", count: 64), expiresAt: deadline) }
  refuses { _ = try vault.prepare(requestID: request, userID: user, inventoryDigest: String(repeating: "b", count: 64), expiresAt: deadline) }
  refuses { _ = try vault.prepare(requestID: request, userID: user, inventoryDigest: String(repeating: "a", count: 64), expiresAt: deadline.addingTimeInterval(1)) }
  refuses { _ = try vault.prepare(requestID: UUID(), userID: user, inventoryDigest: String(repeating: "a", count: 64), expiresAt: Date(timeIntervalSince1970: 0)) }
  let storedAfterRefusals = try vault.read(requestID: request); precondition(storedAfterRefusals == first)
  try vault.remove(requestID: request)
  let absent = try vault.read(requestID: request); precondition(absent == nil)
  try vault.remove(requestID: request)
  print("PASS: isolated Keychain receipt roundtrip, exact retry, scope/deadline refusal and scoped cleanup")
 }
}
