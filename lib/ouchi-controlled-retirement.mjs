import {createOperatingStateCheck,MAINTENANCE_KEY,STATE_SQL,PROTOCOL,REVISION} from './controlled-operating-state.mjs';
import {createOwningMaintenanceLock} from './controlled-owning-maintenance-lock.mjs';
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
const triggerCommon=`t.tgenabled='O' and not t.tgisinternal and t.tgnargs=0 and t.tgqual is null and t.tgparentid=0 and t.tgconstraint=0 and not t.tgdeferrable and not t.tginitdeferred`;
export const OUCHI_CONTROLLED_EXCLUSION_HOLDER_SQL=`${tableCTE}, g as(select p.* from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='maintenance_private' and p.proname='guard_ouchi_auth_recreation_identity' and p.pronargs=0)
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
 exists(select 1 from pg_catalog.pg_locks l where l.pid=pg_catalog.pg_backend_pid() and l.locktype='advisory' and l.mode='ShareLock' and l.granted and l.objsubid=1 and l.classid=$2::oid and l.objid=$3::oid) as held_key,
 not exists(select 1 from pg_catalog.pg_locks l where l.pid=pg_catalog.pg_backend_pid() and l.locktype='advisory' and not(l.mode='ShareLock' and l.granted and l.objsubid=1 and ((l.classid=$2::oid and l.objid=$3::oid) or (l.classid=((pg_catalog.hashtextextended($4,0)>>32)&4294967295)::oid and l.objid=(pg_catalog.hashtextextended($4,0)&4294967295)::oid)))) as no_other_locks
 from a cross join g join pg_catalog.pg_roles q on q.oid=g.proowner cross join pg_catalog.pg_roles r where r.rolname=session_user`;
export const OUCHI_CONTROLLED_EXCLUSION_CALLER_SQL=`${tableCTE}
 select pg_catalog.pg_backend_pid() as pid,pg_catalog.txid_current()::text as xid,
 (session_user::text='${CALLER}' and current_user=session_user and pg_catalog.current_setting('role')='none' and ${safeRole('r',true,false)}) as principal_safe,
 exists(select 1 from pg_catalog.pg_locks l join pg_catalog.pg_stat_activity s on s.pid=l.pid
 where l.pid=$1 and l.database=$2::oid and l.classid=$3::oid and l.objid=$4::oid and l.objsubid=1 and l.locktype='advisory' and l.mode='ShareLock' and l.granted
 and s.application_name=$5 and s.usename='${HOLDER}' and s.datid=$2::oid) as same_held_session,
 exists(select 1 from pg_catalog.pg_locks l where l.pid=pg_catalog.pg_backend_pid() and l.classid=$3::oid and l.objid=$4::oid and l.objsubid=1 and l.locktype='advisory' and l.mode='ShareLock' and l.granted) as caller_held_key
 from a cross join pg_catalog.pg_roles r where r.rolname=session_user`;
export const OUCHI_CONTROLLED_EXCLUSION_TERMINAL_ROOT_SQL='select private.kb_verify_generation_terminal_exclusion_root($1::uuid,$2::uuid,$3::jsonb) as verified,pg_catalog.pg_backend_pid() as pid,pg_catalog.txid_current()::text as xid';
export const OUCHI_CONTROLLED_EXCLUSION_ROOT_SQL='select scope,user_id,status,lease_token,lease_until>pg_catalog.clock_timestamp() as lease_live,pg_catalog.pg_backend_pid() as pid,pg_catalog.txid_current()::text as xid from private.kb_shared_deletion_journal where request_id=$1 for update';

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

/** Undeployed cooperative-boundary candidate. A-only provider is unchanged.
 * A direct dedicated session holds the global maintenance shared key and the
 * existing actor key. Ordinary origin writers are guarded; trusted operators
 * must stop/drain before maintenance. Arbitrary privileged/provider restore is
 * NOT excluded by this protocol. External epoch/manifest are mandatory.
 * This component does not adopt a new receipt domain or enable any core route.
 */
