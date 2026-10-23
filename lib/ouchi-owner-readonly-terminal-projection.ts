import {createHmac,timingSafeEqual} from 'node:crypto';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';

type Scope=ReturnType<typeof normalizeSharedDeletionScope>;
type Transaction={signal:AbortSignal;query:(sql:string,args:unknown[])=>Promise<{rows:Record<string,unknown>[]}>};
type Payload={domain:string;scope:Scope;userID:string;nativeLease:string;sessionID:string;epochID:string;aal:'aal2';passwordAt:number;authenticatedAt:number;authStateDigest:string;expiresAt:number};
type Options={key:Uint8Array;scope:unknown;completionLease:string};
const domain='OuchiMaintenance/owner-only-original/v1';
const fields=['domain','scope','userID','nativeLease','sessionID','epochID','aal','passwordAt','authenticatedAt','authStateDigest','expiresAt'] as const;
const canonical=(p:Payload)=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,k==='scope'?normalizeSharedDeletionScope(p.scope):p[k]])));
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const exact=(o:unknown,keys:readonly string[])=>!!o&&typeof o==='object'&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
export const OUCHI_OWNER_READONLY_TERMINAL_SQL='select * from maintenance_private.read_ouchi_owner_terminal_projection($1::uuid,$2::uuid,$3::jsonb,$4::uuid)';

/** Snapshot-only historical fact projection for a separately credential-guarded
 * read-only server transport. No owning mutation hook, binding, result token,
 * current Auth exclusion or execution authority is issued. The private raw
 * original is verified here and never returned in the minimal result.
 */
export function createOuchiOwnerReadonlyTerminalProjection(input:Options){
 const scope=normalizeSharedDeletionScope(input.scope),scopeText=JSON.stringify(scope),nativeLease=input.completionLease,secret=Buffer.from(input.key);
 const own=scope.apps.find(a=>a.app==='ouchi-maintenance');
 if(!own||!uuid(nativeLease)||nativeLease===scope.leaseToken||!(input.key instanceof Uint8Array)||secret.length<32||secret.length>64)throw Error('Fixed owner projection scope/key required');
 const args=[scope.requestID,scope.leaseToken,scopeText,nativeLease];
 function checked(tx:Transaction){
  if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function')throw Error('Read-only server transaction required');
  tx.signal.throwIfAborted();
 }
 async function snapshot(tx:Transaction){
  checked(tx);const rows=(await tx.query(OUCHI_OWNER_READONLY_TERMINAL_SQL,args)).rows;tx.signal.throwIfAborted();
  if(rows.length===0)return Object.freeze({state:'unconfirmed' as const});
  if(rows.length!==1||!exact(rows[0],['payload','signature','backend_pid','snapshot_id','read_only']))throw Error('Exact private owner history required');
  const row=rows[0];
  if(!Number.isSafeInteger(row.backend_pid)||Number(row.backend_pid)<=0||row.read_only!==true||typeof row.snapshot_id!=='string'||!/^\d+:\d+:(?:\d+(?:,\d+)*)?$/.test(row.snapshot_id))throw Error('Read-only statement snapshot required');
  const p=row.payload as Payload,signature=row.signature;
  if(!exact(p,fields)||p.domain!==domain||!exact(p.scope,['protocolVersion','kind','requestID','userID','leaseToken','inventoryDigest','apps'])||!Array.isArray(p.scope.apps)||p.scope.apps.some(a=>!exact(a,['app','requestID','scopeID']))||JSON.stringify(normalizeSharedDeletionScope(p.scope))!==scopeText||p.userID!==scope.userID||p.nativeLease!==nativeLease||!uuid(p.sessionID)||p.epochID!==own!.scopeID||p.aal!=='aal2'||typeof p.authStateDigest!=='string'||!/^[a-f0-9]{64}$/.test(p.authStateDigest)||![p.passwordAt,p.authenticatedAt,p.expiresAt].every(n=>Number.isSafeInteger(n)&&n>0)||p.expiresAt!==Math.min(p.passwordAt,p.authenticatedAt)+600000||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))throw Error('Independent immutable owner original required');
  const expected=createHmac('sha256',secret).update(domain+'\n'+canonical(p)).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw Error('Independent immutable owner signature required');
  return Object.freeze({state:'complete' as const,notification:'unconfirmed' as const,retention:'unconfirmed' as const});
 }
 return Object.freeze({read:snapshot});
}
