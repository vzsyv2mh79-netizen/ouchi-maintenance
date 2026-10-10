import {createClient} from '@supabase/supabase-js';
import {uploadProductAttachment,type AttachmentReservation} from '@/lib/attachment-upload';
import {readProductAttachment,attachmentLimits} from '@/lib/product-attachment';
import {sessionAfterAuthVerification} from '@/lib/verified-app-session';
import {purchaseAccountAfterAuthVerification} from '@/lib/billing-account';
import {entitlementFromTransactions,type VerifiedTransaction} from '@/lib/billing';
export const runtime='nodejs';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 const url=process.env.OUCHI_ATTACHMENT_TEST_URL,key=process.env.OUCHI_ATTACHMENT_TEST_SERVICE_KEY;
 // Dedicated disposable loopback services only, never a shared project/Preview.
 if(process.env.NODE_ENV!=='development'||process.env.OUCHI_ATTACHMENT_TEST_MODE!=='true'||url!=='http://127.0.0.1:54321'||!key)return Response.json({error:'Local isolated test only'},{status:503,headers});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const bucket=db.storage.from('ouchi-product-attachments-test');
 const args=new URL(request.url).searchParams;
 const values=(r:AttachmentReservation)=>({target_user:r.identity.user,verified_session:r.identity.session,expected_epoch:r.identity.epoch,attachment_id:r.id});
 return uploadProductAttachment(request,args.get('productId')??'',args.get('attachmentId')??'',{
  authorize:async request=>{
   const header=request.headers.get('authorization');
   if(!header?.startsWith('Bearer ')||header.length>16384)return null;
   const token=header.slice(7);if(!token||/\s/.test(token))return null;
   const verified=await db.auth.getUser(token);if(verified.error||!verified.data.user)return null;
   const user=verified.data.user.id,identity=sessionAfterAuthVerification(token,user);if(!identity)return null;
   const epoch=await purchaseAccountAfterAuthVerification(token,user,async(target,session)=>{
    const binding=await db.rpc('current_maintenance_purchase_account',{target_user:target,verified_session:session});
    if(binding.error)throw new Error('Binding unavailable');return binding.data;
   });
   if(!epoch)return null;
   const rows=await db.from('ouchi_sandbox_transactions').select('payload').eq('user_id',user).eq('app_epoch_id',epoch);
   if(rows.error)throw new Error('Rights unavailable');
   const transactions=(rows.data??[]).map(row=>row.payload as VerifiedTransaction).filter(t=>t.environment==='Sandbox'&&t.accountToken===epoch);
   return {user,session:identity.sessionID,epoch,premium:entitlementFromTransactions(transactions,Date.now()).plan==='premium'};
  },
  reserve:async r=>{
   const result=await db.rpc('reserve_maintenance_attachment',{...values(r),target_product:r.product,byte_count:r.file.size,media_type:r.file.mime});
   if(result.error||result.data!==r.id)throw new Error('Reservation unavailable');
  },
  create:async r=>{
   const result=await bucket.upload(r.path,r.file.bytes,{contentType:r.file.mime,upsert:false});
   if(result.error)throw new Error('Object creation uncertain');
  },
  inspect:async r=>{
   const result=await bucket.download(r.path);
   if(result.error||!result.data||result.data.size>attachmentLimits.fileBytes)throw new Error('Object unavailable');
   const actual=await readProductAttachment(new Request('http://127.0.0.1/attachment',{method:'POST',headers:{'content-type':result.data.type,'content-length':String(result.data.size)},body:await result.data.arrayBuffer()}));
   return {size:actual.size,mime:actual.mime,sha256:actual.sha256};
  },
  finalize:async r=>{
   const result=await db.rpc('finalize_maintenance_attachment',{...values(r),actual_bytes:r.file.size,verified_sha256:r.file.sha256});
   if(result.error||result.data!==r.id)throw new Error('Completion unavailable');
  },
 });
}

