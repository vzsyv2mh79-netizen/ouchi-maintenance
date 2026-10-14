import assert from 'node:assert/strict';
import {createServer,request as proxyRequest} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {Client} from 'pg';
assert.equal(process.env.OUCHI_UPGRADE_PRESERVATION_TEST,'true','Disposable upgrade opt-in required');
const mode=process.argv[2];assert.ok(['seed','verify'].includes(mode));
const stateFile='/tmp/ouchi-maintenance-upgrade-fixture.json',origin='http://127.0.0.1:54321';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const gateway=createServer((req,res)=>{
 const auth=req.url?.startsWith('/auth/v1/'),rest=req.url?.startsWith('/rest/v1/');
 if(!auth&&!rest){res.writeHead(404).end();return;}
 const upstream=proxyRequest((auth?'http://127.0.0.1:9999':'http://127.0.0.1:3002')+req.url.slice(8),{method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res);});
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
});
const db=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:5000});
const snapshot=async()=>{
 const rows={};
 for(const table of ['public.homes','public.home_members','public.products','public.maintenance_tasks','public.maintenance_history','auth.users','auth.sessions','auth.refresh_tokens','other_app_upgrade_fixture.records'])rows[table]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as value from ${table} t`)).rows[0].value;
 // Fixture state stores a digest, never copies a real project/customer dataset.
 return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
};
await db.connect();await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(54321,'127.0.0.1',resolve);});
try{
 if(mode==='seed'){
  assert.equal((await db.query("select to_regclass('maintenance_private.app_epochs') as value")).rows[0].value,null,'Seed must precede new identity migrations');
  const actors=[];
  for(let index=0;index<3;index++){
   const client=createClient(origin,'synthetic-public-key',options),result=await client.auth.signUp({email:'upgrade-'+randomUUID()+'@example.invalid',password:'Synthetic-'+randomUUID()+'aA1!'});
   assert.equal(result.error,null);assert.ok(result.data.session);actors.push({id:result.data.user.id,token:result.data.session.access_token,refresh:result.data.session.refresh_token});
  }
  const [owner,member,other]=actors,home=randomUUID(),foreignHome=randomUUID(),product=randomUUID(),foreignProduct=randomUUID(),task=randomUUID();
  await db.query("insert into public.homes(id,owner_id,name) values($1,$2,'Synthetic legacy home'),($3,$4,'Synthetic foreign home')",[home,owner.id,foreignHome,other.id]);
  await db.query("insert into public.home_members(\"homeId\",user_id,nickname) values($1,$2,'Synthetic legacy member')",[home,member.id]);
  await db.query("insert into public.products(id,\"homeId\",\"categoryId\",name) values($1,$2,'air','Synthetic legacy product'),($3,$4,'air','Synthetic foreign product')",[product,home,foreignProduct,foreignHome]);
  await db.query("insert into public.maintenance_tasks(id,\"productId\",name,kind,\"intervalDays\",\"nextDueAt\",\"sourceKind\") values($1,$2,'Synthetic legacy care','掃除',30,current_date,'ユーザー設定')",[task,product]);
  await db.query('insert into public.maintenance_history("taskId","productId","completedAt") values($1,$2,current_date)',[task,product]);
  await db.query(`create schema other_app_upgrade_fixture;create table other_app_upgrade_fixture.records(id uuid primary key,user_id uuid not null,payload text not null);alter table other_app_upgrade_fixture.records enable row level security;
   grant usage on schema other_app_upgrade_fixture to authenticated;grant select on other_app_upgrade_fixture.records to authenticated;
   create policy own_record on other_app_upgrade_fixture.records for select to authenticated using(user_id=auth.uid());`);
  await db.query("insert into other_app_upgrade_fixture.records values($1,$2,'Synthetic independent-app row')",[foreignProduct,other.id]);
  writeFileSync(stateFile,JSON.stringify({actors,home,foreignHome,product,foreignProduct,task,before:await snapshot()}),{flag:'wx',mode:0o600});
  console.log('legacy upgrade fixture seeded actual Auth sessions and family records before additive migrations; synthetic local state only');
 }else{
  const state=JSON.parse(readFileSync(stateFile,'utf8'));assert.equal(await snapshot(),state.before,'Applying pending migrations must preserve existing rows');
  for(const table of ['account_access','app_epochs','app_session_epochs','account_deletion_requests','verified_transactions'])assert.equal((await db.query(`select count(*)::int n from maintenance_private.${table}`)).rows[0].n,0);
  assert.equal((await db.query('select require_explicit from maintenance_private.enrollment_policy where id=1')).rows[0].require_explicit,false);
  assert.equal((await db.query('select enabled from maintenance_private.home_handoff_policy where id=1')).rows[0].enabled,false);
  for(let index=0;index<state.actors.length;index++){
   const actor=state.actors[index],client=createClient(origin,'synthetic-public-key',{...options,global:{headers:{authorization:'Bearer '+actor.token}}});
   const identity=await client.auth.getUser(actor.token);assert.equal(identity.error,null);assert.equal(identity.data.user.id,actor.id);
   const renewed=await client.auth.refreshSession({refresh_token:actor.refresh});assert.equal(renewed.error,null);assert.equal(renewed.data.user.id,actor.id);assert.ok(renewed.data.session);
   const renewedClient=createClient(origin,'synthetic-public-key',{...options,global:{headers:{authorization:'Bearer '+renewed.data.session.access_token}}});
   const renewedProducts=await renewedClient.from('products').select('id').order('id');assert.equal(renewedProducts.error,null);assert.deepEqual(renewedProducts.data,[{id:index===2?state.foreignProduct:state.product}]);
   const products=await client.from('products').select('id').order('id');assert.equal(products.error,null);assert.deepEqual(products.data,[{id:index===2?state.foreignProduct:state.product}]);
   if(index<2){for(const table of ['maintenance_tasks','maintenance_history']){const records=await client.from(table).select('id');assert.equal(records.error,null);assert.equal(records.data.length,1);}}
   if(index===1){const edited=await client.from('products').update({memo:'Synthetic legacy member edit'}).eq('id',state.product).select('id');assert.equal(edited.error,null);assert.equal(edited.data.length,1);}
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:identity.data.user.id})]);await db.query('set role authenticated');
   try{const foreign=await db.query('select payload from other_app_upgrade_fixture.records');assert.deepEqual(foreign.rows,index===2?[{payload:'Synthetic independent-app row'}]:[]);}finally{await db.query('reset role');}
  }
  assert.equal((await db.query('select count(*)::int n from maintenance_private.app_epochs')).rows[0].n,0,'ordinary free reads/edits must not create enrollment');
  console.log('actual legacy upgrade preservation: pre-existing real Auth sessions/refresh tokens, homes/products/tasks/history and independent-app row digest unchanged after additive SQL; original bearers and refresh keep free owner/member access and isolated foreign access, member editing works, no implicit enrollment/jobs/premium; gates remain disabled');
  unlinkSync(stateFile);
 }
}finally{gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));await db.end();}
