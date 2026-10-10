import Foundation
import OuchiCore
@main struct AttachmentSmoke {
 static func main() async throws {
  let product=UUID(),attachment=UUID(),bytes=Data([137,80,78,71,13,10,26,10])
  let api=DevelopmentAttachmentAPI { request in
   precondition(request.url?.host=="127.0.0.1" && request.url?.port==3000)
   precondition(request.httpMethod=="POST" && request.httpBody==bytes)
   precondition(request.value(forHTTPHeaderField:"Content-Type")=="image/png" && request.value(forHTTPHeaderField:"Content-Length")=="8")
   let query=URLComponents(url:request.url!,resolvingAgainstBaseURL:false)!.queryItems!
   precondition(query.first(where:{$0.name=="attachmentId"})?.value==attachment.uuidString.lowercased())
   return (Data("{\"saved\":true,\"attachmentId\":\"\(attachment.uuidString)\"}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  try await api.upload(product:product,attachment:attachment,bytes:bytes,mime:"image/png",token:"synthetic",confirmed:true)
  let forbidden=DevelopmentAttachmentAPI { _ in fatalError("invalid upload reached transport") }
  do { try await forbidden.upload(product:product,attachment:attachment,bytes:bytes,mime:"image/png",token:"synthetic",confirmed:false);fatalError("missing consent accepted") } catch { precondition(error as? CloudError == .invalidInput) }
  do { try await forbidden.upload(product:product,attachment:attachment,bytes:Data(count:5*1024*1024+1),mime:"image/png",token:"synthetic",confirmed:true);fatalError("oversize accepted") } catch { precondition(error as? CloudError == .invalidInput) }
  let mismatch=DevelopmentAttachmentAPI { request in (Data("{\"saved\":true,\"attachmentId\":\"\(UUID())\"}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!) }
  do { try await mismatch.upload(product:product,attachment:attachment,bytes:bytes,mime:"image/png",token:"synthetic",confirmed:true);fatalError("different saved ID accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  let redirected=DevelopmentAttachmentAPI { _ in (Data(),HTTPURLResponse(url:URL(string:"https://untrusted.example")!,statusCode:200,httpVersion:nil,headerFields:nil)!) }
  do { try await redirected.upload(product:product,attachment:attachment,bytes:bytes,mime:"image/png",token:"synthetic",confirmed:true);fatalError("redirect accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  let downloaded=DevelopmentAttachmentAPI { request in
   precondition(request.httpMethod=="GET" && request.httpBody==nil)
   return (bytes,HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"image/png","Content-Disposition":"attachment; filename=\"ouchi-attachment-\(attachment.uuidString.lowercased()).png\""])!)
  }
  let file=try await downloaded.download(attachment:attachment,token:"synthetic");precondition(file.bytes==bytes && file.fileExtension=="png")
  let wrongFile=DevelopmentAttachmentAPI { request in (bytes,HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"image/png","Content-Disposition":"inline"])!) }
  do { _=try await wrongFile.download(attachment:attachment,token:"synthetic");fatalError("unidentified file accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  print("AttachmentSmoke PASS: consent, raw bytes, bounded upload, stable ID acknowledgement and redirect refusal. Mock only; no Storage upload.")
 }
}