export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'},url=process.env.OUCHI_ATTACHMENT_TEST_URL,key=process.env.OUCHI_ATTACHMENT_TEST_SERVICE_KEY;
 if(process.env.NODE_ENV!=='development'||process.env.OUCHI_ATTACHMENT_TEST_MODE!=='true'||url!=='http://127.0.0.1:54321'||!key)return Response.json({error:'Local isolated test only'},{status:503,headers});
 const parameters=new URL(request.url).searchParams;
 const attachment=parameters.get('attachmentId'),product=parameters.get('productId');
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if((!attachment&&!product)||(attachment&&product)||(attachment&&!uuid.test(attachment))||(product&&!uuid.test(product)))return Response.json({error:'添付を確認してください。'},{status:400,headers});
 try{
  const header=request.headers.get('authorization');if(!header?.startsWith('Bearer ')||header.length>16384||/\s/.test(header.slice(7)))return Response.json({error:'ログインしてください。'},{status:401,headers});
  const token=header.slice(7),db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await db.auth.getUser(token);if(verified.error||!verified.data.user)return Response.json({error:'ログインを確認できません。'},{status:401,headers});
  const user=verified.data.user.id,identity=sessionAfterAuthVerification(token,user);if(!identity)return Response.json({error:'登録を確認できません。'},{status:401,headers});
  const epoch=await purchaseAccountAfterAuthVerification(token,user,async(target,session)=>{const result=await db.rpc('current_maintenance_purchase_account',{target_user:target,verified_session:session});if(result.error)throw new Error('Binding unavailable');return result.data;});
  if(!epoch)return Response.json({error:'登録を確認できません。'},{status:401,headers});
  if(product){
   const result=await db.rpc('list_maintenance_attachments',{target_user:user,verified_session:identity.sessionID,expected_epoch:epoch,target_product:product.toLowerCase()});
   if(result.error||!Array.isArray(result.data))throw new Error('Listing unavailable');
   const items=result.data.map((item:{id:string;size:number;mime:string;createdAt:string})=>{
    if(typeof item.id!=='string'||!uuid.test(item.id)||!Number.isSafeInteger(item.size)||item.size<1||item.size>attachmentLimits.fileBytes||!['image/jpeg','image/png','application/pdf'].includes(item.mime)||typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt)))throw new Error('Invalid listing');
    return {id:item.id,size:item.size,mime:item.mime,createdAt:item.createdAt};
   });
   return Response.json({items},{headers});
  }
  // No premium check: reading/exporting retained files must remain available.
  const result=await db.rpc('read_maintenance_attachment',{target_user:user,verified_session:identity.sessionID,expected_epoch:epoch,attachment_id:attachment!.toLowerCase()});
  if(result.error)throw new Error('Metadata unavailable');
  if(!result.data)return Response.json({error:'添付を確認できません。'},{status:404,headers});
  const item=result.data as {id:string;user:string;epoch:string;size:number;mime:string;sha256:string};
  if(item.id!==attachment!.toLowerCase()||typeof item.user!=='string'||!uuid.test(item.user)||typeof item.epoch!=='string'||!uuid.test(item.epoch)||!Number.isSafeInteger(item.size)||item.size<1||item.size>attachmentLimits.fileBytes||!['image/jpeg','image/png','application/pdf'].includes(item.mime)||typeof item.sha256!=='string'||!/^[0-9a-f]{64}$/.test(item.sha256))throw new Error('Invalid metadata');
  const extension=item.mime==='image/jpeg'?'jpg':item.mime==='image/png'?'png':'pdf';
  const file=await db.storage.from('ouchi-product-attachments-test').download(`${item.user}/${item.epoch}/${item.id}.${extension}`);
  if(file.error||!file.data||file.data.size!==item.size)throw new Error('Object unavailable');
  const actual=await readProductAttachment(new Request('http://127.0.0.1/attachment',{method:'POST',headers:{'content-type':file.data.type,'content-length':String(file.data.size)},body:await file.data.arrayBuffer()}));
  if(actual.sha256!==item.sha256||actual.mime!==item.mime)throw new Error('Object mismatch');
  return new Response(new Uint8Array(actual.bytes),{headers:{...headers,'Content-Type':actual.mime,'Content-Disposition':`attachment; filename="ouchi-attachment-${item.id}.${extension}"`,'X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'添付を取得できませんでした。'},{status:503,headers});}
}
