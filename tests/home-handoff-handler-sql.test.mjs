import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {homeHandoffResponse,HomeHandoffRefusal} from '../lib/home-handoff-handler.mjs';
import {seedHomeHandoffFixture,owner,recipient,other,home,product,request,os,rs,oe,re} from './fixtures/home-handoff.mjs';
const origin='https://ouchi-maintenance.vercel.app';
const req=(method,token,epoch,body)=>new Request(origin+'/api/family/handoff/'+request,{method,headers:{authorization:'Bearer '+token,'X-Ouchi-App-Epoch':epoch,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
async function fixture(){
 const db=await seedHomeHandoffFixture(new PGlite());
 await db.exec('reset role');await db.exec(readFileSync('supabase/migrations/20261013043200_ouchi_family_handoff_read.sql','utf8'));await db.exec('update maintenance_private.home_handoff_policy set enabled=true;set role service_role');
 const value=async(fn,args)=>(await db.query('select public.'+fn+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as value',args)).rows[0].value;
 const config={origin,
  // Synthetic identity port, not actual GoTrue or current MFA verification.
  verifyCurrent:async token=>token==='owner'?{userID:owner,sessionID:os,epochID:oe}:token==='recipient'?{userID:recipient,sessionID:rs,epochID:re}:null,
  create:scope=>value('request_maintenance_home_handoff',[scope.requestID,scope.homeID,scope.userID,scope.sessionID,scope.epochID,scope.recipientID]),
  read:scope=>value('read_maintenance_home_handoff',[scope.requestID,scope.userID,scope.sessionID,scope.epochID]),
  decide:async scope=>{try{return await value('decide_maintenance_home_handoff',[scope.requestID,scope.userID,scope.sessionID,scope.epochID,scope.accept]);}catch(error){if(error.code==='P0001'&&error.message==='Attachment handoff required')throw new HomeHandoffRefusal('attachment_handoff_required');throw error;}},
 };
 return{db,config};
}

test('HTTP contract plus SQL: lost acceptance acknowledgement recovers the committed original request without recreating records',async()=>{
 const{db,config}=await fixture();try{
  const created=await homeHandoffResponse(req('POST','owner',oe,{homeID:home,recipientID:recipient}),config);assert.equal(created.status,200);const original=await created.json();assert.equal(original.state,'pending');
  const perform=config.decide;config.decide=async scope=>{await perform(scope);throw Error('Acknowledgement lost after SQL commit');};
  assert.equal((await homeHandoffResponse(req('PUT','recipient',re,{accept:true}),config)).status,503);
  const recovered=await homeHandoffResponse(req('GET','recipient',re),config);assert.equal(recovered.status,200);const done=await recovered.json();assert.equal(done.state,'completed');assert.equal(done.requestID,original.requestID);assert.equal(done.expiresAt,original.expiresAt);
  await db.exec('reset role');assert.equal((await db.query('select owner_id from public.homes')).rows[0].owner_id,recipient);
  assert.equal((await db.query('select count(*)::int as n from maintenance_private.home_handoffs')).rows[0].n,1);
  for(const table of ['products','maintenance_tasks','maintenance_history'])assert.equal((await db.query('select count(*)::int as n from public.'+table)).rows[0].n,1);
 }finally{await db.close();}
});

test('HTTP contract plus SQL: unresolved attachments refuse acceptance and preserve owner, family records and pending request',async()=>{
 const{db,config}=await fixture();try{
  assert.equal((await homeHandoffResponse(req('POST','owner',oe,{homeID:home,recipientID:recipient}),config)).status,200);
  await db.exec('reset role');await db.query('insert into maintenance_private.product_attachments values($1,$2,$3)',[other,product,'stored']);await db.exec('set role service_role');
  const refusal=await homeHandoffResponse(req('PUT','recipient',re,{accept:true}),config);assert.equal(refusal.status,409);assert.equal((await refusal.json()).code,'attachment_handoff_required');
  assert.equal((await homeHandoffResponse(req('GET','owner',oe),config)).status,200);
  await db.exec('reset role');assert.equal((await db.query('select owner_id from public.homes')).rows[0].owner_id,owner);assert.equal((await db.query('select state from maintenance_private.home_handoffs')).rows[0].state,'pending');
  for(const table of ['products','maintenance_tasks','maintenance_history','home_members'])assert.equal((await db.query('select count(*)::int as n from public.'+table)).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from maintenance_private.product_attachments')).rows[0].n,1);
 }finally{await db.close();}
});
