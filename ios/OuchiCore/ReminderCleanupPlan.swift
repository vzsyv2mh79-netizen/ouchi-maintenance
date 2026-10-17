import Foundation

/// Pure scope selection; an unknown legacy owner is not permission to remove.
public struct ReminderCleanupPlan {
    public let identifiers: [String]
    public let ambiguousLegacy: Bool
    public init(identifiers: [String], account: UUID) {
        let prefix = "ouchi.local." + account.uuidString.lowercased() + "."
        var owned: [String] = [], ambiguous = false
        for id in identifiers {
            let parts = id.split(separator: ".", omittingEmptySubsequences: false)
            guard parts.count >= 4, parts[0] == "ouchi", parts[1] == "local" else { continue }
            if parts.count == 5, id.hasPrefix(prefix), UUID(uuidString: String(parts[3])) != nil,
               let index = Int(parts[4]), index >= 0 { owned.append(id) }
            else if parts.count == 4, UUID(uuidString: String(parts[2])) != nil,
                    let index = Int(parts[3]), index >= 0 {
                // A current preference cannot establish an old notification's
                // owner after account switches or a failed previous cleanup.
                ambiguous = true
            }
        }
        self.identifiers = owned
        self.ambiguousLegacy = ambiguous
    }
}
