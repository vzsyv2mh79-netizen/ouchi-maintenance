import Foundation
import OuchiCore
@main struct AttachmentSmoke {
 static func main() async throws {
  let product=UUID(),attachment=UUID(),bytes=Data([137,80,78,71,13,10,26,10])
  let account=UUID(),epoch=UUID()
  let api=AttachmentAPI { request in
   precondition(request.url?.scheme=="https" && request.url?.host=="ouchi-maintenance.vercel.app" && request.url?.port==nil && request.url?.path=="/api/product-attachments")
   precondition(request.value(forHTTPHeaderField:"X-Ouchi-App-Epoch")==epoch.uuidString.lowercased())
   precondition(request.httpMethod=="POST" && request.httpBody==bytes)
   precondition(request.value(forHTTPHeaderField:"Content-Type")=="image/png" && request.value(forHTTPHeaderField:"Content-Length")=="8")
   let query=URLComponents(url:request.url!,resolvingAgainstBaseURL:false)!.queryItems!
   precondition(query.first(where:{$0.name=="attachmentId"})?.value==attachment.uuidString.lowercased())
   return (Data("{\"saved\":true,\"attachmentId\":\"\(attachment.uuidString)\"}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  try await api.upload(product:product,attachment:attachment,bytes:bytes,mime:"image/png",token:"synthetic",confirmed:true,expectedEpoch:epoch)
  let forbidden=AttachmentAPI { _ in fatalError("invalid upload reached transport") }
  do { try await forbidden.upload(product:product,attachment:attachment,bytes:bytes,mime:"image/png",token:"synthetic",confirmed:true);fatalError("formal upload without enrollment sent") } catch { precondition(error as? CloudError == .invalidInput) }
  do { try await forbidden.remove(attachment:attachment,token:"synthetic",confirmed:true);fatalError("formal deletion without enrollment sent") } catch { precondition(error as? CloudError == .invalidInput) }
  do { try await forbidden.upload(product:product,attachment:attachment,bytes:bytes,mime:"image/png",token:"synthetic",confirmed:false,expectedEpoch:epoch);fatalError("missing consent accepted") } catch { precondition(error as? CloudError == .invalidInput) }
  do { try await forbidden.upload(product:product,attachment:attachment,bytes:Data(count:5*1024*1024+1),mime:"image/png",token:"synthetic",confirmed:true,expectedEpoch:epoch);fatalError("oversize accepted") } catch { precondition(error as? CloudError == .invalidInput) }
  let mismatch=AttachmentAPI { request in (Data("{\"saved\":true,\"attachmentId\":\"\(UUID())\"}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!) }
  do { try await mismatch.upload(product:product,attachment:attachment,bytes:bytes,mime:"image/png",token:"synthetic",confirmed:true,expectedEpoch:epoch);fatalError("different saved ID accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  let redirected=AttachmentAPI { _ in (Data(),HTTPURLResponse(url:URL(string:"https://untrusted.example")!,statusCode:200,httpVersion:nil,headerFields:nil)!) }
  do { try await redirected.upload(product:product,attachment:attachment,bytes:bytes,mime:"image/png",token:"synthetic",confirmed:true,expectedEpoch:epoch);fatalError("redirect accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  let downloaded=AttachmentAPI { request in
   precondition(request.httpMethod=="GET" && request.httpBody==nil)
   return (bytes,HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"image/png","Content-Disposition":"attachment; filename=\"ouchi-attachment-\(attachment.uuidString.lowercased()).png\""])!)
  }
  let file=try await downloaded.download(attachment:attachment,token:"synthetic");precondition(file.bytes==bytes && file.fileExtension=="png")
  let wrongFile=AttachmentAPI { request in (bytes,HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":"image/png","Content-Disposition":"inline"])!) }
  do { _=try await wrongFile.download(attachment:attachment,token:"synthetic");fatalError("unidentified file accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  for (body,mime) in [(Data(count:5*1024*1024+1),"image/png"),(Data([0,1,2]),"image/png"),(bytes,"text/html")] {
   let invalid=AttachmentAPI { request in (body,HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:["Content-Type":mime,"Content-Disposition":"attachment; filename=\"ouchi-attachment-\(attachment.uuidString.lowercased()).png\""])!) }
   do { _=try await invalid.download(attachment:attachment,token:"synthetic");fatalError("invalid download accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  }
  do { _=try await redirected.download(attachment:attachment,token:"synthetic");fatalError("download redirect accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  let listed=AttachmentAPI { request in
   precondition(URLComponents(url:request.url!,resolvingAgainstBaseURL:false)!.queryItems?.first?.name=="productId")
   return (Data("{\"items\":[{\"id\":\"\(attachment.uuidString)\",\"size\":8,\"mime\":\"image/png\",\"createdAt\":\"2026-10-10T10:00:00Z\"}]}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  let items=try await listed.list(product:product,token:"synthetic");precondition(items.count==1 && items[0].id==attachment)
  let badList=AttachmentAPI { request in
   (Data("{\"items\":[{\"id\":\"\(attachment.uuidString)\",\"size\":8,\"mime\":\"image/png\",\"createdAt\":\"invalid\"}]}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  do { _=try await badList.list(product:product,token:"synthetic");fatalError("malformed listing accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  let usageAPI=AttachmentAPI { request in
   (Data("{\"usage\":{\"usedBytes\":8,\"usedFiles\":1,\"reservedBytes\":8,\"reservedFiles\":1,\"limitBytes\":104857600,\"limitFiles\":100,\"fileLimitBytes\":5242880}}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  let usage=try await usageAPI.usage(token:"synthetic");precondition(usage.usedBytes==8 && usage.reservedFiles==1)
  let bindingAPI=AttachmentAPI { request in
   precondition(request.url?.query=="binding=true")
   return (Data("{\"account\":\"\(account.uuidString)\",\"epoch\":\"\(epoch.uuidString)\"}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  let binding=try await bindingAPI.binding(token:"synthetic");precondition(binding.account==account && binding.epoch==epoch)
  let invalidBinding=AttachmentAPI { request in
   (Data("{\"account\":\"\(account.uuidString)\",\"epoch\":\"\(account.uuidString)\"}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  do { _=try await invalidBinding.binding(token:"synthetic");fatalError("Auth ID used as enrollment") } catch { precondition(error as? CloudError == .malformedResponse) }
  let removalAPI=AttachmentAPI { request in
   precondition(request.httpMethod=="DELETE" && request.httpBody==nil && request.url?.path=="/api/product-attachments")
   let query=URLComponents(url:request.url!,resolvingAgainstBaseURL:false)!.queryItems!
   precondition(query.count==1 && query[0].name=="attachmentId" && query[0].value==attachment.uuidString.lowercased())
   return (Data("{\"removed\":true,\"attachmentId\":\"\(attachment.uuidString)\"}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  try await removalAPI.remove(attachment:attachment,token:"synthetic",confirmed:true,expectedEpoch:epoch)
  do { try await forbidden.remove(attachment:attachment,token:"synthetic",confirmed:false,expectedEpoch:epoch);fatalError("unconfirmed deletion sent") } catch { precondition(error as? CloudError == .invalidInput) }
  let wrongRemoval=AttachmentAPI { request in
   (Data("{\"removed\":true,\"attachmentId\":\"\(UUID())\"}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  do { try await wrongRemoval.remove(attachment:attachment,token:"synthetic",confirmed:true,expectedEpoch:epoch);fatalError("different file deletion accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  do { try await redirected.remove(attachment:attachment,token:"synthetic",confirmed:true,expectedEpoch:epoch);fatalError("deletion redirect accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  let pending=try PendingAttachment(account:account,epoch:epoch,product:product,id:attachment,bytes:bytes,mime:"image/png")
  let serialized=try pending.encode(),restored=try PendingAttachment.decode(serialized,account:account,epoch:epoch)
  precondition(restored.id==attachment && restored.product==product && restored.bytes==bytes)
  for (otherAccount,otherEpoch) in [(UUID(),epoch),(account,UUID())] {
   do { _=try PendingAttachment.decode(serialized,account:otherAccount,epoch:otherEpoch);fatalError("retry crossed enrollment") } catch { precondition(error as? CloudError == .authenticationRequired) }
  }
  do { _=try PendingAttachment(account:account,epoch:epoch,product:product,id:attachment,bytes:Data(count:5*1024*1024+1),mime:"image/png");fatalError("oversized retry persisted") } catch { precondition(error as? CloudError == .invalidInput) }
  let pageIDs=(0..<27).map { _ in UUID() }.sorted { $0.uuidString < $1.uuidString }
  @Sendable func itemJSON(_ id: UUID) -> String { "{\"id\":\"\(id.uuidString)\",\"size\":8,\"mime\":\"image/png\",\"createdAt\":\"2026-10-10T10:00:00Z\"}" }
  let pageAPI=AttachmentAPI { request in
   let query=URLComponents(url:request.url!,resolvingAgainstBaseURL:false)!.queryItems!
   precondition(query.contains(where: { $0.name=="page" && $0.value=="true" }))
   let after=query.first(where: { $0.name=="after" })?.value
   if let after { precondition(after==pageIDs[24].uuidString.lowercased()) }
   let ids=after==nil ? Array(pageIDs.prefix(25)) : Array(pageIDs.suffix(2))
   let next=after==nil ? "\"\(pageIDs[24].uuidString)\"" : "null"
   let body="{\"items\":["+ids.map(itemJSON).joined(separator:",")+"],\"next\":"+next+"}"
   return (Data(body.utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  let firstPage=try await pageAPI.page(product:product,token:"synthetic")
  let secondPage=try await pageAPI.page(product:product,after:firstPage.next,token:"synthetic")
  precondition((firstPage.items+secondPage.items).map(\.id)==pageIDs && secondPage.next==nil)
  for body in ["{\"items\":["+pageIDs.prefix(26).map(itemJSON).joined(separator:",")+"],\"next\":null}","{\"items\":["+itemJSON(pageIDs[0])+"],\"next\":\"\(pageIDs[0])\"}"] {
   let invalidPage=AttachmentAPI { request in (Data(body.utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!) }
   do { _=try await invalidPage.page(product:product,token:"synthetic");fatalError("invalid page accepted") } catch { precondition(error as? CloudError == .malformedResponse) }
  }
  let releaseScope=AttachmentAPI(isolatedDevelopment:true,loopbackPort:3210) { request in
   precondition(request.url?.scheme=="https" && request.url?.host=="ouchi-maintenance.vercel.app" && request.url?.path=="/api/product-attachments")
   return (Data("{\"account\":\"\(account.uuidString)\",\"epoch\":\"\(epoch.uuidString)\"}".utf8),HTTPURLResponse(url:request.url!,statusCode:200,httpVersion:nil,headerFields:nil)!)
  }
  _=try await releaseScope.binding(token:"synthetic")
  print("AttachmentSmoke PASS: Release ignores loopback, consent, raw bytes, bounded upload, stable ID acknowledgement, bounded typed download and redirect refusal. Mock only; no Storage request.")
 }
}