export function createOuchiControlledRetirement({target,verifyRemainingPaths,verifyRemainingTerminalPaths,epoch,manifest,expectedBoot,maxHoldMs=30000}){
 const config=connectionOptions(target);
 createOperatingStateCheck({epoch,manifest,expectedBoot}); // Validate externally pinned values before connecting.
 if(typeof verifyRemainingPaths!=='function'||typeof verifyRemainingTerminalPaths!=='function'||!Number.isInteger(maxHoldMs)||maxHoldMs<100||maxHoldMs>120000)throw Error('Independent remaining-path coverage and bounded hold required');
 return Object.freeze({async withScope(value,signal,work){
  const scope=normalizeSharedDeletionScope(value);
  if(!scope.apps.some(a=>a.app==='ouchi-maintenance'))throw Error('Ouchi-bound Auth exclusion scope required');
  if(!(signal instanceof AbortSignal)||typeof work!=='function')throw Error('Bounded Auth exclusion work required');
  signal.throwIfAborted();const lifetime=AbortSignal.any([signal,AbortSignal.timeout(maxHoldMs)]),key=ouchiAuthRecreationKey(scope.userID),unsigned=BigInt.asUintN(64,key),high=String(unsigned>>32n),low=String(unsigned&0xffffffffn),application='OuchiControlledRetirement/'+randomBytes(16).toString('hex');
  const deadline=performance.now()+maxHoldMs;
  const assertLifetime=()=>{lifetime.throwIfAborted();if(performance.now()>=deadline)throw Error('Controlled retirement hold deadline');};
  const connect=createDedicatedPostgresConnection({createClient:bounds=>createPostgresClient({...config,...bounds,user:HOLDER,database:'postgres',port:5432,application_name:application,options:'-c statement_timeout=2000 -c lock_timeout=1000',keepAlive:true})});
  const connection=await connect({signal:lifetime});let valid=true,acquired=false,ownerPin,busy=false,pending=0;const bindings=new WeakMap(),maintenance=createOwningMaintenanceLock({epoch,manifest,expectedBoot});
  async function holder(required){
   assertLifetime();if(!valid)throw Error('Auth exclusion scope refused');
   const rows=(await connection.query(OUCHI_CONTROLLED_EXCLUSION_HOLDER_SQL,[OUCHI_AUTH_INSERT_GUARD_SHA256,high,low,MAINTENANCE_KEY])).rows;
   assertLifetime();const r=rows[0];
   if(rows.length!==1||!Number.isSafeInteger(r?.pid)||r.pid<=0||!Number.isSafeInteger(r.database_oid)||r.database_oid<=0||r.application_name!==application||r.principal_safe!==true||r.guard_safe!==true||r.fresh_primary!==true||r.no_other_locks!==true||r.held_key!==required||(ownerPin&&(r.pid!==ownerPin.pid||r.database_oid!==ownerPin.database_oid)))throw Error('Exact current Auth guard, role and held session required');
   const state=(await connection.query(STATE_SQL,[])).rows;
   const op=state[0];
   if(state.length!==1||op.protocol!==PROTOCOL||op.revision!==REVISION||op.epoch!==epoch||op.verified_manifest!==manifest||op.boot!==expectedBoot||op.status!=='ready'||op.live!==true||op.primary!==true||op.replication_mode!=='origin'||op.isolation!=='read committed'||op.pid!==r.pid)throw Error('Current controlled operation required');
   const global=(await connection.query(`select exists(select 1 from pg_catalog.pg_locks where pid=pg_catalog.pg_backend_pid() and locktype='advisory' and mode='ShareLock' and granted and objsubid=1 and classid=((pg_catalog.hashtextextended($1,0)>>32)&4294967295)::oid and objid=(pg_catalog.hashtextextended($1,0)&4294967295)::oid) as held`,[MAINTENANCE_KEY])).rows;
   assertLifetime();if(global.length!==1||global[0].held!==true)throw Error('Independent maintenance holder lost');
   ownerPin??={pid:r.pid,database_oid:r.database_oid};return ownerPin;
  }
  async function root(tx,terminal=false){
   if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')throw Error('Checked root transaction required');
   tx.signal.throwIfAborted();assertLifetime();
   const rows=(await tx.query(OUCHI_CONTROLLED_EXCLUSION_ROOT_SQL,[scope.requestID])).rows,r=rows[0];
   if(rows.length!==1||!pinned(r)||r.user_id!==scope.userID||!sameScope({...r.scope,leaseToken:scope.leaseToken},scope))throw Error('Exact processing root required');
   if(r.status==='processing'&&r.lease_live===true&&r.lease_token===scope.leaseToken)return {pid:r.pid,xid:r.xid};
   if(terminal&&r.status==='complete'&&r.lease_token===null){
    const proof=(await tx.query(OUCHI_CONTROLLED_EXCLUSION_TERMINAL_ROOT_SQL,[scope.requestID,scope.leaseToken,JSON.stringify(scope)])).rows;
    if(proof.length===1&&proof[0].verified===true&&pinned(proof[0])&&samePin(proof[0],r))return {pid:r.pid,xid:r.xid};
   }
   throw Error('Exact processing or separately verified terminal root required');
  }
  async function current(tx,pin,terminal=false){
   if(!valid||lifetime.aborted)return false;
   const first=await root(tx,terminal);if(!samePin(first,pin))return false;
   if(!await maintenance.bind(tx))return false;
   const h=await holder(true);
   const rows=(await tx.query(OUCHI_CONTROLLED_EXCLUSION_CALLER_SQL,[h.pid,h.database_oid,high,low,application])).rows,r=rows[0];
   if(rows.length!==1||!pinned(r)||!samePin(r,pin)||r.pid===h.pid||r.principal_safe!==true||r.same_held_session!==true||r.caller_held_key!==true)return false;
   if(await (terminal?verifyRemainingTerminalPaths:verifyRemainingPaths)(tx,scope,tx.signal)!==true)return false;
   tx.signal.throwIfAborted();await holder(true);return samePin(await root(tx,terminal),pin);
  }
  const terminalBindings=new WeakMap(),commitChecks=new WeakMap();
  async function bindMode(tx,value,checkSignal,terminal=false){
   const map=terminal?terminalBindings:bindings;
   if(busy||!valid)return null;busy=true;
   try{
    if(checkSignal!==tx?.signal||!sameScope(value,scope))throw Error('Foreign Auth exclusion scope');
    const prior=map.get(tx);if(prior){if(!await prior.verify(tx,value,checkSignal))throw Error('Lost Auth exclusion binding');return prior;}
    const pin=await root(tx,terminal);await holder(true);
    const lock=(await tx.query('select pg_catalog.pg_try_advisory_xact_lock_shared($1::bigint) as acquired',[String(key)])).rows;
    if(lock.length!==1||lock[0].acquired!==true)throw Error('Owning transaction Auth exclusion lock refused');
    if(!await current(tx,pin,terminal))throw Error('Auth exclusion binding refused');
    const binding=Object.freeze({operation,async verify(t,s,check){
     pending++;try{if(t!==tx||check!==tx.signal||!sameScope(s,scope)||!await current(tx,pin,terminal)){valid=false;return false;}return true;}catch{valid=false;return false;}finally{pending--;}
    }});map.set(tx,binding);
    let final=commitChecks.get(tx);
    if(!final){
     final={pin,terminal};commitChecks.set(tx,final);
     tx.beforeCommit('controlled-auth:'+scope.requestID,async()=>{
      try{if(!await current(tx,final.pin,final.terminal)){valid=false;return false;}return true;}catch{valid=false;return false;}
     });
    }else if(terminal){final.terminal=true;}
    return binding;
   }catch{valid=false;return null;}finally{busy=false;}
  }
  // Data-only provenance for the fresh-generation issuer; not a receipt or authority.
  const operation=Object.freeze({protocol:PROTOCOL,revision:REVISION,epoch,manifest,boot:expectedBoot});
  const held=Object.freeze({operation,signal:lifetime,bind:(tx,value,checkSignal)=>bindMode(tx,value,checkSignal),bindTerminal:(tx,value,checkSignal)=>bindMode(tx,value,checkSignal,true)});
  let workFailed=false,workError;
  try{
   await connection.query('set session characteristics as transaction isolation level read committed');
   await connection.query("set search_path=''");
   const global=(await connection.query('select pg_catalog.pg_try_advisory_lock_shared(pg_catalog.hashtextextended($1,0)) as acquired',[MAINTENANCE_KEY])).rows;
   if(global.length!==1||global[0].acquired!==true)throw Error('Maintenance window unavailable');
   await holder(false);
   const rows=(await connection.query('select pg_catalog.pg_try_advisory_lock($1::bigint) as acquired',[String(key)])).rows;
   if(rows.length!==1||rows[0].acquired!==true)throw Error('Auth actor already excluded');acquired=true;
   // Downgrade without a gap: shared is acquired while exclusive is still held.
   const shared=(await connection.query('select pg_catalog.pg_try_advisory_lock_shared($1::bigint) as acquired',[String(key)])).rows;
   if(shared.length!==1||shared[0].acquired!==true)throw Error('Auth shared session hold refused');
   const downgraded=(await connection.query('select pg_catalog.pg_advisory_unlock($1::bigint) as released',[String(key)])).rows;
   if(downgraded.length!==1||downgraded[0].released!==true)throw Error('Auth exclusive hold downgrade refused');
   await holder(true);
   const result=await bounded(()=>work(held),lifetime);
   if(busy||pending!==0)throw Error('Unfinished Auth exclusion binding');await holder(true);return result;
  }catch(error){workFailed=true;workError=error;throw error;}finally{
   let released=!acquired;
   if(acquired&&!lifetime.aborted&&valid){try{await holder(true);const r=await connection.query('select pg_catalog.pg_advisory_unlock_shared($1::bigint) as released',[String(key)]);released=r.rows.length===1&&r.rows[0].released===true;}catch{/* Abnormal close releases this dedicated session, never unlock other sessions. */}}
   valid=false;let cleanupError;
   try{await connection.close();}catch(error){cleanupError=error;}
   if(!cleanupError&&acquired&&!released&&!lifetime.aborted)cleanupError=Error('Auth exclusion release unconfirmed; dedicated session closed');
   // Retain the original rejection (including an uncertain COMMIT) when
   // closing also fails. Neither error establishes transaction rollback.
   if(cleanupError){
    if(workFailed)throw new AggregateError([workError,cleanupError],'Controlled retirement work and cleanup failed',{cause:workError});
    throw cleanupError;
   }
  }
 }});
}
