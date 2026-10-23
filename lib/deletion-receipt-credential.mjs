import {randomBytes,createHash} from 'node:crypto';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
const fixed=value=>{const s={...normalizeSharedDeletionScope(value)};delete s.leaseToken;return s;};
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const digest=token=>createHash('sha256').update('Kakei/deletion-read/v1\n'+token).digest('hex');
const validToken=token=>typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token)&&Buffer.from(token,'base64url').toString('base64url')===token;
/** Undeployed, read-only capability. Issue before processing using fresh trusted
 * identity. Explicit lifetime is a server input limit, not an adopted policy.
 * Plain tokens go only to the caller; never persist/log them or place in URLs.
 */
export function createDeletionReadCredential({verifyIdentity,maxLifetimeMs}){
 if(typeof verifyIdentity!=='function'||!Number.isSafeInteger(maxLifetimeMs)||maxLifetimeMs<1||maxLifetimeMs>30*86400000)throw Error('Explicit credential custody required');
 return {
  async issue(value,accessToken,expiresAt,tx){
   const s=fixed(value),pin=(await tx.query('select pg_backend_pid() as pid,txid_current()::text as xid')).rows[0];
   const journal=(await tx.query('select user_id,scope,status,clock_timestamp() as now from private.kb_shared_deletion_journal where request_id=$1 for update',[s.requestID])).rows[0];
   if(!journal||journal.status!=='requested'||journal.user_id!==s.userID||canonical(journal.scope)!==canonical(s))throw Error('Read credential unavailable');
   const now=new Date(journal.now).getTime(),expiry=new Date(expiresAt).getTime();
   if(!Number.isFinite(expiry)||expiry<=now||expiry-now>maxLifetimeMs)throw Error('Explicit finite read deadline required');
   const identity=await verifyIdentity(accessToken,tx,tx.signal);
   const verifiedNow=new Date((await tx.query('select clock_timestamp() as now')).rows[0].now).getTime();if(expiry<=verifiedNow)throw Error('Read deadline elapsed');
   if(identity?.userID!==s.userID||!Number.isFinite(identity.authVerifiedAt)||identity.authVerifiedAt>verifiedNow||verifiedNow-identity.authVerifiedAt>600000)throw Error('Fresh identity required');
   const same=async()=>{if((await tx.query('select pg_backend_pid()=$1 and txid_current()=$2::bigint as ok',[pin.pid,pin.xid])).rows[0]?.ok!==true)throw Error('Pinned credential transaction required');};
   await same();if((await tx.query('select 1 from private.kb_deletion_read_credentials where request_id=$1',[s.requestID])).rowCount)throw Error('Credential already issued; no implicit rotation');const token=randomBytes(32).toString('base64url');
   await tx.query('insert into private.kb_deletion_read_credentials(request_id,scope,token_hash,expires_at) values($1,$2,$3,$4)',[s.requestID,s,digest(token),new Date(expiry).toISOString()]);
   await same();return {token,expiresAt:new Date(expiry).toISOString()};
  },
  // Device creates and securely saves the token BEFORE registration. A lost
  // commit reply can then be reconciled without storing plaintext server-side.
  async register(value,accessToken,token,expiresAt,tx){
   if(!validToken(token))throw Error('Canonical read token required');
   const s=fixed(value),expiry=new Date(expiresAt).getTime();if(!Number.isFinite(expiry))throw Error('Finite read expiry required');
   const pin=(await tx.query('select pg_backend_pid() as pid,txid_current()::text as xid')).rows[0];
   const same=async()=>{if(!(await tx.query('select pg_backend_pid()=$1 and txid_current()=$2::bigint as ok',[pin.pid,pin.xid])).rows[0]?.ok)throw Error('Pinned credential registration required');};
   const j=(await tx.query('select user_id,scope,status,clock_timestamp() as now from private.kb_shared_deletion_journal where request_id=$1 for update',[s.requestID])).rows[0];
   if(!j||j.user_id!==s.userID||canonical(j.scope)!==canonical(s)||!['requested','processing','complete'].includes(j.status))throw Error('Credential registration scope unavailable');
   const old=(await tx.query('select *,expires_at>clock_timestamp() as live from private.kb_deletion_read_credentials where request_id=$1 for update',[s.requestID])).rows[0];
   if(old){if(old.token_hash!==digest(token)||canonical(old.scope)!==canonical(s)||new Date(old.expires_at).getTime()!==expiry||old.revoked_at!==null||!old.live||old.custody_confirmed_at===null)throw Error('Credential retry mismatch or expired');await same();return {registered:true,expiresAt:new Date(expiry).toISOString()};}
   if(j.status!=='requested'||expiry<=new Date(j.now).getTime()||expiry-new Date(j.now).getTime()>maxLifetimeMs)throw Error('Initial credential deadline unavailable');
   const identity=await verifyIdentity(accessToken,tx,tx.signal);const now=new Date((await tx.query('select clock_timestamp() as now')).rows[0].now).getTime();
   if(identity?.userID!==s.userID||!Number.isFinite(identity.authVerifiedAt)||identity.authVerifiedAt>now||now-identity.authVerifiedAt>600000||expiry<=now)throw Error('Fresh registration identity required');
   await same();await tx.query('insert into private.kb_deletion_read_credentials(request_id,scope,token_hash,expires_at,custody_confirmed_at) values($1,$2,$3,$4,clock_timestamp())',[s.requestID,s,digest(token),new Date(expiry).toISOString()]);await same();return {registered:true,expiresAt:new Date(expiry).toISOString()};
  },
  async custodyConfirmed(value,tx){
   const s=fixed(value);
   const j=(await tx.query('select user_id,scope,status from private.kb_shared_deletion_journal where request_id=$1 for update',[s.requestID])).rows[0];
   if(!j||!['requested','processing'].includes(j.status)||j.user_id!==s.userID||canonical(j.scope)!==canonical(s))return false;
   const c=(await tx.query('select scope,custody_confirmed_at is not null and custody_confirmed_at<=clock_timestamp() and expires_at>clock_timestamp() and revoked_at is null as ready from private.kb_deletion_read_credentials where request_id=$1 for update',[s.requestID])).rows[0];
   return c?.ready===true&&canonical(c.scope)===canonical(s);
  },
  async authorize(value,token,tx){
   if(!validToken(token))return false;
   const s=fixed(value);
   const row=(await tx.query("select c.scope,c.token_hash,c.expires_at>clock_timestamp() and c.revoked_at is null as live,j.status,j.user_id,j.scope as journal_scope from private.kb_deletion_read_credentials c join private.kb_shared_deletion_journal j using(request_id) where c.request_id=$1 and c.token_hash=$2",[s.requestID,digest(token)])).rows[0];
   return row?.live===true&&['processing','complete'].includes(row.status)&&row.user_id===s.userID&&canonical(row.scope)===canonical(s)&&canonical(row.journal_scope)===canonical(s);
  }
 };
}
