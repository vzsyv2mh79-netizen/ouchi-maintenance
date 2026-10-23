import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {createClosureReauthenticationProducer} from '../../lib/closure-reauth-producer.mjs';
export function disposableMarkedPasswordProducer({origin,options,createAttachmentFetch,transactions,loseReply=false,agents=[]}){
 assert.equal(origin,'http://127.0.0.1:54321');
 return createClosureReauthenticationProducer({transactions,clientForRequest:({agent,signal})=>{
  agents.push(agent);
  return createClient(origin,'synthetic-public-key',{...options,global:{headers:{'User-Agent':agent},fetch:async(input,init)=>{
   const target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
   const logout=target.origin===origin&&target.pathname==='/auth/v1/logout'&&target.search==='?scope=local';
   const response=await createAttachmentFetch(logout?AbortSignal.timeout(5000):signal,5000,65536)(input,init);
   if(loseReply&&target.pathname==='/auth/v1/token'&&target.search==='?grant_type=password'&&response.status===200){await response.arrayBuffer();throw Error('Synthetic accepted marked password response loss');}
   return response;
  }}});
 }});
}
export async function verifyDisposableMarkedPasswordProducer({db,actor,origin,options,createAttachmentFetch,transactions}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');
 const other=createClient(origin,'synthetic-public-key',{...options,global:{fetch:createAttachmentFetch(AbortSignal.timeout(10000),5000,65536)}});
 const login=await other.auth.signInWithPassword({email:actor.email,password:actor.password});assert.equal(login.error,null);
 const baseline=(await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows;
 const scope={userID:actor.user,sessionID:actor.session,epochID:actor.epoch,email:actor.email},agents=[];
 try{
  for(const loseReply of [false,true]){
   const producer=disposableMarkedPasswordProducer({origin,options,createAttachmentFetch,transactions,loseReply,agents});
   const result=await producer(actor.email,actor.password,AbortSignal.timeout(10000),scope);
   assert.equal(result,loseReply?null:actor.user);
   const agent=agents.at(-1),marker=agent.split('/').at(-1);
   assert.equal((await db.query('select count(*)::int n from auth.sessions where user_id=$1 and user_agent=$2',[actor.user,agent])).rows[0].n,0);
   assert.equal((await db.query('select closed_at is not null as closed from maintenance_private.closure_reauth_markers where marker_id=$1',[marker])).rows[0].closed,true);
   assert.deepEqual((await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows,baseline);
   await assert.rejects(db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[randomUUID(),actor.user,agent]),/agent closed/);
  }
  console.log('closure-review marked actual Auth producer: known and accepted-lost password replies leave no marked session; closed marker refuses late inserts; original and independent login retained');
 }finally{const {error}=await other.auth.signOut({scope:'local'});assert.equal(error,null);}
}
