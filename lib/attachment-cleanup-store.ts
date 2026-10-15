import {StorageApiError,type SupabaseClient} from '@supabase/supabase-js';
import {checkedAttachmentCleanupScope,type AttachmentCleanupScope,type AttachmentCleanupServices} from './attachment-cleanup';
export type AttachmentCleanupQuery=(sql:string,args:unknown[],signal:AbortSignal)=>Promise<{rows:Record<string,unknown>[]} >;
const prefix='select maintenance_private.';
/** Supply reviewed bounded private SQL and Storage transports. No service-role
 * RPC fallback, role/grant creation, URL discovery or scheduler. Private SQL
 * functions remain ungranted until separate operator review. Create one fresh
 * instance per bounded batch; at most 25 immutable approvals are retained. */
export function storedAttachmentCleanupServices(db:SupabaseClient,query:AttachmentCleanupQuery):AttachmentCleanupServices{
 if(typeof query!=='function')throw Error('Private cleanup query provider required');
 const bucket=db.storage.from('ouchi-product-attachments'),approved=new Map<string,AttachmentCleanupScope>();
 const args=(s:AttachmentCleanupScope)=>[s.id,s.lease,s.user,s.epoch,s.owner,s.path,s.mime];
 const sql=(name:string)=>prefix+name+'($1,$2,$3,$4,$5,$6,$7) as value';
 const value=async(statement:string,parameters:unknown[],signal:AbortSignal)=>{
  signal.throwIfAborted();const result=await query(statement,parameters,signal);signal.throwIfAborted();
  if(!Array.isArray(result?.rows)||result.rows.length!==1||Object.keys(result.rows[0]).join(',')!=='value')throw Error('Cleanup query unavailable');
  return result.rows[0].value;
 };
 const bound=(s:AttachmentCleanupScope)=>{
  const original=approved.get(s.id+':'+s.lease);
  return original&&!Object.keys(original).some(key=>original[key as keyof AttachmentCleanupScope]!==s[key as keyof AttachmentCleanupScope])?original:null;
 };
 const current=async(s:AttachmentCleanupScope,signal:AbortSignal)=>{
  signal.throwIfAborted();const scope=bound(s);if(!scope)return false;
  return await value(sql('attachment_cleanup_current'),args(scope),signal)===true;
 };
 const guard=async(s:AttachmentCleanupScope,signal:AbortSignal)=>{const scope=bound(s);if(!scope||!await current(scope,signal))throw Error('Cleanup lease unavailable');return scope;};
 return {
  candidates:signal=>value(prefix+'attachment_cleanup_candidates($1) as value',[25],signal),
  claim:async(id,lease,signal)=>{
   if(approved.size>=25&&!approved.has(id+':'+lease))throw Error('Bounded cleanup claims required');
   const raw=await value(prefix+'claim_attachment_cleanup($1,$2) as value',[id,lease],signal);
   if(raw===null)return null;
   const scope=checkedAttachmentCleanupScope(raw,id,lease);approved.set(id+':'+lease,scope);return scope;
  },
  current,
  remove:async(s,signal)=>{const scope=await guard(s,signal);const result=await bucket.remove([scope.path]);signal.throwIfAborted();if(result.error)throw Error('Cleanup removal outcome unknown');},
  absent:async(s,signal)=>{const scope=await guard(s,signal);const result=await bucket.download(scope.path);signal.throwIfAborted();return !result.data&&result.error instanceof StorageApiError&&result.error.code==='NoSuchKey';},
  complete:async(s,signal)=>{const scope=await guard(s,signal);return await value(sql('complete_attachment_cleanup'),args(scope),signal)===true;},
 };
}
