/** Server orchestration for one authorized, durably fenced attachment removal.
 * No endpoint is enabled. Each adapter must validate live session/membership,
 * freeze new writes, and retain quota until verified absence is acknowledged.
 */
export type AttachmentRemovalScope={id:string;user:string;epoch:string;path:string;mime:'image/jpeg'|'image/png'|'application/pdf'};
export type AttachmentRemovalServices={
 // Verify exact caller and durably prevent any new upload/finalization before
 // returning. Pending/unknown writes cannot be declared quiescent by timeout.
 begin:(request:Request,id:string)=>Promise<AttachmentRemovalScope|null>;
 remove:(scope:Readonly<AttachmentRemovalScope>)=>Promise<void>;
 // Only definitive Storage absence (not arbitrary404/timeout) returns true.
 absent:(scope:Readonly<AttachmentRemovalScope>)=>Promise<boolean>;
 // Recheck durable fence, write quietness and exact scope; release quota last.
 complete:(scope:Readonly<AttachmentRemovalScope>)=>Promise<boolean>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const valid=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
export async function removeProductAttachment(request:Request,id:string,services:AttachmentRemovalServices){
 const headers={'Cache-Control':'no-store'};
 if(!valid(id))return Response.json({error:'添付を確認してください。'},{status:400,headers});
 try{
  request.signal.throwIfAborted();
  const value=await services.begin(request,id);request.signal.throwIfAborted();
  if(!value)return Response.json({error:'添付を確認できません。'},{status:404,headers});
  const extension=value.mime==='image/jpeg'?'jpg':value.mime==='image/png'?'png':value.mime==='application/pdf'?'pdf':null;
  if(value.id!==id||!valid(value.user)||!valid(value.epoch)||value.user===value.epoch||!extension||value.path!==`${value.user}/${value.epoch}/${id}.${extension}`)throw Error('Invalid removal scope');
  const scope=Object.freeze({...value});
  // A remove timeout may have succeeded. Reading definitive absence can recover
  // the same fenced scope; it must never authorize a fresh upload or new ID.
  try{await services.remove(scope);}catch{/* outcome reconciled below */}
  request.signal.throwIfAborted();
  if(await services.absent(scope)!==true)throw Error('Object absence unconfirmed');
  request.signal.throwIfAborted();
  if(await services.complete(scope)!==true)throw Error('Removal acknowledgement unavailable');
  request.signal.throwIfAborted();
  return Response.json({removed:true,attachmentId:id},{headers});
 }catch{return Response.json({error:'削除完了を確認できませんでした。同じ添付IDで再確認してください。'},{status:503,headers});}
}
