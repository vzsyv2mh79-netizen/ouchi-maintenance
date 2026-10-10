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
