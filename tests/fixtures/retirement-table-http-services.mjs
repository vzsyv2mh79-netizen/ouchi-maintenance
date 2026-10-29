/** Explicit valid Data API writes for all ten exposed Ouchi tables. Table and
 * column grants are inventoried: push credentials have column-only grants.
 * This is an owned disposable fixture, not production or all service writers.
 */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {snapshot} from './retirement-rpc-cases.mjs';
export const tables=['home_invites','home_members','homes','maintenance_backup_restores','maintenance_history','maintenance_imports','maintenance_push_subscriptions','maintenance_push_test_limits','maintenance_tasks','products'];
export async function seedRetirementTableFixture({db,departing,family,third,home,ownHome,ownProduct,ownTask,productTemplate,taskTemplate}){
 const oldHistory=randomUUID(),oldInvite=randomUUID(),oldSubscription=randomUUID(),activeSubscription=randomUUID();
 await db.query('insert into public.maintenance_history(id,"taskId","productId","completedAt",note) values($1,$2,$3,current_date,$4)',[oldHistory,ownTask,ownProduct,'Synthetic retained history']);
 await db.query('insert into public.home_invites(id,"homeId",token_hash) values($1,$2,$3)',[oldInvite,ownHome,randomBytes(32)]);
 await db.query('insert into public.maintenance_imports("homeId",fingerprint) values($1,$2)',[ownHome,'7'.repeat(64)]);
 await db.query('insert into public.maintenance_backup_restores(owner_id,fingerprint,anchor_home) values($1,$2,$3)',[departing.id,'7'.repeat(64),ownHome]);
 for(const [id,user] of [[oldSubscription,departing.id],[activeSubscription,family.id]])await db.query('insert into public.maintenance_push_subscriptions(id,user_id,endpoint,p256dh,auth) values($1,$2,$3,$4,$5)',[id,user,'https://web.push.apple.com/'+id,'a'.repeat(87),'a'.repeat(22)]);
 await db.query('insert into public.maintenance_push_test_limits(user_id) values($1),($2)',[departing.id,family.id]);
 return {departing,family,third,home,ownHome,ownProduct,ownTask,productTemplate,taskTemplate,oldHistory,oldInvite,oldSubscription,activeSubscription};
}
export async function verifyRetirementTableHTTPServices({db,seed,privilegeProfile='clean'}){
 assert.ok(['clean','observed-production-20261017'].includes(privilegeProfile));
 const {departing,family,third,home,ownHome,ownProduct,ownTask,productTemplate,taskTemplate,oldHistory,oldInvite,oldSubscription,activeSubscription}=seed;
 const catalog=(await db.query("select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname")).rows;assert.deepEqual(catalog.map(r=>r.relname),tables);
 assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m','f')")).rows[0].n,0);
 const columnGrants=[];for(const t of catalog){
  assert.equal(t.relrowsecurity,true);
  const a=(await db.query("select a.attname,has_column_privilege('authenticated',$1::oid,a.attnum,'INSERT') i,has_column_privilege('authenticated',$1::oid,a.attnum,'UPDATE') u from pg_attribute a where a.attrelid=$1::oid and a.attnum>0 and not a.attisdropped order by a.attname",[t.oid])).rows;
  columnGrants.push({table:t.relname,insert:a.filter(c=>c.i).map(c=>c.attname),update:a.filter(c=>c.u).map(c=>c.attname)});
  for(const role of ['anon','authenticated'])for(const privilege of ['TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query('select has_table_privilege($1::name,$2::oid,$3::text) allowed',[role,t.oid,privilege])).rows[0].allowed,false);
 }
 const push=columnGrants.find(t=>t.table==='maintenance_push_subscriptions');assert.deepEqual(push.insert,['auth','endpoint','p256dh']);assert.deepEqual(push.update,['auth','endpoint','p256dh']);
 const activeHome=randomUUID(),activeProduct=randomUUID(),activeTask=randomUUID(),activeHistory=randomUUID(),activeInvite=randomUUID();
 const p=(id,h)=>({...productTemplate,id,homeId:h,name:'Synthetic direct API product'}),t=(id,pid)=>({...taskTemplate,id,productId:pid,name:'Synthetic direct API task',lastCompletedAt:null});
 const cases=[
  {table:'homes',closed:{insert:{id:randomUUID(),owner_id:departing.id,name:'Forbidden new home',kind:'home'},filter:{id:ownHome}},active:{insert:{id:activeHome,owner_id:family.id,name:'Synthetic direct home',kind:'home'},filter:{id:activeHome}},update:{name:'Synthetic direct update'}},
  {table:'products',closed:{insert:p(randomUUID(),ownHome),filter:{id:ownProduct}},active:{insert:p(activeProduct,activeHome),filter:{id:activeProduct}},update:{name:'Synthetic updated product'}},
  {table:'maintenance_tasks',closed:{insert:t(randomUUID(),ownProduct),filter:{id:ownTask}},active:{insert:t(activeTask,activeProduct),filter:{id:activeTask}},update:{name:'Synthetic updated task'}},
  {table:'maintenance_history',closed:{insert:{id:randomUUID(),taskId:ownTask,productId:ownProduct,completedAt:'2000-01-02',note:'Synthetic forbidden history'},filter:{id:oldHistory}},active:{insert:{id:activeHistory,taskId:activeTask,productId:activeProduct,completedAt:'2000-01-02',note:'Synthetic direct history'},filter:{id:activeHistory}},update:{note:'Synthetic updated note'}},
  {table:'home_members',closed:{insert:{homeId:ownHome,user_id:third.id,nickname:'Synthetic forbidden member'},filter:{homeId:home,user_id:third.id}},active:{insert:{homeId:activeHome,user_id:third.id,nickname:'Synthetic direct member'},filter:{homeId:activeHome,user_id:third.id}},update:{nickname:'Synthetic updated member'},denied:['update']},
  {table:'home_invites',closed:{insert:{id:randomUUID(),homeId:ownHome,token_hash:'\\x'+randomBytes(32).toString('hex')},filter:{id:oldInvite}},active:{insert:{id:activeInvite,homeId:activeHome,token_hash:'\\x'+randomBytes(32).toString('hex')},filter:{id:activeInvite}},update:{revoked:true}},
  {table:'maintenance_imports',closed:{insert:{homeId:ownHome,fingerprint:'8'.repeat(64)},filter:{homeId:ownHome,fingerprint:'7'.repeat(64)}},active:{insert:{homeId:activeHome,fingerprint:'8'.repeat(64)},filter:{homeId:activeHome,fingerprint:'8'.repeat(64)}},update:{fingerprint:'6'.repeat(64)},denied:['update','delete']},
  {table:'maintenance_backup_restores',closed:{insert:{owner_id:departing.id,fingerprint:'8'.repeat(64),anchor_home:ownHome},filter:{owner_id:departing.id,fingerprint:'7'.repeat(64)}},active:{insert:{owner_id:family.id,fingerprint:'8'.repeat(64),anchor_home:activeHome},filter:{owner_id:family.id,fingerprint:'8'.repeat(64)}},update:{fingerprint:'6'.repeat(64)},denied:['update','delete']},
  {table:'maintenance_push_subscriptions',closed:{insert:{endpoint:'https://web.push.apple.com/'+randomUUID(),p256dh:'b'.repeat(87),auth:'b'.repeat(22)},filter:{id:oldSubscription}},active:{insert:{endpoint:'https://web.push.apple.com/'+randomUUID(),p256dh:'b'.repeat(87),auth:'b'.repeat(22)},filter:{id:activeSubscription}},update:{auth:'c'.repeat(22)}},
  {table:'maintenance_push_test_limits',closed:{insert:{user_id:departing.id},filter:{user_id:departing.id}},active:{insert:{user_id:family.id},filter:{user_id:family.id}},update:{requested_at:'2000-01-02T00:00:00Z'},denied:['insert','update','delete']}
 ];
 assert.deepEqual(cases.map(c=>c.table).sort(),tables);
 const send=(client,c,mode,actor)=>{const value=c[actor];let q=client.from(c.table);if(mode==='insert')return q.insert(value.insert);q=mode==='update'?q.update(c.update):q.delete();for(const [key,v] of Object.entries(value.filter))q=q.eq(key,v);return q;};
 if(privilegeProfile==='observed-production-20261017'){
  for(const c of cases)if(['maintenance_imports','maintenance_backup_restores'].includes(c.table))c.denied=[];
  cases.find(c=>c.table==='home_members').rlsNoop=['update'];
 }
 const closed=[],active=[];const baseline=await snapshot(db);
 for(const mode of ['insert','update','delete'])for(const c of cases){const r=await send(departing.client,c,mode,'closed');assert.deepEqual(await snapshot(db),baseline,c.table+' '+mode+' must not mutate any app/Auth table');closed.push({table:c.table,mode,status:r.status,error:r.error?.code??null});}
 const deletionOrder=['maintenance_history','maintenance_tasks','products','home_invites','home_members','maintenance_imports','maintenance_backup_restores','maintenance_push_subscriptions','maintenance_push_test_limits','homes'];
 for(const mode of ['insert','update','delete'])for(const c of mode==='delete'?deletionOrder.map(table=>cases.find(c=>c.table===table)):cases){
  const before=await snapshot(db),r=await send(family.client,c,mode,'active'),after=await snapshot(db),denied=c.denied?.includes(mode)??false;
  if(c.rlsNoop?.includes(mode)){assert.equal(r.error,null);assert.deepEqual(after,before,'broader table UPDATE grant does not override missing member UPDATE RLS policy');}
  else if(denied){assert.ok(r.error,c.table+' '+mode+' must remain forbidden');assert.deepEqual(after,before);}else{assert.equal(r.error,null,c.table+' '+mode);assert.notDeepEqual(after,before,c.table+' '+mode+' must actually change intended fixture data');if(mode==='update'&&Object.hasOwn(c.active.filter,'fingerprint'))c.active.filter.fingerprint=c.update.fingerprint;}
  active.push({table:c.table,mode,status:r.status,denied,rlsNoop:c.rlsNoop?.includes(mode)??false});
 }
 return {status:'passed',tables,closedAttempts:closed,activeAttempts:active,privilegeProfile,closedUnchanged:30,activeChanged:active.filter(x=>!x.denied&&!x.rlsNoop).length,activePermissionRefused:active.filter(x=>x.denied&&!x.rlsNoop).length,activeRlsNoop:active.filter(x=>x.rlsNoop).length,allAppAuthSnapshotsUnchangedForClosedCalls:true,columnGrants,publicViewsOrForeignTables:0,sourceSHA256:Object.fromEntries(['tests/fixtures/retirement-table-http-services.mjs','tests/fixtures/retirement-rpc-cases.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),productionChanged:false};
}
