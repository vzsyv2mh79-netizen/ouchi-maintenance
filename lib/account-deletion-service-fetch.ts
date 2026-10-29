import 'server-only';
import {createAttachmentFetch} from './attachment-fetch';

const functions=new Set([
 'claim_maintenance_account_deletion','defer_maintenance_account_deletion',
 'maintenance_deletion_completion_is_confirmed','maintenance_deletion_identity_is_erased',
 'maintenance_deletion_lease_is_current','capture_maintenance_deletion_objects',
 'read_maintenance_deletion_objects','confirm_maintenance_deletion_object_absence',
 'erase_maintenance_deletion_web_push','erase_maintenance_deletion_native_push',
 'erase_maintenance_deletion_native_delivery_identities','maintenance_deletion_registrations_are_erased',
 'erase_maintenance_deletion_records','erase_reviewed_retirement_metadata',
 'erase_maintenance_deletion_reconciliation','erase_maintenance_deletion_reminder_schedule',
 'erase_maintenance_deletion_notifications','capture_maintenance_deletion_receipt_sessions',
 'erase_maintenance_deletion_enrollment_consents','erase_maintenance_deletion_prior_preferences',
 'erase_maintenance_deletion_restore_jobs','erase_maintenance_deletion_restore_proofs',
 'minimize_maintenance_deletion_object_inventory','erase_maintenance_deletion_management_claims',
 'erase_maintenance_deletion_purchase_ledger','erase_maintenance_deletion_identity',
 'maintenance_deletion_retention_is_confirmed','complete_maintenance_account_deletion',
 'erase_maintenance_deletion_closure_metadata',
]);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const originalPath=(v:unknown):v is string=>{
 if(typeof v!=='string')return false;
 const match=/^([^/]+)\/([^/]+)\/([^/.]+)\.(jpg|png|pdf)$/.exec(v);
 return !!match&&match.slice(1,4).every(uuid);
};
function json(body:BodyInit|null|undefined):Record<string,unknown>|null{
 if(typeof body!=='string'||body.length>4096)return null;
 try{const value:unknown=JSON.parse(body);return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}catch{return null;}
}

/** Server-only fixed-project SDK transport. Its allowlist is defense in depth,
 * not a substitute for SQL leases/scope or a reduction of the key's privileges.
 * No Auth-admin, table, arbitrary RPC, signed URL or bucket-management request.
 */
export function createAccountDeletionServiceFetch(projectID:string,signal:AbortSignal):typeof fetch{
 if(!/^[a-z]{20}$/.test(projectID)||!(signal instanceof AbortSignal))throw Error('Explicit bounded deletion transport required');
 const origin=`https://${projectID}.supabase.co`,bucket='/storage/v1/object/ouchi-product-attachments';
 return async(input,init)=>{
  signal.throwIfAborted();
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.origin!==origin||url.username||url.password||url.search||url.hash||(input instanceof Request&&input.body!==null))throw Error('Exact app deletion endpoint required');
  const method=init?.method??(input instanceof Request?input.method:'GET');let allowed=false,rpc=false;
  if(url.pathname.startsWith('/rest/v1/rpc/')){
   const name=url.pathname.slice('/rest/v1/rpc/'.length),body=json(init?.body);
   const keys=name==='confirm_maintenance_deletion_object_absence'?'target_attachment,target_epoch,target_lease,target_request,target_user':'target_epoch,target_lease,target_request,target_user';
   rpc=true;
   allowed=method==='POST'&&functions.has(name)&&(name==='claim_maintenance_account_deletion'
    ?(init?.body==null||!!body&&Object.keys(body).length===0)
    :!!body&&Object.keys(body).sort().join(',')===keys&&Object.values(body).every(uuid));
   const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
   if(['content-profile','accept-profile'].some(k=>headers.has(k)&&headers.get(k)!=='public'))allowed=false;
  }else if(method==='GET'&&url.pathname.startsWith(bucket+'/')&&init?.body==null){
   allowed=originalPath(url.pathname.slice(bucket.length+1));
  }else if(method==='DELETE'&&url.pathname===bucket){
   const body=json(init?.body);allowed=!!body&&Object.keys(body).join(',')==='prefixes'&&Array.isArray(body.prefixes)&&body.prefixes.length===1&&originalPath(body.prefixes[0]);
  }
  if(!allowed)throw Error('Exact app deletion operation required');
  return createAttachmentFetch(signal,5000,rpc?262144:5242880)(input,{...init,cache:'no-store'});
 };
}
