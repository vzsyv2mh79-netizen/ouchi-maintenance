import {createHmac,timingSafeEqual} from 'node:crypto';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';

type Scope=ReturnType<typeof normalizeSharedDeletionScope>;
type Transaction={signal:AbortSignal;query:(sql:string,args:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;beforeCommit:(key:string,check:()=>Promise<boolean>)=>void};
type Payload={domain:string;scope:Scope;userID:string;nativeLease:string;sessionID:string;epochID:string;aal:'aal2';passwordAt:number;authenticatedAt:number;authStateDigest:string;expiresAt:number};
type Options={key:Uint8Array;scope:unknown;completionLease:string;verifyReadAuthority:(tx:Transaction,scope:Scope,signal:AbortSignal)=>Promise<boolean>;verifyAuthRecreationFence:(tx:Transaction,scope:Scope,signal:AbortSignal)=>Promise<boolean>};
const domain='OuchiMaintenance/owner-only-original/v1';
const fields=['domain','scope','userID','nativeLease','sessionID','epochID','aal','passwordAt','authenticatedAt','authStateDigest','expiresAt'] as const;
const canonical=(p:Payload)=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,k==='scope'?normalizeSharedDeletionScope(p.scope):p[k]])));
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const exact=(o:unknown,keys:readonly string[])=>!!o&&typeof o==='object'&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
export const OUCHI_OWNER_AFTER_AUTH_SQL='select * from maintenance_private.read_ouchi_owner_after_auth_original($1::uuid,$2::uuid,$3::jsonb,$4::uuid)';

/** Separate dormant original history AFTER actual Auth removal, only while
 * the root is processing. This never locks a missing Auth parent and never
 * claims an empty Auth scan prevents a new user/session with the same ID.
 * verifyAuthRecreationFence is a separate mandatory TRUSTED read-only provider:
 * it must confirm that ALL real Auth INSERT/Admin-create/restore/signup/identity
 * paths and app re-enrollment paths are excluded for this actor through the
 * owning COMMIT. A boolean from a client, old receipt, SQL absence or app fence
 * alone cannot supply that evidence. No deployment implementation/default or
 * automatic Auth trigger/table lock/privilege change is provided here.
 * verifyReadAuthority separately checks retained obligations and current writer,
 * Storage and inventory coverage on this same transaction. Both checks repeat
 * at owning COMMIT. readSnapshot is hook-free for the existing final verifier.
 * SQL binds actual current user/session absence, exact original/checkpoint/
 * session custody, canonical native seal and ordered erase-auth root receipts.
 * No completed-root token authority, mutation or actual Auth removal is supplied.
 * Pre-native and Auth-parent-required readers remain unchanged.
 */
