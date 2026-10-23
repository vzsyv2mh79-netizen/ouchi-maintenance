import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {seedHomeHandoffFixture,owner,recipient,other,home,request,os,rs,oe,re} from './fixtures/home-handoff.mjs';

async function fixture(){
 const db=await seedHomeHandoffFixture(new PGlite());
 await db.exec('reset role');
 await db.exec(readFileSync('supabase/migrations/20261013043200_ouchi_family_handoff_read.sql','utf8'));
 await db.exec('update maintenance_private.home_handoff_policy set enabled=true; set role service_role');
 await db.query('select public.request_maintenance_home_handoff($1,$2,$3,$4,$5,$6)',[request,home,owner,os,oe,recipient]);
 return db;
}
const read=(db,user=owner,session=os,epoch=oe,id=request)=>db.query('select public.read_maintenance_home_handoff($1,$2,$3,$4) as value',[id,user,session,epoch]).then(r=>r.rows[0].value);
const decide=(db,accept)=>db.query('select public.decide_maintenance_home_handoff($1,$2,$3,$4,$5)',[request,recipient,rs,re,accept]);
async function change(db,sql,args=[]){await db.exec('reset role');await db.query(sql,args);await db.exec('set role service_role');}

test('handoff readback is read-only and requires exact party, registration, live session and enabled policy',async()=>{
 const db=await fixture();try{
  const before=(await db.query('select * from maintenance_private.home_handoffs')).rows;
  const pending=await read(db);assert.equal(pending.state,'pending');
  assert.deepEqual(await read(db,recipient,rs,re),pending);
  for(const args of [[other,os,oe],[owner,rs,oe],[owner,os,re],[recipient,rs,oe],[owner,os,oe,other]])assert.equal(await read(db,...args),null);
  assert.deepEqual((await db.query('select * from maintenance_private.home_handoffs')).rows,before);
  await db.exec('set role authenticated');await assert.rejects(read(db),/permission denied/);await db.exec('set role service_role');
  await change(db,'update auth.sessions set not_after=statement_timestamp()-interval \'1 minute\' where id=$1',[os]);assert.equal(await read(db),null);
  await change(db,'update maintenance_private.home_handoff_policy set enabled=false');assert.equal(await read(db,recipient,rs,re),null);
 }finally{await db.close();}
});

test('expired pending readback never extends its deadline, transfers ownership or persists a decision',async()=>{
 const db=await fixture();try{
  await change(db,"update maintenance_private.home_handoffs set created_at=statement_timestamp()-interval '2 days',expires_at=statement_timestamp()-interval '1 day'");
  const expired=await read(db);assert.equal(expired.state,'expired');assert.deepEqual(await read(db),expired);
  assert.equal((await db.query('select state,decided_at,expires_at=$1::timestamptz as unchanged from maintenance_private.home_handoffs',[expired.expiresAt])).rows[0].unchanged,true);
  assert.equal((await db.query('select state,decided_at from maintenance_private.home_handoffs')).rows[0].state,'pending');
  assert.equal((await db.query('select state,decided_at from maintenance_private.home_handoffs')).rows[0].decided_at,null);
  assert.equal((await db.query('select owner_id from public.homes')).rows[0].owner_id,owner);
 }finally{await db.close();}
});

test('completed and cancelled decisions can be recovered but changed ownership or closed registration cannot prove completion',async()=>{
 for(const accept of [true,false]){const db=await fixture();try{
  await decide(db,accept);assert.equal((await read(db)).state,accept?'completed':'cancelled');
  assert.deepEqual(await read(db,recipient,rs,re),await read(db));
  if(accept){await change(db,'update public.homes set owner_id=$1 where id=$2',[other,home]);assert.equal(await read(db),null);}
  else{await change(db,'update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);assert.equal(await read(db),null);}
 }finally{await db.close();}}
});
