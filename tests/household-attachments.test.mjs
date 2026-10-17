import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,home,product,os,rs,oe,re} from './fixtures/home-handoff-identifiers.mjs';
const modules=new Map();function compile(name){if(modules.has(name))return modules.get(name);let source=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;source=source.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(compile(dep)));const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;}
const {readHouseholdAttachmentResponse}=await import(compile('household-attachment-read-handler'));
const bytes=Buffer.from('%PDF-1.7\nSynthetic household file\n'),sha=createHash('sha256').update(bytes).digest('hex');
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016131437_ouchi_ownerless_home_management.sql','20261016151202_ouchi_household_attachment_custody.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 const instance=(await db.query('select instance_id from maintenance_private.closure_home_instances where home_id=$1',[home])).rows[0].instance_id,id=randomUUID();
 // Privileged synthetic active-copy metadata only; no real copy/activation proof.
 await db.query("insert into maintenance_private.household_attachments(id,home_id,home_instance_id,product_id,size_bytes,mime,sha256,state) values($1,$2,$3,$4,$5,'application/pdf',$6,'active')",[id,home,instance,product,bytes.length,sha]);
 const read=async(user=recipient,session=rs,epoch=re)=>(await db.query('select public.read_maintenance_household_attachment($1,$2,$3,$4) item',[user,session,epoch,id])).rows[0].item;
 return {db,instance,id,read};
}
test('household path contains no uploader account, remains readable through owner retirement and later member claim',async()=>{
 const {db,instance,id,read}=await fixture();try{
  await db.exec('set role service_role');let file=await read();assert.equal(file.objectPath,`households/${instance}/${id}.pdf`);assert.equal(JSON.stringify(file).includes(owner),false);assert.equal(JSON.stringify(file).includes(oe),false);
  await db.exec('reset role');await db.query('update public.homes set owner_id=null where id=$1',[home]);await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);await db.exec('set role service_role');assert.deepEqual(await read(),file);assert.equal(await read(owner,os,oe),null);
  await db.exec('reset role;update maintenance_private.ownerless_home_policy set enabled=true');const generation=(await db.query('select generation from maintenance_private.ownerless_home_generations where home_id=$1',[home])).rows[0].generation;await db.exec('set role service_role');await db.query('select maintenance_private.claim_ownerless_home($1,$2,$3,$4,$5,$6)',[randomUUID(),home,generation,recipient,rs,re]);assert.deepEqual(await read(),file);
 }finally{await db.close();}
});
test('only current household members and sessions can read; staging and removal revoke reads; ordinary and service roles cannot fabricate activation',async()=>{
 const {db,id,read}=await fixture();try{
  await db.exec('set role service_role');assert.equal(await read(recipient,os,re),null);assert.equal(await read(recipient,rs,oe),null);
  await assert.rejects(db.query("update maintenance_private.household_attachments set state='active'"),/permission denied/);await assert.rejects(db.query('delete from maintenance_private.household_attachments'),/permission denied/);
  await db.exec('reset role');await db.query('delete from public.home_members where user_id=$1',[recipient]);await db.exec('set role service_role');assert.equal(await read(),null);
  await db.exec('reset role');await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,recipient,'Synthetic returning member']);await db.query("update maintenance_private.household_attachments set state='staged' where id=$1",[id]);await db.exec('set role service_role');assert.equal(await read(),null);
  await db.exec('reset role');await db.query("update maintenance_private.household_attachments set state='active',removal_pending=true where id=$1",[id]);await db.exec('set role service_role');assert.equal(await read(),null);
  for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(read(),/permission denied/);}
 }finally{await db.close();}
});
test('custody pins product/home incarnation and prevents cascaded metadata loss or uncontrolled product moves',async()=>{
 const {db,instance,id}=await fixture();try{
  await assert.rejects(db.query('insert into maintenance_private.household_attachments(id,home_id,home_instance_id,product_id,size_bytes,mime,sha256) values($1,$2,$3,$4,12,$5,$6)',[randomUUID(),home,randomUUID(),product,'application/pdf',sha]),/incarnation required/);
  await assert.rejects(db.query('update maintenance_private.household_attachments set home_instance_id=$2 where id=$1',[id,randomUUID()]),/incarnation required/);
  await assert.rejects(db.query('delete from public.products where id=$1',[product]),/foreign key constraint/);
  const otherHome=randomUUID();await db.query('insert into public.homes(id,owner_id) values($1,$2)',[otherHome,owner]);await assert.rejects(db.query('update public.products set "homeId"=$2 where id=$1',[product,otherHome]),/custody must be reconciled/);
  assert.equal((await db.query('select home_instance_id from maintenance_private.household_attachments where id=$1',[id])).rows[0].home_instance_id,instance);
 }finally{await db.close();}
});
test('server reader verifies identity, scope and bytes then rechecks live access without requiring premium',async()=>{
 const {db,id}=await fixture();try{
  const token='e30.'+Buffer.from(JSON.stringify({sub:recipient,session_id:rs,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.c2ln';
  let reads=0,auth=0,downloads=0,withdraw=false;const client={auth:{getUser:async exact=>{assert.equal(exact,token);auth++;return {data:{user:{id:recipient}},error:null};}},rpc:async(name,args)=>{
   assert.equal(args.target_user,recipient);assert.equal(args.verified_session,rs);if(name==='read_maintenance_household_attachment'){reads++;if(withdraw&&reads>1)return {data:null};}
   const sql=name==='read_maintenance_explicit_enrollment'?'select public.read_maintenance_explicit_enrollment($1,$2) value':name==='page_maintenance_household_attachments'?'select public.page_maintenance_household_attachments($1,$2,$3,$4,$5) value':'select public.read_maintenance_household_attachment($1,$2,$3,$4) value';
   const values=name==='read_maintenance_explicit_enrollment'?[recipient,rs]:name==='page_maintenance_household_attachments'?[recipient,rs,re,product,null]:[recipient,rs,re,id];await db.exec('set role service_role');try{return {data:(await db.query(sql,values)).rows[0].value,error:null};}finally{await db.exec('reset role');}
  },storage:{from:bucket=>{assert.equal(bucket,'ouchi-product-attachments');return {download:async path=>{downloads++;assert.match(path,/^households\//);return {data:new Blob([bytes],{type:'application/pdf'}),error:null};}};}}};
  const request=()=>new Request('https://example.invalid/api/product-attachments?scope=household&attachmentId='+id,{headers:{authorization:'Bearer '+token}});
  const response=await readHouseholdAttachmentResponse(request(),client);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);assert.equal(auth,2);assert.equal(downloads,1);assert.equal(reads,2);
  withdraw=true;reads=0;assert.equal((await readHouseholdAttachmentResponse(request(),client)).status,404);
  const page=await readHouseholdAttachmentResponse(new Request('https://example.invalid/api/product-attachments?scope=household&productId='+product,{headers:{authorization:'Bearer '+token}}),client);assert.equal(page.status,200);assert.equal((await page.json()).items[0].scope,'household');
 }finally{await db.close();}
});
