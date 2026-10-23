// Actual PostgreSQL lock/ACL witness, deliberately minimal schema. Full app
// schema/family semantics are separately exercised by the PGlite test.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {randomUUID,createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import {Client} from 'pg';
assert.equal(process.env.OUCHI_LEGACY_GUARD_TEST,'true','Explicit disposable test opt-in required');
const arg=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:undefined;
const docker=arg('--docker'),socket=arg('--socket'),output=arg('--output');
assert.ok(docker?.endsWith('/output/test-tools-20261015/bin/docker'));assert.equal(socket,'unix:///private/tmp/ouchi-lima-20261015/ouchi-paired/sock/docker.sock');assert.ok(output);
const name='ouchi-legacy-guard-'+randomUUID().slice(0,8),label='ouchi-legacy-guard-20261017',connections=[];
const run=(...args)=>{const r=spawnSync(docker,['--host',socket,...args],{encoding:'utf8',timeout:15000});if(r.status!==0)throw Error('Owned Docker operation failed: '+r.stderr);return r.stdout.trim();};
const migration=readFileSync('supabase/migrations/20261016224912_ouchi_legacy_erasure_review_guard.sql','utf8');
const config={host:'127.0.0.1',port:54329,database:'guard_test',user:'postgres',password:'synthetic-guard-only',connectionTimeoutMillis:1000,query_timeout:8000};
const actorID='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',home='33333333-3333-4333-8333-333333333333';
let created=false,result={status:'not_completed',minimalSchema:true,productionChanged:false,actualAuthHTTP:false,realBillingEnabled:false,ownedContainerRemoved:false,checks:[]};
async function connect(options=config){const c=new Client(options);await c.connect();connections.push(c);return c;}
async function waitLock(monitor,pid){const deadline=Date.now()+5000;while(Date.now()<deadline){const row=(await monitor.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0];if(row?.wait_event_type==='Lock')return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Expected specific backend to wait on policy lock');}
try{
 run('run','--detach','--rm','--pull=never','--name',name,'--label','ouchi.test='+label,'--publish','127.0.0.1:54329:5432','--env','POSTGRES_DB=guard_test','--env','POSTGRES_PASSWORD=synthetic-guard-only','postgres:17.6-alpine');created=true;
 let admin;
 for(let i=0;i<80;i++){try{admin=await connect();break;}catch{await new Promise(resolve=>setTimeout(resolve,250));}}assert.ok(admin,'Owned PostgreSQL did not start');
 await admin.query(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create role ouchi_guard_actor login noinherit password 'synthetic-actor-only';grant authenticated to ouchi_guard_actor;
 create schema auth;create schema maintenance_private;
 create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table maintenance_private.account_closure_review_policy(id integer primary key,enabled boolean not null);insert into maintenance_private.account_closure_review_policy values(1,false);alter table maintenance_private.account_closure_review_policy enable row level security;revoke all on maintenance_private.account_closure_review_policy from public,anon,authenticated,service_role;
 create table maintenance_private.reviewed_retirement_policy(id integer primary key,enabled boolean not null);insert into maintenance_private.reviewed_retirement_policy values(1,false);
 alter table maintenance_private.reviewed_retirement_policy enable row level security;revoke all on maintenance_private.reviewed_retirement_policy from public,anon,authenticated,service_role;
 create table public.homes(id uuid primary key,owner_id uuid references auth.users);
 create table public.home_members("homeId" uuid references public.homes on delete cascade,user_id uuid references auth.users);
 create table public.maintenance_push_subscriptions(user_id uuid references auth.users,endpoint text);
 create table public.products(id uuid primary key,"homeId" uuid references public.homes on delete cascade,name text);
 create table public.unrelated_app_sentinel(value text);insert into public.unrelated_app_sentinel values('Unrelated synthetic app bytes');
 alter table public.homes enable row level security;alter table public.home_members enable row level security;alter table public.maintenance_push_subscriptions enable row level security;
 grant usage on schema public,auth,maintenance_private to authenticated;grant execute on function auth.uid() to authenticated;
 grant select,delete on public.homes,public.home_members,public.maintenance_push_subscriptions to authenticated;
 create policy own_homes on public.homes to authenticated using(owner_id=auth.uid());
 create policy own_members on public.home_members to authenticated using(user_id=auth.uid());
 create policy own_push on public.maintenance_push_subscriptions to authenticated using(user_id=auth.uid());`);
 await admin.query('insert into auth.users values($1),($2)',[actorID,other]);await admin.query('insert into auth.sessions values($1,$2),($3,$4)',[randomUUID(),actorID,randomUUID(),other]);await admin.query('insert into public.homes values($1,$2)',[home,actorID]);await admin.query('insert into public.home_members values($1,$2)',[home,other]);await admin.query('insert into public.products values($1,$2,$3)',[randomUUID(),home,'Shared synthetic record']);await admin.query('insert into public.maintenance_push_subscriptions values($1,$2)',[actorID,'synthetic endpoint']);
 await admin.query(migration);
 const snapshot=async()=>{const out={};for(const table of ['auth.users','auth.sessions','public.homes','public.home_members','public.products','public.maintenance_push_subscriptions','public.unrelated_app_sentinel'])out[table]=(await admin.query('select to_jsonb(t) data from '+table+' t order by to_jsonb(t)::text')).rows;return out;};const before=await snapshot();
 const actor=await connect({...config,user:'ouchi_guard_actor',password:'synthetic-actor-only'}),activation=await connect(),monitor=await connect();
 await actor.query('set role authenticated');await actor.query("select set_config('request.jwt.claim.sub',$1,false)",[actorID]);
 const actorPID=(await actor.query('select pg_backend_pid() pid')).rows[0].pid,activationPID=(await activation.query('select pg_backend_pid() pid')).rows[0].pid;
 for(const policy of ['account_closure_review_policy','reviewed_retirement_policy']){
  // These policy names are a fixed local allowlist, never caller/HTTP input.
  await admin.query('update maintenance_private.account_closure_review_policy set enabled=false');await admin.query('update maintenance_private.reviewed_retirement_policy set enabled=false');
  // Legacy first: shared policy locks last through its complete transaction.
  await actor.query('begin');await actor.query('select public.erase_maintenance_data()');assert.equal((await actor.query('select count(*)::int n from public.homes')).rows[0].n,0);
  await activation.query('begin');const enabling=activation.query('update maintenance_private.'+policy+' set enabled=true where id=1');await waitLock(monitor,activationPID);await actor.query('rollback');await enabling;await activation.query('commit');assert.deepEqual(await snapshot(),before);await assert.rejects(actor.query('select public.erase_maintenance_data()'),/Legacy maintenance erasure disabled/);
  result.checks.push('Actual PostgreSQL: legacy transaction blocks activation of '+policy+' until rollback; next call refuses deletion');
  // Activation first: waiting legacy caller rechecks the committed true row.
  await admin.query('update maintenance_private.'+policy+' set enabled=false');await activation.query('begin');await activation.query('update maintenance_private.'+policy+' set enabled=true');await actor.query('begin');const pending=actor.query('select public.erase_maintenance_data()').then(()=>({ok:true}),e=>({ok:false,message:e.message}));await waitLock(monitor,actorPID);await activation.query('commit');const rejected=await pending;assert.equal(rejected.ok,false);assert.match(rejected.message,/Legacy maintenance erasure disabled/);await actor.query('rollback');assert.deepEqual(await snapshot(),before);
  result.checks.push('Actual PostgreSQL: activation of '+policy+' blocks legacy call, which refuses after commit without deleting any records');
 }
 for(const role of ['anon','authenticated','service_role'])assert.equal((await admin.query("select has_function_privilege($1,'maintenance_private.require_legacy_maintenance_erasure_allowed()','execute') allowed",[role])).rows[0].allowed,role==='authenticated');
 await assert.rejects(actor.query('update maintenance_private.reviewed_retirement_policy set enabled=false'),/permission denied/);await assert.rejects(actor.query('set role postgres'),/permission denied/);await assert.rejects(actor.query('delete from auth.users'),/permission denied/);
 assert.equal((await admin.query("select prosecdef from pg_proc where oid='public.erase_maintenance_data()'::regprocedure")).rows[0].prosecdef,false);assert.deepEqual(await snapshot(),before);
 result.checks.push('Dedicated non-superuser login: cannot alter policy, become postgres or erase shared Auth; private helper privileges narrow; public DELETEs remain SECURITY INVOKER; original shared records and unrelated app sentinel unchanged');
 result={...result,status:'passed',postgresVersion:(await admin.query('show server_version')).rows[0].server_version,migrationSHA256:createHash('sha256').update(migration).digest('hex')};
}catch(error){result={...result,status:'failed',error:String(error)};throw error;}
finally{
 await Promise.allSettled(connections.map(c=>c.end()));
 if(created){assert.equal(run('inspect','--format','{{index .Config.Labels "ouchi.test"}}',name),label);run('rm','--force','--volumes',name);result.ownedContainerRemoved=true;}
 writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
