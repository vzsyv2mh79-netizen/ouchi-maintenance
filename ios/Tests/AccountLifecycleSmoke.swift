import Foundation
import OuchiCore
@main struct AccountLifecycleSmoke {
 static func main() async throws {
  let epoch="11111111-1111-4111-8111-111111111111"
  let api=DevelopmentAccountLifecycleAPI { request in
   precondition(request.url?.host=="127.0.0.1" && request.url?.port==3000)
   precondition(request.httpMethod=="POST" && request.value(forHTTPHeaderField:"Authorization")=="Bearer synthetic")
   let body=try JSONSerialization.jsonObject(with:request.httpBody!) as! [String:String]
   precondition(Set(body.keys)==Set(["confirmation","password"]) && body["password"]=="synthetic")
   let enrolling=request.url!.path.hasSuffix("account-reenrollment")
   precondition(body["confirmation"]==(enrolling ? "REENROLL_OUCHI_MAINTENANCE":"DELETE_OUCHI_MAINTENANCE"))
   let result: [String:Any]=enrolling ? ["appEnrollmentCreated":true,"epochID":epoch,"sharedIdentityPreserved":true] : ["appAccessClosed":true,"cleanupApplied":false,"sharedIdentityPreserved":true]
   return (try JSONSerialization.data(withJSONObject:result),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  try await api.closeAppAccess(token:"synthetic",password:"synthetic",confirmed:true)
  let enrolled = try await api.reenroll(token:"synthetic",password:"synthetic",confirmed:true)
  precondition(enrolled==UUID(uuidString:epoch))
  let forbidden=DevelopmentAccountLifecycleAPI { _ in fatalError("invalid request reached transport") }
  do { try await forbidden.closeAppAccess(token:"synthetic",password:"synthetic",confirmed:false);fatalError("missing consent accepted") } catch { precondition(error as? CloudError == .invalidInput) }
  do { _=try await forbidden.reenroll(token:"bad token",password:"synthetic",confirmed:true);fatalError("invalid bearer accepted") } catch { precondition(error as? CloudError == .authenticationRequired) }
  let redirected=DevelopmentAccountLifecycleAPI { _ in (Data("{}".utf8),HTTPURLResponse(url:URL(string:"https://untrusted.example/")!,statusCode:200,httpVersion:nil,headerFields:nil)!) }
  do { try await redirected.closeAppAccess(token:"synthetic",password:"synthetic",confirmed:true);fatalError("redirect accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  let rejected=DevelopmentAccountLifecycleAPI { request in (Data("{}".utf8),HTTPURLResponse(url:request.url!,statusCode:503,httpVersion:nil,headerFields:nil)!) }
  do { _=try await rejected.reenroll(token:"synthetic",password:"synthetic",confirmed:true);fatalError("failure treated as enrollment") } catch { precondition(error as? CloudError == .rejected(503)) }
  print("AccountLifecycleSmoke PASS: isolated endpoint, explicit consent, bounded input and server-confirmed results. Mock transport; no deletion or enrollment performed.")
 }
}
