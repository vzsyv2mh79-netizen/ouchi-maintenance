#if DEBUG
import Foundation
import OuchiCore

/// Dedicated UI review only. Every request is handled in memory, never sent.
actor NativeReviewFixture {
    static let account=UUID(uuidString:"11111111-1111-4111-8111-111111111111")!
    static let token="synthetic-review-only"
    static let home="22222222-2222-4222-8222-222222222222"
    static let product="33333333-3333-4333-8333-333333333333"
    static let task="44444444-4444-4444-8444-444444444444"
    private var data:[String:Any]
    static func day(_ offset:Int) -> String {
        var c=Calendar(identifier:.gregorian);c.timeZone=TimeZone(identifier:"Asia/Tokyo")!
        let f=DateFormatter();f.locale=Locale(identifier:"en_US_POSIX");f.calendar=c;f.timeZone=c.timeZone;f.dateFormat="yyyy-MM-dd"
        return f.string(from:c.date(byAdding:.day,value:offset,to:Date())!)
    }
    static func sessionBytes() throws -> Data {
        try JSONSerialization.data(withJSONObject:["access_token":token,"refresh_token":"synthetic-unused","expires_at":Date().timeIntervalSince1970+7200,"user":["id":account.uuidString,"email":"review@example.invalid"]])
    }
    init(includeSecondHome: Bool = false) {
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
              request.value(forHTTPHeaderField:"Authorization")=="Bearer "+Self.token else { throw CloudError.authenticationRequired }
        let body:Data
        switch (request.httpMethod,url.path) {
        case ("GET","/rest/v1/home_members"):
            guard let items=URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems,
                  items.count==2,
                  items.filter({$0.name=="select" && $0.value=="user_id,nickname"}).count==1,
                  let target=items.first(where:{$0.name=="homeId"})?.value,
                  let homes=data["homes"] as? [[String:String]],
                  homes.contains(where:{"eq."+$0["id",default:""]==target}) else { throw CloudError.invalidInput }
            body=try JSONSerialization.data(withJSONObject:[["user_id":"77777777-7777-4777-8777-777777777777","nickname":"家族のサンプル"]])
        case ("POST","/rest/v1/rpc/load_household"):
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
#endif
