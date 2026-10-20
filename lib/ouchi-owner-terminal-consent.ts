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
export const OUCHI_OWNER_TERMINAL_VERIFIED_SQL='select maintenance_private.verify_ouchi_owner_terminal_root($1::uuid,$2::uuid,$3::jsonb) as verified';
export const OUCHI_OWNER_TERMINAL_CLOSE_SQL='select maintenance_private.close_ouchi_owner_terminal($1::uuid,$2::uuid,$3::jsonb,$4::uuid) as closed';
export const OUCHI_OWNER_TERMINAL_SQL='select * from maintenance_private.read_ouchi_owner_terminal_original($1::uuid,$2::uuid,$3::jsonb,$4::uuid)';

/** Separate dormant owner-zero terminal transition/history reader. Requires
 * exact fourteen pre-complete / fifteen complete receipts for a two-app scope,
 * immutable owner-zero closure, retained closed-user tombstone, canonical native
 * seal and unchanged original/session custody. Existing processing readers are
 * unchanged. Use held.bindTerminal, never a processing binding. All independent
 * current coverage providers remain mandatory through owning COMMIT. No billing,
 * Auth deletion, original renewal, result-token mint or notification delivery.
 */
export function createOuchiOwnerTerminalConsent(input:Options){
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
  checked(tx);const rows=(await tx.query(OUCHI_OWNER_TERMINAL_SQL,args)).rows;tx.signal.throwIfAborted();
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
  const final=(await tx.query(OUCHI_OWNER_TERMINAL_SQL,args)).rows;tx.signal.throwIfAborted();
  if(final.length!==1||!exact(final[0],['payload','signature','backend_pid','transaction_id'])||final[0].backend_pid!==pin.pid||final[0].transaction_id!==pin.xid||final[0].signature!==signature||JSON.stringify(final[0].payload)!==originalRowText||canonical(final[0].payload as Payload)!==originalText)throw Error('Owner historical frame changed after independent readback');
  return Object.freeze({kind:'owner-only-terminal-transition-history' as const,payload:original,signature});
 }
 return Object.freeze({readSnapshot:snapshot,async read(tx:Transaction){
  checked(tx);let state=checks.get(tx);
  if(!state){
   state={valid:false,proof:null};checks.set(tx,state);const held=state;
   tx.beforeCommit('ouchi-owner-terminal:'+scope.requestID,async()=>{
    if(!held.valid)return false;
    try{const done=(await tx.query(OUCHI_OWNER_TERMINAL_VERIFIED_SQL,args.slice(0,3))).rows;if(done.length!==1||done[0].verified!==true)return false;const final=await snapshot(tx);return !!final&&final.signature+canonical(final.payload)===held.proof;}catch{return false;}
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

/** Metadata-only close; its SQL deferred constraint requires exact global
 * COMPLETE on this same transaction. The caller owns root completion and must
 * roll back every refusal. It never clears the retired-user writer tombstone.
 */
export function createOuchiOwnerTerminalClosure(input:Options){
 const reader=createOuchiOwnerTerminalConsent(input),scope=normalizeSharedDeletionScope(input.scope);
 return Object.freeze({async close(tx:Transaction){
  const first=await reader.read(tx);if(!first)return false;
  const rows=(await tx.query(OUCHI_OWNER_TERMINAL_CLOSE_SQL,[scope.requestID,scope.leaseToken,JSON.stringify(scope),input.completionLease])).rows;
  if(rows.length!==1||rows[0].closed!==true)throw Error('Owner terminal closure unconfirmed');
  const final=await reader.readSnapshot(tx);
  if(!final||final.signature!==first.signature||canonical(final.payload)!==canonical(first.payload))throw Error('Owner terminal original changed');
  return true;
 },readSnapshot:reader.readSnapshot});
}

type ResultOptions=Options&{authorizeResult:(tx:Transaction,scope:Scope,signal:AbortSignal)=>Promise<boolean>};
/** Read-only terminal result. Authorization MUST check the separately
 * pre-custodied finite hashed credential; this factory mints/rotates no token.
 * Completion says nothing about actual notification or adopted retention SLA.
 */
export function createOuchiOwnerTerminalResultReader(input:ResultOptions){
 if(typeof input.authorizeResult!=='function')throw Error('Independent finite result credential required');
 const reader=createOuchiOwnerTerminalConsent(input),scope=normalizeSharedDeletionScope(input.scope);
 return async(tx:Transaction)=>{
  const authorize=()=>input.authorizeResult(tx,scope,tx.signal);
  if(await authorize()!==true)throw Error('Terminal result unauthorized');
  const done=(await tx.query(OUCHI_OWNER_TERMINAL_VERIFIED_SQL,[scope.requestID,scope.leaseToken,JSON.stringify(scope)])).rows;
  if(done.length!==1||done[0].verified!==true)return Object.freeze({state:'unconfirmed' as const});
  if(!await reader.read(tx))return Object.freeze({state:'unconfirmed' as const});
  tx.beforeCommit('ouchi-owner-terminal-result:'+scope.requestID,authorize);
  if(await authorize()!==true)throw Error('Terminal result authorization changed');
  return Object.freeze({state:'complete' as const,notification:'unconfirmed' as const,retention:'unconfirmed' as const});
 };
}
