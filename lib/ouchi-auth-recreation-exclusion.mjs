import {randomBytes} from 'node:crypto';
import {createDedicatedPostgresConnection} from './dedicated-postgres-connection.mjs';
import {createPostgresClient} from './postgres-driver.mjs';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
import {ouchiAuthRecreationKey,OUCHI_AUTH_INSERT_GUARD_SHA256} from './ouchi-auth-recreation-key.mjs';

const HOLDER='ouchi_auth_exclusion_backend',CALLER='shared_retirement_backend',GUARD_OWNER='ouchi_auth_insert_guard_owner';
const sameScope=(a,b)=>JSON.stringify(normalizeSharedDeletionScope(a))===JSON.stringify(b);
const safeRole=(alias,login,noInherit)=>`${alias}.rolcanlogin=${login?'true':'false'} ${noInherit?`and not ${alias}.rolinherit`:''}
 and not ${alias}.rolsuper and not ${alias}.rolbypassrls and not ${alias}.rolcreatedb and not ${alias}.rolcreaterole and not ${alias}.rolreplication
 and (${alias}.rolvaliduntil is null or ${alias}.rolvaliduntil>pg_catalog.clock_timestamp())
 and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=${alias}.oid or m.roleid=${alias}.oid)
 and not exists(select 1 from pg_catalog.pg_database d where d.datdba=${alias}.oid)
 and not exists(select 1 from pg_catalog.pg_namespace ns where pg_catalog.has_schema_privilege(${alias}.oid,ns.oid,'CREATE'))
 and not exists(select 1 from pg_catalog.unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) x where pg_catalog.has_table_privilege(${alias}.oid,a.oid,x))
 and not exists(select 1 from pg_catalog.unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) x where pg_catalog.has_any_column_privilege(${alias}.oid,a.oid,x))`;
const tableCTE=`with a as(select c.oid,c.relkind,col.attnum from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 join pg_catalog.pg_attribute col on col.attrelid=c.oid and col.attname='id' and col.attnum>0 and not col.attisdropped
 where n.nspname='auth' and c.relname='users' and col.atttypid='pg_catalog.uuid'::regtype and col.attnotnull and col.attgenerated='' and col.attidentity='')`;
const triggerCommon=`t.tgenabled='A' and not t.tgisinternal and t.tgnargs=0 and t.tgqual is null and t.tgparentid=0 and t.tgconstraint=0 and not t.tgdeferrable and not t.tginitdeferred`;
export const OUCHI_AUTH_EXCLUSION_HOLDER_SQL=`${tableCTE}, g as(select p.* from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='maintenance_private' and p.proname='guard_ouchi_auth_recreation_identity' and p.pronargs=0)
 select pg_catalog.pg_backend_pid() as pid,(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database()) as database_oid,
 pg_catalog.current_setting('application_name') as application_name,
 (session_user::text='${HOLDER}' and current_user=session_user and pg_catalog.current_setting('role')='none' and ${safeRole('r',true,true)}) as principal_safe,
 (pg_catalog.current_setting('transaction_isolation')='read committed' and not pg_catalog.pg_is_in_recovery()) as fresh_primary,
 (a.relkind='r' and not g.prosecdef and g.prokind='f' and g.prorettype='pg_catalog.trigger'::regtype and not g.proretset
 and (select lanname from pg_catalog.pg_language where oid=g.prolang)='plpgsql' and g.provolatile='v' and not g.proleakproof and not g.proisstrict
 and g.proconfig=array['search_path=""'] and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(g.prosrc,'UTF8')),'hex')=$1
 and q.rolname='${GUARD_OWNER}' and ${safeRole('q',false,true)}
 and exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=a.oid and t.tgfoid=g.oid and t.tgname='ouchi_auth_recreation_insert_fence' and t.tgtype=7 and t.tgattr::text='' and ${triggerCommon})
 and exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=a.oid and t.tgfoid=g.oid and t.tgname='ouchi_auth_recreation_id_update_fence' and t.tgtype=19 and t.tgattr::text=a.attnum::text and ${triggerCommon})
 and not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=a.oid and t.tgname not in('ouchi_auth_recreation_insert_fence','ouchi_auth_recreation_id_update_fence') and (t.tgtype::int&3)=3 and (t.tgtype::int&20)<>0)
 and not exists(select 1 from pg_catalog.pg_rewrite rw where rw.ev_class=a.oid)) as guard_safe,
 exists(select 1 from pg_catalog.pg_locks l where l.pid=pg_catalog.pg_backend_pid() and l.locktype='advisory' and l.mode='ExclusiveLock' and l.granted and l.objsubid=1 and l.classid=$2::oid and l.objid=$3::oid) as held_key,
 not exists(select 1 from pg_catalog.pg_locks l where l.pid=pg_catalog.pg_backend_pid() and l.locktype='advisory' and not(l.mode='ExclusiveLock' and l.granted and l.objsubid=1 and l.classid=$2::oid and l.objid=$3::oid)) as no_other_locks
 from a cross join g join pg_catalog.pg_roles q on q.oid=g.proowner cross join pg_catalog.pg_roles r where r.rolname=session_user`;
