#if DEBUG
import Foundation
import UserNotifications
import OuchiCore

/// Dedicated UI review only. Every request is handled in memory, never sent.
actor NativeReviewFixture {
    static let account=UUID(uuidString:"11111111-1111-4111-8111-111111111111")!
    static let token="synthetic-review-only"
    static let home="22222222-2222-4222-8222-222222222222"
    static let product="33333333-3333-4333-8333-333333333333"
    static let task="44444444-4444-4444-8444-444444444444"
    private var currentToken = NativeReviewFixture.token
    private var data:[String:Any]
    private let simulateOfflineRetry: Bool
    private var householdLoads = 0
    static func day(_ offset:Int) -> String {
        var c=Calendar(identifier:.gregorian);c.timeZone=TimeZone(identifier:"Asia/Tokyo")!
        let f=DateFormatter();f.locale=Locale(identifier:"en_US_POSIX");f.calendar=c;f.timeZone=c.timeZone;f.dateFormat="yyyy-MM-dd"
        return f.string(from:c.date(byAdding:.day,value:offset,to:Date())!)
    }
    static func sessionBytes() throws -> Data {
        try JSONSerialization.data(withJSONObject:["access_token":token,"refresh_token":"synthetic-unused","expires_at":Date().timeIntervalSince1970+7200,"user":["id":account.uuidString,"email":"review@example.invalid"]])
    }
    init(includeSecondHome: Bool = false, simulateOfflineRetry: Bool = false) {
        self.simulateOfflineRetry = simulateOfflineRetry
        data=["homes":[["id":Self.home,"name":"サンプルのわが家","kind":"home","role":"owner"]],
              "products":[["id":Self.product,"homeId":Self.home,"categoryId":"air-purifier","maker":"画面確認用","name":"空気清浄機（サンプル）","modelNumber":"SAMPLE-001","memo":"実際の製品・公式情報ではありません。"]],
              "tasks":[["id":Self.task,"productId":Self.product,"name":"フィルター確認（サンプル）","kind":"点検","intervalDays":30,"nextDueAt":Self.day(0),"sourceKind":"ユーザー設定","sourceNote":"画面の確認用です。メンテナンスの推奨ではありません。"]],
              "history":[["id":"55555555-5555-4555-8555-555555555555","taskId":Self.task,"productId":Self.product,"completedAt":Self.day(-2),"note":"サンプルの完了記録"]]]
        if includeSecondHome {
            data["homes"] = [
                ["id":Self.home,"name":"サンプルのわが家","kind":"home","role":"owner"],
                ["id":"66666666-6666-4666-8666-666666666666","name":"サンプルの別の住まい","kind":"home","role":"member"]
            ]
        }
    }
    func reply(_ request:URLRequest) throws -> (Data,HTTPURLResponse) {
        guard let url=request.url,url.host=="aaaaaaaaaaaaaaaaaaaa.supabase.co",
              request.value(forHTTPHeaderField:"Authorization")=="Bearer "+currentToken else { throw CloudError.authenticationRequired }
        let body:Data
        switch (request.httpMethod,url.path) {
        case ("GET","/auth/v1/user"):
            if ProcessInfo.processInfo.environment["OUCHI_REVIEW_MFA_EXPIRED"] == "1" {
                return (Data("{}".utf8),HTTPURLResponse(url:url,statusCode:403,httpVersion:nil,headerFields:nil)!)
            }
            body=try JSONSerialization.data(withJSONObject:["id":Self.account.uuidString,"factors":[["id":"88888888-8888-4888-8888-888888888888","factor_type":"totp","status":"verified"]]])
        case ("POST","/auth/v1/factors/88888888-8888-4888-8888-888888888888/challenge"):
            body=try JSONSerialization.data(withJSONObject:["id":"99999999-9999-4999-8999-999999999999","type":"totp","expires_at":Date().timeIntervalSince1970+120])
        case ("POST","/auth/v1/factors/88888888-8888-4888-8888-888888888888/verify"):
            let input=try JSONDecoder().decode([String:String].self,from:request.httpBody ?? Data())
            guard input["challenge_id"]=="99999999-9999-4999-8999-999999999999",input["code"]=="123456" else {
                return (Data("{}".utf8),HTTPURLResponse(url:url,statusCode:422,httpVersion:nil,headerFields:nil)!)
            }
            currentToken="synthetic-promoted-review-only"
            body=try JSONSerialization.data(withJSONObject:["access_token":currentToken,"refresh_token":"synthetic-review-refresh","expires_in":3600,"user":["id":Self.account.uuidString]])
        case ("GET","/rest/v1/home_members"):
            guard let items=URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems,
                  items.count==2,
                  items.filter({$0.name=="select" && $0.value=="user_id,nickname"}).count==1,
                  let target=items.first(where:{$0.name=="homeId"})?.value,
                  let homes=data["homes"] as? [[String:String]],
                  homes.contains(where:{"eq."+$0["id",default:""]==target}) else { throw CloudError.invalidInput }
            body=try JSONSerialization.data(withJSONObject:[["user_id":"77777777-7777-4777-8777-777777777777","nickname":"家族のサンプル"]])
        case ("POST","/rest/v1/rpc/load_household"):
            householdLoads += 1
            if simulateOfflineRetry && (2...3).contains(householdLoads) {
                throw URLError(.notConnectedToInternet)
            }
            body=try JSONSerialization.data(withJSONObject:data)
        case ("POST","/rest/v1/rpc/complete_maintenance"):
            let input=try JSONDecoder().decode([String:String].self,from:request.httpBody ?? Data())
            guard input==["task_id":Self.task],var tasks=data["tasks"] as? [[String:Any]],var history=data["history"] as? [[String:Any]] else { throw CloudError.invalidInput }
            tasks[0]["lastCompletedAt"]=Self.day(0);tasks[0]["nextDueAt"]=Self.day(30)
            history.append(["id":UUID().uuidString.lowercased(),"taskId":Self.task,"productId":Self.product,"completedAt":Self.day(0),"note":"サンプル画面での完了操作"])
            data["tasks"]=tasks;data["history"]=history;body=Data("{}".utf8)
        default: throw CloudError.unavailable
        }
        return (body,HTTPURLResponse(url:url,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"application/json","Cache-Control":"no-store"])!)
    }
}

