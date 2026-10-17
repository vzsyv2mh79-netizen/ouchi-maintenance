import type {SupabaseClient} from '@supabase/supabase-js';
import {readProductAttachment,attachmentLimits} from './product-attachment';
import {sessionAfterAuthVerification} from './verified-app-session';
import {purchaseAccountAfterAuthVerification} from './billing-account';

/** Retained files remain readable without a current subscription. SQL checks live session, epoch and membership. */
export async function readAttachmentResponse(request:Request,db:SupabaseClient){
 const headers={'Cache-Control':'no-store'};
 const parameters=new URL(request.url).searchParams;
 const attachment=parameters.get('attachmentId'),product=parameters.get('productId'),usage=parameters.get('usage')==='true',binding=parameters.get('binding')==='true';
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const paged=parameters.get('page')==='true',after=parameters.get('after');
 if((paged&&!product)||(after&&(!paged||!uuid.test(after))))return Response.json({error:'一覧の続きを確認してください。'},{status:400,headers});
 if((!attachment&&!product&&!usage&&!binding)||(binding&&(attachment||product||usage))||(usage&&(attachment||product))||(attachment&&product)||(attachment&&!uuid.test(attachment))||(product&&!uuid.test(product)))return Response.json({error:'添付を確認してください。'},{status:400,headers});
 try{
  const header=request.headers.get('authorization');if(!header?.startsWith('Bearer ')||header.length>16384||/\s/.test(header.slice(7)))return Response.json({error:'ログインしてください。'},{status:401,headers});
  const token=header.slice(7);
  const verified=await db.auth.getUser(token);if(verified.error||!verified.data.user)return Response.json({error:'ログインを確認できません。'},{status:401,headers});
  const user=verified.data.user.id,identity=sessionAfterAuthVerification(token,user);if(!identity)return Response.json({error:'登録を確認できません。'},{status:401,headers});
  const epoch=await purchaseAccountAfterAuthVerification(token,user,async(target,session)=>{const result=await db.rpc('current_maintenance_purchase_account',{target_user:target,verified_session:session});if(result.error)throw new Error('Binding unavailable');return result.data;});
  if(!epoch)return Response.json({error:'登録を確認できません。'},{status:401,headers});
  if(binding)return Response.json({account:user,epoch},{headers});
  if(usage){
   const result=await db.rpc('maintenance_attachment_usage',{target_user:user,verified_session:identity.sessionID,expected_epoch:epoch});
   if(result.error||!result.data)throw new Error('Usage unavailable');
   const item=result.data as Record<string,number>;
   const keys=['usedBytes','usedFiles','reservedBytes','reservedFiles','limitBytes','limitFiles','fileLimitBytes'];
   if(keys.some(key=>!Number.isSafeInteger(item[key])||item[key]<0)||item.limitBytes!==attachmentLimits.accountBytes||item.limitFiles!==attachmentLimits.accountFiles||item.fileLimitBytes!==attachmentLimits.fileBytes||item.reservedBytes>item.usedBytes||item.reservedFiles>item.usedFiles)throw new Error('Invalid usage');
   return Response.json({usage:Object.fromEntries(keys.map(key=>[key,item[key]]))},{headers});
  }
  if(product){
   const values={target_user:user,verified_session:identity.sessionID,expected_epoch:epoch,target_product:product.toLowerCase()};
   const result=paged?await db.rpc('page_maintenance_attachments',{...values,after_attachment:after?.toLowerCase()??null}):await db.rpc('list_maintenance_attachments',values);
   const rows=paged?result.data?.items:result.data,next=paged?result.data?.next:null;
   if(result.error||!Array.isArray(rows)||(paged&&(rows.length>25||(next!==null&&(typeof next!=='string'||!uuid.test(next)||rows.length!==25||next!==rows.at(-1)?.id)))))throw new Error('Listing unavailable');
   const items=rows.map((item:{id:string;size:number;mime:string;createdAt:string})=>{
    if(typeof item.id!=='string'||!uuid.test(item.id)||!Number.isSafeInteger(item.size)||item.size<1||item.size>attachmentLimits.fileBytes||!['image/jpeg','image/png','application/pdf'].includes(item.mime)||typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt)))throw new Error('Invalid listing');
    return {id:item.id,size:item.size,mime:item.mime,createdAt:item.createdAt};
   });
   return Response.json(paged?{items,next}:{items},{headers});
  }
  // No premium check: reading/exporting retained files must remain available.
  const result=await db.rpc('read_maintenance_attachment',{target_user:user,verified_session:identity.sessionID,expected_epoch:epoch,attachment_id:attachment!.toLowerCase()});
  if(result.error)throw new Error('Metadata unavailable');
  if(!result.data)return Response.json({error:'添付を確認できません。'},{status:404,headers});
  const item=Object.freeze({...result.data}) as Readonly<{id:string;user:string;epoch:string;size:number;mime:string;sha256:string}>;
  if(item.id!==attachment!.toLowerCase()||typeof item.user!=='string'||!uuid.test(item.user)||typeof item.epoch!=='string'||!uuid.test(item.epoch)||!Number.isSafeInteger(item.size)||item.size<1||item.size>attachmentLimits.fileBytes||!['image/jpeg','image/png','application/pdf'].includes(item.mime)||typeof item.sha256!=='string'||!/^[0-9a-f]{64}$/.test(item.sha256))throw new Error('Invalid metadata');
  const extension=item.mime==='image/jpeg'?'jpg':item.mime==='image/png'?'png':'pdf';
  const file=await db.storage.from('ouchi-product-attachments').download(`${item.user}/${item.epoch}/${item.id}.${extension}`);
  if(file.error||!file.data||file.data.size!==item.size)throw new Error('Object unavailable');
  const actual=await readProductAttachment(new Request('http://127.0.0.1/attachment',{method:'POST',headers:{'content-type':file.data.type,'content-length':String(file.data.size)},body:await file.data.arrayBuffer()}));
  if(actual.sha256!==item.sha256||actual.mime!==item.mime)throw new Error('Object mismatch');
  // Remote reads can outlast a household membership change or account closure.
  // Revalidate from live server state after reading/verifying, before returning bytes.
  const current=await db.rpc('read_maintenance_attachment',{target_user:user,verified_session:identity.sessionID,expected_epoch:epoch,attachment_id:item.id});
  if(current.error)throw new Error('Read authorization unavailable');
  if(!current.data)return Response.json({error:'添付を確認できません。'},{status:404,headers});
  if(request.signal.aborted||(['id','user','epoch','size','mime','sha256'] as const).some(key=>current.data[key]!==item[key]))throw new Error('Attachment authorization changed');

  return new Response(new Uint8Array(actual.bytes),{headers:{...headers,'Content-Type':actual.mime,'Content-Disposition':`attachment; filename="ouchi-attachment-${item.id}.${extension}"`,'X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'添付を取得できませんでした。'},{status:503,headers});}
}

