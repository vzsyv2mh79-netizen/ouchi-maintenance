/** Real disposable GoTrue JWT -> SDK -> HTTP PostgREST -> actual RLS/RPCs.
 * Enrollment and review classifications are explicit privileged fixture input;
 * actual reviewed retirement is invoked through shipping private operator port.
 */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {createClosureReviewCoverage} from '../../lib/closure-review-coverage.mjs';
import {createReviewedRetirement} from '../../lib/reviewed-retirement.mjs';
import {expected,snapshot,retirementRpcCases} from './retirement-rpc-cases.mjs';
export async function verifyRetirementRpcHTTPServices({db,connect,authPort,fetcher,privilegeProfile='clean'}){
 assert.equal(process.env.OUCHI_RETIREMENT_RPC_HTTP_TEST,'true');const restPort=Number(process.env.OUCHI_TEST_REST_PORT);assert.ok(Number.isInteger(restPort)&&restPort>1024&&restPort<65536);
 assert.ok(['clean','observed-production-20261017'].includes(privilegeProfile));
 if(privilegeProfile==='clean')await db.query(readFileSync('supabase/migrations/20261016224912_ouchi_legacy_erasure_review_guard.sql','utf8'));
 else assert.equal((await db.query("select to_regprocedure('maintenance_private.require_legacy_maintenance_erasure_allowed()') is not null ready")).rows[0].ready,true,'full pinned candidate chain must already be loaded');
 const calls=[],rest='http://127.0.0.1:'+restPort;
 async function actor(){
  const response=await fetcher('http://127.0.0.1:'+authPort+'/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:randomUUID()+'@example.invalid',password:randomUUID()+'aA7!'})});assert.equal(response.ok,true);const v=await response.json(),s=JSON.parse(Buffer.from(v.access_token.split('.')[1],'base64url')).session_id,id=v.user.id,epoch=randomUUID();
  await db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[id,epoch]);await db.query('insert into maintenance_private.account_access values($1,true)',[id]);await db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[s,id,epoch]);
  const client=createClient(rest,'sb_publishable_synthetic_rpc_owned_fixture',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer '+v.access_token},fetch:async(input,init)=>{const url=new URL(String(input));assert.equal(url.origin,rest);assert.ok(url.pathname.startsWith('/rest/v1/rpc/')||['home_invites','home_members','homes','maintenance_backup_restores','maintenance_history','maintenance_imports','maintenance_push_subscriptions','maintenance_push_test_limits','maintenance_tasks','products'].some(t=>url.pathname==='/rest/v1/'+t));const r=await fetcher(rest+url.pathname.slice('/rest/v1'.length)+url.search,init);calls.push({method:url.pathname.split('/').at(-1),status:r.status,actor:id});return r;}}});return {id,session:s,epoch,client};
 }
 const family=await actor(),departing=await actor(),third=await actor(),home=randomUUID(),ownHome=randomUUID(),sharedProduct=randomUUID(),ownProduct=randomUUID(),sharedTask=randomUUID(),ownTask=randomUUID();
 for(const [h,u,p,t] of [[home,family.id,sharedProduct,sharedTask],[ownHome,departing.id,ownProduct,ownTask]]){
  await db.query('insert into public.homes(id,owner_id,name) values($1,$2,$3)',[h,u,'Synthetic RPC HTTP home']);await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[p,h,'air','Synthetic RPC HTTP product']);await db.query('insert into public.maintenance_tasks(id,"productId",name,kind,"intervalDays","nextDueAt","sourceKind") values($1,$2,$3,$4,30,current_date,$5)',[t,p,'Synthetic RPC HTTP task','掃除','ユーザー設定']);
 }
 await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,departing.id,'Synthetic prior member']);
 const invite=await family.client.rpc('create_home_invite',{home_id:home});assert.equal(invite.error,null);assert.equal(typeof invite.data,'string');
 const productTemplate=(await db.query('select to_jsonb(p) value from public.products p where id=$1',[sharedProduct])).rows[0].value,taskTemplate=(await db.query('select to_jsonb(t) value from public.maintenance_tasks t where id=$1',[sharedTask])).rows[0].value;
 let tableSeed=null;if(process.env.OUCHI_RETIREMENT_TABLE_HTTP_TEST==='true'){const {seedRetirementTableFixture}=await import('./retirement-table-http-services.mjs');tableSeed=await seedRetirementTableFixture({db,departing,family,third,home,ownHome,ownProduct,ownTask,productTemplate,taskTemplate});}
 await db.query('set role service_role');const reviewID=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[departing.id,departing.session,departing.epoch,randomUUID()])).rows[0].receipt.reviewRequestID;await db.query('reset role');
 const signal=new AbortController().signal,coverage=createClosureReviewCoverage({connect}),retirement=createReviewedRetirement({connect}),scope={planID:randomUUID(),reviewRequestID:reviewID,userID:departing.id,epochID:departing.epoch};
 await coverage.capture({...scope,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},signal);const page=await coverage.page({...scope,afterKey:null},signal);assert.equal(page.hasMore,false);for(const item of page.items)if(item.kind==='text')await coverage.recordTextDecision({...scope,itemKey:item.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION'},signal);
 const sealEventID=randomUUID();await coverage.seal({...scope,eventID:sealEventID,evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},signal);
 await retirement.execute({...scope,eventID:randomUUID(),sealEventID,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'},signal);
 const catalog=(await db.query("select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and has_function_privilege('authenticated',p.oid,'EXECUTE') order by signature")).rows.map(r=>r.signature);assert.deepEqual(catalog,expected);
 const cases=retirementRpcCases({home,ownHome,ownTask,productTemplate,taskTemplate,token:invite.data,other:third.id,thirdSession:third.session}),args=(c,v)=>Object.fromEntries(c.argumentNames.map((key,i)=>[key,v[i]]));
 const baseline=await snapshot(db);
 for(const c of cases){const result=await departing.client.rpc(c.method,args(c,c.closed));assert.ok(result.error,c.sig+' closed call must refuse');assert.deepEqual(await snapshot(db),baseline,c.sig+' cannot mutate any app/Auth table');}
 for(const c of cases){const before=c.activeDenied?await snapshot(db):null;const client=c.user===third.id?third.client:family.client,result=await client.rpc(c.method,args(c,c.active));if(c.activeDenied){assert.ok(result.error);assert.match(result.error.message,/Legacy maintenance erasure disabled/);assert.deepEqual(await snapshot(db),before);}else assert.equal(result.error,null,c.sig);}
 assert.equal((await db.query('select count(*)::int n from auth.sessions where id=any($1::uuid[])',[[family.session,departing.session,third.session]])).rows[0].n,3);
 assert.equal((await db.query('select count(*)::int n from public.home_members where "homeId"=$1 and user_id=$2',[home,departing.id])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from public.home_members where "homeId"=$1 and user_id=$2',[home,third.id])).rows[0].n,1);
 let directTableAudit=null;if(tableSeed){const {verifyRetirementTableHTTPServices}=await import('./retirement-table-http-services.mjs');directTableAudit=await verifyRetirementTableHTTPServices({db,seed:tableSeed,privilegeProfile});}
 return {directTableAudit,status:'passed',reviewedRPCs:expected,closedRefused:9,activeSucceeded:8,legacyDestructiveRefused:1,calls: calls.map(({method,status})=>({method,status})),allAppAuthSnapshotsUnchangedForClosedCalls:true,sourceSHA256:Object.fromEntries(['tests/fixtures/retirement-rpc-http-services.mjs','tests/fixtures/retirement-rpc-cases.mjs','supabase/migrations/20261016224912_ouchi_legacy_erasure_review_guard.sql'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),syntheticEnrollmentAndClassifications:true,actualReviewedRetirement:true,actualAuthJWTHTTPPostgREST:true,productionChanged:false};
}