final class NativeReviewSessionStorage: SessionStorage, @unchecked Sendable {
    private let lock=NSLock();private var data:Data?
    init(_ data:Data) { self.data=data }
    func read()->Data? { lock.withLock { data } }
    func write(_ value:Data?) { lock.withLock { data=value } }
}
/// Auth protocol fixture for the full NativeRoot test. Durable journal contains
/// counters only; passwords, session tokens and capability keys are never logged.
actor ClosureRootAuthFixture {
    static let owner = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    static let family = UUID(uuidString: "66666666-6666-4666-8666-666666666666")!
    static let ownerToken = "synthetic-root-owner"
    static let familyToken = "synthetic-root-family"
    private let file: URL
    private var counts: [String: Int]
    private static let fields: Set<String> = ["ownerSignIn", "familySignIn", "ownerDeniedLoad", "familyLoad", "ownerLogout", "familyLogout"]
    init(file: URL) throws {
        self.file = file
        if FileManager.default.fileExists(atPath: file.path) {
            let bytes = try Data(contentsOf: file)
            guard bytes.count <= 4096 else { throw CloudError.unavailable }
            let decoded = try JSONDecoder().decode([String: Int].self, from: bytes)
            guard Set(decoded.keys) == Self.fields, decoded.values.allSatisfy({ (0...64).contains($0) }) else { throw CloudError.unavailable }
            counts = decoded
        } else { counts = Dictionary(uniqueKeysWithValues: Self.fields.map { ($0, 0) }) }
    }
    private func record(_ name: String) throws {
        guard let value = counts[name], value < 64 else { throw CloudError.unavailable }
        counts[name] = value + 1
        try JSONEncoder().encode(counts).write(to: file, options: .atomic)
    }
    func expectedSequenceObserved() -> Bool {
        counts["ownerSignIn"] == 1 && counts["familySignIn"] == 1 && (counts["ownerDeniedLoad"] ?? 0) >= 1
            && (counts["familyLoad"] ?? 0) >= 1 && counts["ownerLogout"] == 0 && counts["familyLogout"] == 1
    }
    func reply(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        guard let url = request.url, url.scheme == "https", url.host == "aaaaaaaaaaaaaaaaaaaa.supabase.co",
              request.httpMethod == "POST", request.value(forHTTPHeaderField: "apikey") == "sb_publishable_synthetic_root_review_only" else { throw CloudError.invalidInput }
        let parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let bytes: Data
        let status: Int
        switch url.path {
        case "/auth/v1/token":
            guard parts?.queryItems == [URLQueryItem(name: "grant_type", value: "password")],
                  request.value(forHTTPHeaderField: "Authorization") == nil,
                  let body = request.httpBody,
                  let input = try JSONSerialization.jsonObject(with: body) as? [String: String],
                  Set(input.keys) == ["email", "password"], input["password"] == "Sample-only-123",
                  let email = input["email"], ["review-owner@example.invalid", "review-family@example.invalid"].contains(email) else { throw CloudError.invalidInput }
            let owner = email == "review-owner@example.invalid"
            try record(owner ? "ownerSignIn" : "familySignIn")
            bytes = try JSONSerialization.data(withJSONObject: ["access_token": owner ? Self.ownerToken : Self.familyToken,
                "refresh_token": "synthetic-root-unused", "expires_at": Date().timeIntervalSince1970 + 7200,
                "user": ["id": (owner ? Self.owner : Self.family).uuidString, "email": email]])
            status = 200
        case "/rest/v1/rpc/load_household":
            guard parts?.query == nil, request.httpBody == Data("{}".utf8) else { throw CloudError.invalidInput }
            switch request.value(forHTTPHeaderField: "Authorization") {
            case "Bearer " + Self.ownerToken:
                // Retired Ouchi enrollment is denied while shared Auth remains
                // valid. Saved capability confirmation must still be reachable.
                try record("ownerDeniedLoad"); bytes = Data("{}".utf8); status = 403
            case "Bearer " + Self.familyToken:
                try record("familyLoad")
                bytes = Data(#"{"homes":[{"id":"77777777-7777-4777-8777-777777777777","name":"家族のサンプル住まい","kind":"home","role":"member"}],"products":[],"tasks":[],"history":[]}"#.utf8); status = 200
            default: throw CloudError.authenticationRequired
            }
        case "/auth/v1/logout":
            guard parts?.queryItems == [URLQueryItem(name: "scope", value: "local")], request.httpBody == nil else { throw CloudError.invalidInput }
            switch request.value(forHTTPHeaderField: "Authorization") {
            case "Bearer " + Self.ownerToken: try record("ownerLogout")
            case "Bearer " + Self.familyToken: try record("familyLogout")
            default: throw CloudError.authenticationRequired
            }
            bytes = Data(); status = 204
        default: throw CloudError.invalidInput
        }
        return (bytes, HTTPURLResponse(url: url, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json", "Cache-Control": "no-store"])!)
    }
}
/// No host notification daemon or real notices in this dedicated root fixture.
/// Actual notification delivery/removal is explicitly outside its evidence.
@MainActor final class ClosureRootNotificationFixture: LocalNotificationBackend {
    func pendingIDs() async -> [String] { [] }
    func deliveredIDs() async -> [String] { [] }
    func notificationAuthorized() async -> Bool { false }
    func requestAuthorization() async throws -> Bool { false }
    func addNotification(_ request: UNNotificationRequest) async throws { throw CloudError.unavailable }
    func removePending(_ identifiers: [String]) { precondition(identifiers.isEmpty) }
    func removeDelivered(_ identifiers: [String]) { precondition(identifiers.isEmpty) }
}
@MainActor final class ClosureRootReminderPreferences: LocalReminderPreferences {
    var account: UUID?
}
#endif