export const OUCHI_AUTH_EXCLUSION_CALLER_SQL=`${tableCTE}
 select pg_catalog.pg_backend_pid() as pid,pg_catalog.txid_current()::text as xid,
 (session_user::text='${CALLER}' and current_user=session_user and pg_catalog.current_setting('role')='none' and ${safeRole('r',true,false)}) as principal_safe,
 exists(select 1 from pg_catalog.pg_locks l join pg_catalog.pg_stat_activity s on s.pid=l.pid
 where l.pid=$1 and l.database=$2::oid and l.classid=$3::oid and l.objid=$4::oid and l.objsubid=1 and l.locktype='advisory' and l.mode='ExclusiveLock' and l.granted
 and s.application_name=$5 and s.usename='${HOLDER}' and s.datid=$2::oid) as same_held_session
 from a cross join pg_catalog.pg_roles r where r.rolname=session_user`;
export const OUCHI_AUTH_EXCLUSION_ROOT_SQL='select scope,user_id,status,lease_token,lease_until>pg_catalog.clock_timestamp() as lease_live,pg_catalog.pg_backend_pid() as pid,pg_catalog.txid_current()::text as xid from private.kb_shared_deletion_journal where request_id=$1 for update';

function connectionOptions(target){
 if(target?.kind==='isolated-fixture'&&Object.keys(target).sort().join(',')==='kind,socket'&&target.socket===process.env.OUCHI_SCOPED_TEST_PG_SOCKET&&/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/.test(target.socket))return {host:target.socket,ssl:false,password:randomBytes(32).toString('hex')};
 if(target?.kind==='supabase-direct'&&Object.keys(target).sort().join(',')==='ca,kind,password,projectRef'&&/^[a-z]{20}$/.test(target.projectRef)&&typeof target.password==='string'&&target.password.length>=16&&!/[\r\n]/.test(target.password)&&typeof target.ca==='string'&&target.ca.length<=131072&&target.ca.includes('-----BEGIN CERTIFICATE-----')&&target.ca.includes('-----END CERTIFICATE-----'))return {host:'db.'+target.projectRef+'.supabase.co',password:target.password,ssl:{rejectUnauthorized:true,ca:target.ca}};
 throw Error('Explicit direct-session PostgreSQL target required; pools and ambient credentials are forbidden');
}
const pinned=(v)=>Number.isSafeInteger(v?.pid)&&v.pid>0&&typeof v.xid==='string'&&/^[1-9][0-9]*$/.test(v.xid);
const samePin=(a,b)=>a.pid===b.pid&&a.xid===b.xid;
async function bounded(work,signal){
 signal.throwIfAborted();let stop;
 const cancelled=new Promise((_,reject)=>{stop=()=>reject(Error('Auth exclusion scope cancelled'));signal.addEventListener('abort',stop,{once:true});});
 try{return await Promise.race([Promise.resolve().then(work),cancelled]);}finally{signal.removeEventListener('abort',stop);}
}

/** Undeployed direct-session exclusion candidate. No pool, credential discovery,
 * Auth row/table lock, DDL/role provisioning, original issuer or deletion API.
 * A new physical least-privilege LOGIN holds ONLY the fixed actor session lock.
 * Work sees no holder query/client. Each binding pins one root-owned checked
 * transaction; use a new binding for a later COMMIT, never reuse a proof.
 * verifyRemainingPaths MUST independently exclude other Auth-table writes that
 * bypass FKs (replica/restore orphan sessions or identities), and verify app
 * reenrollment/old-JWT writers plus privileged guard DDL/trigger-disable through
 * COMMIT. Trigger/lock metadata alone does not prove those operational paths.
 * Known normal INSERT/UUID UPDATE paths are guarded even under replica/RR;
 * extra BEFORE triggers/rules, pools, role broadening or lock loss fail closed.
 */