export function createOuchiOwnerAfterAuthConsent(input:Options){
 const scope=normalizeSharedDeletionScope(input.scope),scopeText=JSON.stringify(scope),nativeLease=input.completionLease,secret=Buffer.from(input.key),verify=input.verifyReadAuthority,verifyRecreation=input.verifyAuthRecreationFence;
 const own=scope.apps.find(a=>a.app==='ouchi-maintenance');
 if(!own||!uuid(nativeLease)||nativeLease===scope.leaseToken||!(input.key instanceof Uint8Array)||secret.length<32||secret.length>64||typeof verify!=='function'||typeof verifyRecreation!=='function')throw Error('Independent owner custody and current read authority required');
 const args=[scope.requestID,scope.leaseToken,scopeText,nativeLease];
 const pins=new WeakMap<Transaction,{pid:number;xid:string}>(),checks=new WeakMap<Transaction,{valid:boolean;proof:string|null}>();
 function checked(tx:Transaction){
  if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')throw Error('Checked owning historical transaction required');
  tx.signal.throwIfAborted();
 }
 async function snapshot(tx:Transaction){
  checked(tx);const rows=(await tx.query(OUCHI_OWNER_AFTER_AUTH_SQL,args)).rows;tx.signal.throwIfAborted();
  if(rows.length===0)return null;
  if(rows.length!==1||!exact(rows[0],['payload','signature','backend_pid','transaction_id']))throw Error('Exact private owner history required');
  const row=rows[0],pin={pid:Number(row.backend_pid),xid:String(row.transaction_id)},prior=pins.get(tx);
  if(!Number.isSafeInteger(row.backend_pid)||pin.pid<=0||typeof row.transaction_id!=='string'||!/^[1-9][0-9]*$/.test(pin.xid)||(prior&&(prior.pid!==pin.pid||prior.xid!==pin.xid)))throw Error('Historical physical transaction changed');
  const p=row.payload as Payload,signature=row.signature;
  if(!exact(p,fields)||p.domain!==domain||!exact(p.scope,['protocolVersion','kind','requestID','userID','leaseToken','inventoryDigest','apps'])||!Array.isArray(p.scope.apps)||p.scope.apps.some(a=>!exact(a,['app','requestID','scopeID']))||JSON.stringify(normalizeSharedDeletionScope(p.scope))!==scopeText||p.userID!==scope.userID||p.nativeLease!==nativeLease||!uuid(p.sessionID)||p.epochID!==own!.scopeID||p.aal!=='aal2'||typeof p.authStateDigest!=='string'||!/^[a-f0-9]{64}$/.test(p.authStateDigest)||![p.passwordAt,p.authenticatedAt,p.expiresAt].every(n=>Number.isSafeInteger(n)&&n>0)||p.expiresAt!==Math.min(p.passwordAt,p.authenticatedAt)+600000||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))throw Error('Independent immutable owner original required');
  const expected=createHmac('sha256',secret).update(domain+'\n'+canonical(p)).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw Error('Independent immutable owner signature required');
  const original=Object.freeze({...structuredClone(p),scope:normalizeSharedDeletionScope(p.scope)}),originalText=canonical(original),originalRowText=JSON.stringify(row.payload);
  pins.set(tx,pin);
  if(await verifyRecreation(tx,scope,tx.signal)!==true)throw Error('Current Auth recreation and reenrollment exclusion required');
  tx.signal.throwIfAborted();
  if(await verify(tx,scope,tx.signal)!==true)throw Error('Independent current owner history read authority required');
  tx.signal.throwIfAborted();
  if(await verifyRecreation(tx,scope,tx.signal)!==true)throw Error('Current Auth recreation and reenrollment exclusion required');
  tx.signal.throwIfAborted();
  const final=(await tx.query(OUCHI_OWNER_AFTER_AUTH_SQL,args)).rows;tx.signal.throwIfAborted();
  if(final.length!==1||!exact(final[0],['payload','signature','backend_pid','transaction_id'])||final[0].backend_pid!==pin.pid||final[0].transaction_id!==pin.xid||final[0].signature!==signature||JSON.stringify(final[0].payload)!==originalRowText||canonical(final[0].payload as Payload)!==originalText)throw Error('Owner historical frame changed after independent readback');
  return Object.freeze({kind:'owner-only-post-auth-processing-history' as const,payload:original,signature});
 }
 return Object.freeze({readSnapshot:snapshot,async read(tx:Transaction){
  checked(tx);let state=checks.get(tx);
  if(!state){
   state={valid:false,proof:null};checks.set(tx,state);const held=state;
   tx.beforeCommit('ouchi-owner-after-auth:'+scope.requestID,async()=>{
    if(!held.valid)return false;
    try{const final=await snapshot(tx);return !!final&&final.signature+canonical(final.payload)===held.proof;}catch{return false;}
   });
  }else if(!state.valid)throw Error('Previously refused owner history transaction');
  try{
   const first=await snapshot(tx);if(!first){state.valid=false;return null;}
   const proof=first.signature+canonical(first.payload);
   if(state.proof!==null&&state.proof!==proof)throw Error('Immutable owner history changed');
   state.proof=proof;state.valid=true;return first;
  }catch(error){state.valid=false;throw error;}
 }});
}
