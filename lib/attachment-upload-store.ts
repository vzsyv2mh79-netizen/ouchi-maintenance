import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {BillingEnvironment} from './billing';
import {sessionAfterAuthVerification} from './verified-app-session';
import {purchaseAccountAfterAuthVerification} from './billing-account';
import {readVerifiedLedgerEntitlement} from './billing-ledger-entitlement';
import {readProductAttachment,attachmentLimits} from './product-attachment';
import type {AttachmentIdentity,AttachmentReservation,AttachmentUploadServices} from './attachment-upload';

/** One instance per server request, used only through uploadProductAttachment.
 * Caller provides a bounded service client and a server-selected purchase environment.
 * This prepares the formal adapter; it creates no bucket or public endpoint.
 */
export function storedAttachmentUploadServices(db:SupabaseClient,environment:BillingEnvironment,signal?:AbortSignal):AttachmentUploadServices{
 if(!['Sandbox','Production'].includes(environment))throw Error('Invalid attachment environment');
 const bucket=db.storage.from('ouchi-product-attachments');
 let authorized:AttachmentIdentity|null=null,requestSignal:AbortSignal|undefined;
 let approved:AttachmentReservation|null=null,inspected=false;
 const active=()=>{signal?.throwIfAborted();requestSignal?.throwIfAborted();};
 const guard=(r:AttachmentReservation)=>{
  active();
  if(!authorized||r.identity!==authorized||!approved||r.product!==approved.product||r.id!==approved.id||r.path!==approved.path||r.file.size!==approved.file.size||r.file.mime!==approved.file.mime||r.file.sha256!==approved.file.sha256)throw Error('Attachment scope changed');
  return approved;
 };
 const premium=async(identity:AttachmentIdentity)=>{
  active();
  if(identity!==authorized)throw Error('Unauthenticated attachment scope');
  const entitlement=await readVerifiedLedgerEntitlement(async(name,args)=>await db.rpc(name,args),{
   target_user:identity.user,verified_session:identity.session,target_epoch:identity.epoch,target_environment:environment,
  });
  active();if(identity!==authorized||entitlement.plan!=='premium')throw Error('Paid attachment access unavailable');
 };
 return {
  authorize:async request=>{
   authorized=null;approved=null;inspected=false;requestSignal=request.signal;active();
   const header=request.headers.get('authorization');
   if(!header?.startsWith('Bearer ')||header.length>16384)return null;
   const token=header.slice(7);if(!token||/\s/.test(token))return null;
   const verified=await db.auth.getUser(token);active();
   if(verified.error||!verified.data.user)return null;
   const identity=sessionAfterAuthVerification(token,verified.data.user.id);if(!identity)return null;
   const epoch=await purchaseAccountAfterAuthVerification(token,identity.userID,async(user,session)=>{
    const binding=await db.rpc('current_maintenance_purchase_account',{target_user:user,verified_session:session});
    if(binding.error)throw Error('Attachment binding unavailable');return binding.data;
   });
   active();if(!epoch)return null;
   const entitlement=await readVerifiedLedgerEntitlement(async(name,args)=>await db.rpc(name,args),{
    target_user:identity.userID,verified_session:identity.sessionID,target_epoch:epoch,target_environment:environment,
   });
   active();authorized=Object.freeze({user:identity.userID,session:identity.sessionID,epoch,premium:entitlement.plan==='premium'});
   return authorized;
  },
  reserve:async r=>{
   active();if(!authorized||r.identity!==authorized||r.path!==`${authorized.user}/${authorized.epoch}/${r.id}.${r.file.extension}`)throw Error('Unauthenticated attachment scope');
   await premium(r.identity);
   const result=await db.rpc('reserve_maintenance_attachment',{target_user:r.identity.user,verified_session:r.identity.session,expected_epoch:r.identity.epoch,target_product:r.product,attachment_id:r.id,byte_count:r.file.size,media_type:r.file.mime,measured_sha256:r.file.sha256});
   active();if(result.error||result.data!==r.id)throw Error('Attachment reservation unavailable');
   approved=Object.freeze({...r,file:Object.freeze({...r.file,bytes:new Uint8Array(r.file.bytes)})});inspected=false;
  },
  create:async r=>{
   const item=guard(r);await premium(item.identity);guard(r);inspected=false;
   const attempt=randomUUID();
   const begin=await db.rpc('begin_maintenance_attachment_write',{target_user:item.identity.user,verified_session:item.identity.session,expected_epoch:item.identity.epoch,target_attachment:item.id,target_attempt:attempt});
   // Lost/repeated begin acknowledgements do not permit a second remote write.
   if(begin.error||!begin.data||begin.data.attemptID!==attempt||begin.data.started!==true||begin.data.settled!==false)throw Error('Write start not confirmed');
   guard(r);
   const sent=await bucket.upload(item.path,item.file.bytes,{contentType:item.file.mime,upsert:false});
   // Even a timeout/abort can have committed. Keep its attempt pending.
   if(sent.error||!sent.data||sent.data.path!==item.path)throw Error('Write outcome unknown');
   const settled=await db.rpc('settle_maintenance_attachment_write',{target_attachment:item.id,target_attempt:attempt});
   if(settled.error||settled.data!==true)throw Error('Write settlement not confirmed');
   guard(r);
  },
  inspect:async r=>{
   const item=guard(r);inspected=false;
   const result=await bucket.download(item.path);guard(r);
   if(result.error||!result.data||result.data.size!==item.file.size||result.data.size>attachmentLimits.fileBytes)throw Error('Attachment object unavailable');
   const actual=await readProductAttachment(new Request('http://127.0.0.1/verified-attachment',{method:'POST',headers:{'content-type':result.data.type,'content-length':String(result.data.size)},body:await result.data.arrayBuffer(),signal:signal??requestSignal}));
   guard(r);if(actual.size!==item.file.size||actual.mime!==item.file.mime||actual.sha256!==item.file.sha256)throw Error('Stored attachment mismatch');
   inspected=true;return {size:actual.size,mime:actual.mime,sha256:actual.sha256};
  },
  finalize:async r=>{
   const item=guard(r);if(!inspected)throw Error('Attachment content not verified');
   const result=await db.rpc('finalize_maintenance_attachment',{target_user:item.identity.user,verified_session:item.identity.session,expected_epoch:item.identity.epoch,attachment_id:item.id,actual_bytes:item.file.size,verified_sha256:item.file.sha256});
   guard(r);if(result.error||result.data!==item.id)throw Error('Attachment completion unavailable');
  },
 };
}
