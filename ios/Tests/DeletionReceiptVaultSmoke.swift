import Foundation
import Security

@main struct VaultSmoke {
 static func main() throws {
  let service = "dev.ouchi.review.deletion-read." + UUID().uuidString.lowercased()
  let vault = DeletionReadCredentialVault(service: service)
  let request = UUID(), user = UUID(), foreignRequest = UUID(), foreignUser = UUID(), deadline = Date(timeIntervalSince1970: floor(Date().timeIntervalSince1970) + 600)
  defer { try? vault.remove(requestID: request); try? vault.remove(requestID: foreignRequest) }
  let empty = try vault.references(); precondition(empty.isEmpty)
  let first = try vault.prepare(requestID: request, userID: user, inventoryDigest: String(repeating: "a", count: 64), expiresAt: deadline)
  precondition(first.token.count == 43)
  let storedFirst = try vault.read(requestID: request); precondition(storedFirst == first)
  let retry = try vault.prepare(requestID: request, userID: user, inventoryDigest: String(repeating: "a", count: 64), expiresAt: deadline)
  precondition(retry == first)
  _ = try vault.prepare(requestID: foreignRequest, userID: foreignUser, inventoryDigest: String(repeating: "b", count: 64), expiresAt: deadline)
  let ownReferences = try vault.references(userID: user)
  precondition(ownReferences == [.init(requestID: request, userID: user, inventoryDigest: String(repeating: "a", count: 64), expiresAt: deadline)])
  let allReferences = try vault.references(); precondition(allReferences.count == 2)
  let absentReferences = try vault.references(userID: UUID()); precondition(absentReferences.isEmpty)
  let unchanged = try vault.read(requestID: request); precondition(unchanged == first)
  let malformedAccount = "unexpected-record"
  let malformed: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service, kSecAttrAccount as String: malformedAccount,
      kSecAttrSynchronizable as String: false, kSecValueData as String: Data("synthetic malformed".utf8)]
  precondition(SecItemAdd(malformed as CFDictionary, nil) == errSecSuccess)
  defer { SecItemDelete([kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service, kSecAttrAccount as String: malformedAccount,
      kSecAttrSynchronizable as String: false] as CFDictionary) }
  do { _ = try vault.references(); preconditionFailure("Malformed receipt hidden") }
  catch DeletionReadCredentialVault.Failure.invalidInput {}
  precondition(SecItemDelete([kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service, kSecAttrAccount as String: malformedAccount,
      kSecAttrSynchronizable as String: false] as CFDictionary) == errSecSuccess)
  var overflow: [UUID] = []
  defer { for id in overflow { try? vault.remove(requestID: id) } }
  for _ in 0..<31 {
      let id = UUID(); overflow.append(id)
      _ = try vault.prepare(requestID: id, userID: user, inventoryDigest: String(repeating: "c", count: 64), expiresAt: deadline)
  }
  do { _ = try vault.references(); preconditionFailure("Overflow silently truncated") }
  catch DeletionReadCredentialVault.Failure.unavailable {}
  for id in overflow { try vault.remove(requestID: id) }


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
  try vault.remove(requestID: foreignRequest)
  try vault.remove(requestID: request)
  let absent = try vault.read(requestID: request); precondition(absent == nil)
  try vault.remove(requestID: request)
  print("PASS: isolated Keychain receipt roundtrip, exact retry, scope/deadline refusal and scoped cleanup and read-only receipt discovery")
 }
}
