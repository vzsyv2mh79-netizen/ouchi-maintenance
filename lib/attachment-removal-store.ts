import {StorageApiError,type SupabaseClient} from '@supabase/supabase-js';
import {sessionAfterAuthVerification} from './verified-app-session';
import {purchaseAccountAfterAuthVerification} from './billing-account';
import type {AttachmentRemovalScope,AttachmentRemovalServices} from './attachment-removal';
/** One request only, with a bounded server service client. No paid plan required. */
export function storedAttachmentRemovalServices(db:SupabaseClient,signal?:AbortSignal):AttachmentRemovalServices{
 let caller:{user:string;session:string;epoch:string}|null=null,approved:AttachmentRemovalScope|null=null;
 let requestSignal:AbortSignal|undefined;
 const active=()=>{signal?.throwIfAborted();requestSignal?.throwIfAborted();};
 const args=(id:string)=>{if(!caller)throw Error('Unauthenticated removal');return {target_user:caller.user,verified_session:caller.session,expected_epoch:caller.epoch,target_attachment:id};};
 const same=(value:unknown,item:Readonly<AttachmentRemovalScope>)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const row=value as Record<string,unknown>;
  return ['id','user','epoch','path','mime'].every(key=>row[key]===item[key as keyof AttachmentRemovalScope]);
 };
 const guard=async(item:Readonly<AttachmentRemovalScope>)=>{
  active();if(!approved||!same(approved,item))throw Error('Removal scope changed');
  const result=await db.rpc('begin_maintenance_attachment_removal',args(item.id));active();
  if(result.error||!same(result.data,item))throw Error('Removal authorization unavailable');
 };
 const bucket=db.storage.from('ouchi-product-attachments');
 return {
  begin:async(request,id)=>{
   caller=null;approved=null;requestSignal=request.signal;active();
   const header=request.headers.get('authorization');if(!header?.startsWith('Bearer ')||header.length>16384)return null;
   const token=header.slice(7);if(!token||/\s/.test(token))return null;
   const verified=await db.auth.getUser(token);active();if(verified.error||!verified.data.user)return null;
   const session=sessionAfterAuthVerification(token,verified.data.user.id);if(!session)return null;
   const epoch=await purchaseAccountAfterAuthVerification(token,session.userID,async(user,sessionID)=>{
    const value=await db.rpc('current_maintenance_purchase_account',{target_user:user,verified_session:sessionID});if(value.error)throw Error('Removal binding unavailable');return value.data;
   });active();if(!epoch)return null;
   caller=Object.freeze({user:session.userID,session:session.sessionID,epoch});
   const result=await db.rpc('begin_maintenance_attachment_removal',args(id));active();
   if(result.error)throw Error('Removal fence unavailable');if(result.data===null)return null;
   if(!result.data||typeof result.data!=='object'||Array.isArray(result.data)||result.data.id!==id)throw Error('Invalid removal receipt');
   // The coordinator independently validates the complete canonical path/type.
   approved=Object.freeze({...result.data}) as AttachmentRemovalScope;return approved;
  },
  remove:async item=>{
   await guard(item);const result=await bucket.remove([item.path]);active();if(result.error)throw Error('Removal outcome unknown');
  },
  absent:async item=>{
   await guard(item);const result=await bucket.download(item.path);active();
   return !result.data&&result.error instanceof StorageApiError&&result.error.code==='NoSuchKey';
  },
  complete:async item=>{
   await guard(item);const result=await db.rpc('complete_maintenance_attachment_removal',{...args(item.id),confirmed_path:item.path});active();return !result.error&&result.data===true;
  },
 };
}