export function createOuchiAuthRecreationExclusion({target,verifyRemainingPaths,maxHoldMs=30000}){
 const config=connectionOptions(target);
 if(typeof verifyRemainingPaths!=='function'||!Number.isInteger(maxHoldMs)||maxHoldMs<100||maxHoldMs>120000)throw Error('Independent remaining-path coverage and bounded hold required');
 return Object.freeze({async withScope(value,signal,work){
  const scope=normalizeSharedDeletionScope(value);
  if(!scope.apps.some(a=>a.app==='ouchi-maintenance'))throw Error('Ouchi-bound Auth exclusion scope required');
  if(!(signal instanceof AbortSignal)||typeof work!=='function')throw Error('Bounded Auth exclusion work required');
  signal.throwIfAborted();const lifetime=AbortSignal.any([signal,AbortSignal.timeout(maxHoldMs)]),key=ouchiAuthRecreationKey(scope.userID),unsigned=BigInt.asUintN(64,key),high=String(unsigned>>32n),low=String(unsigned&0xffffffffn),application='OuchiAuthExclusion/'+randomBytes(16).toString('hex');
  const connect=createDedicatedPostgresConnection({createClient:bounds=>createPostgresClient({...config,...bounds,user:HOLDER,database:'postgres',port:5432,application_name:application,options:'-c statement_timeout=2000 -c lock_timeout=1000',keepAlive:true})});
  const connection=await connect({signal:lifetime});let valid=true,acquired=false,ownerPin,busy=false,pending=0;const bindings=new WeakMap();
  async function holder(required){
   lifetime.throwIfAborted();if(!valid)throw Error('Auth exclusion scope refused');
   const rows=(await connection.query(OUCHI_AUTH_EXCLUSION_HOLDER_SQL,[OUCHI_AUTH_INSERT_GUARD_SHA256,high,low])).rows;
   lifetime.throwIfAborted();const r=rows[0];
   if(rows.length!==1||!Number.isSafeInteger(r?.pid)||r.pid<=0||!Number.isSafeInteger(r.database_oid)||r.database_oid<=0||r.application_name!==application||r.principal_safe!==true||r.guard_safe!==true||r.fresh_primary!==true||r.no_other_locks!==true||r.held_key!==required||(ownerPin&&(r.pid!==ownerPin.pid||r.database_oid!==ownerPin.database_oid)))throw Error('Exact current Auth guard, role and held session required');
   ownerPin??={pid:r.pid,database_oid:r.database_oid};return ownerPin;
  }
  async function root(tx){
   if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')throw Error('Checked root transaction required');
   tx.signal.throwIfAborted();lifetime.throwIfAborted();
   const rows=(await tx.query(OUCHI_AUTH_EXCLUSION_ROOT_SQL,[scope.requestID])).rows,r=rows[0];
   if(rows.length!==1||!pinned(r)||r.status!=='processing'||r.lease_live!==true||r.user_id!==scope.userID||r.lease_token!==scope.leaseToken||!sameScope({...r.scope,leaseToken:scope.leaseToken},scope))throw Error('Exact processing root required');return {pid:r.pid,xid:r.xid};
  }
  async function current(tx,pin){
   if(!valid||lifetime.aborted)return false;
   const first=await root(tx);if(!samePin(first,pin))return false;
   const h=await holder(true);
   const rows=(await tx.query(OUCHI_AUTH_EXCLUSION_CALLER_SQL,[h.pid,h.database_oid,high,low,application])).rows,r=rows[0];
   if(rows.length!==1||!pinned(r)||!samePin(r,pin)||r.pid===h.pid||r.principal_safe!==true||r.same_held_session!==true)return false;
   if(await verifyRemainingPaths(tx,scope,tx.signal)!==true)return false;
   tx.signal.throwIfAborted();await holder(true);return samePin(await root(tx),pin);
  }
  const held=Object.freeze({signal:lifetime,async bind(tx,value,checkSignal){
   if(busy||!valid)return null;busy=true;
   try{
    if(checkSignal!==tx?.signal||!sameScope(value,scope))throw Error('Foreign Auth exclusion scope');
    const prior=bindings.get(tx);if(prior){if(!await prior.verify(tx,value,checkSignal))throw Error('Lost Auth exclusion binding');return prior;}
    const pin=await root(tx);if(!await current(tx,pin))throw Error('Auth exclusion binding refused');
    const binding=Object.freeze({async verify(t,s,check){
     pending++;try{if(t!==tx||check!==tx.signal||!sameScope(s,scope)||!await current(tx,pin)){valid=false;return false;}return true;}catch{valid=false;return false;}finally{pending--;}
    }});bindings.set(tx,binding);return binding;
   }catch{valid=false;return null;}finally{busy=false;}
  }});
  try{
   await connection.query('set session characteristics as transaction isolation level read committed');
   await connection.query("set search_path=''");
   await holder(false);
   const rows=(await connection.query('select pg_catalog.pg_try_advisory_lock($1::bigint) as acquired',[String(key)])).rows;
   if(rows.length!==1||rows[0].acquired!==true)throw Error('Auth actor already excluded');acquired=true;
   await holder(true);
   const result=await bounded(()=>work(held),lifetime);
   if(busy||pending!==0)throw Error('Unfinished Auth exclusion binding');await holder(true);return result;
  }finally{
   let released=!acquired;
   if(acquired&&!lifetime.aborted&&valid){try{await holder(true);const r=await connection.query('select pg_catalog.pg_advisory_unlock($1::bigint) as released',[String(key)]);released=r.rows.length===1&&r.rows[0].released===true;}catch{/* Abnormal close releases this dedicated session, never unlock other sessions. */}}
   valid=false;await connection.close();
   if(acquired&&!released&&!lifetime.aborted)throw Error('Auth exclusion release unconfirmed; dedicated session closed');
  }
 }});
}
