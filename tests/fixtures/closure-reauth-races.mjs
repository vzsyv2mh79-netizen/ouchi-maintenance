import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createClosureReauthenticationProducer,REAUTH_REGISTER_SQL,REAUTH_CLOSE_SQL} from '../../lib/closure-reauth-producer.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function within(work,ms,message){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]);}finally{clearTimeout(timer);}}
async function until(read,message){const deadline=Date.now()+3000;while(Date.now()<deadline){if(await read())return;await pause(20);}throw Error(message);}
export async function verifyDisposableClosureReauthRaces({db,actor,origin,options,createAttachmentFetch,transactions,applicationName}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 const baseline=(await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows;
 const marker=randomUUID(),agent='OuchiMaintenance/closure-reauth/v1/'+marker,args=[actor.user,actor.session,actor.epoch,marker];
 await transactions.run(AbortSignal.timeout(10000),tx=>tx.query(REAUTH_REGISTER_SQL,args));
 let release,entered;const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const closing=transactions.run(AbortSignal.timeout(10000),async tx=>{await tx.query(REAUTH_CLOSE_SQL,args);entered();await gate;});
 const closeOutcome=closing.then(()=>({ok:true}),error=>({ok:false,error}));
 let signOutcome;
 try{
 await within(Promise.race([ready,closeOutcome.then(result=>{throw result.error??Error('Cleanup transaction ended before observation');})]),5000,'Cleanup transaction never reached held COMMIT');
 const client=createClient(origin,'synthetic-public-key',{...options,global:{headers:{'User-Agent':agent},fetch:createAttachmentFetch(AbortSignal.timeout(10000),5000,65536)}});
 const signing=client.auth.signInWithPassword({email:actor.email,password:actor.password});signOutcome=signing.then(value=>({value}),error=>({error}));
  await until(async()=>{
   const result=await db.query(`select exists(select 1 from pg_stat_activity w where w.wait_event_type='Lock'
    and exists(select 1 from pg_stat_activity h where h.application_name=$1 and h.state='idle in transaction'
    and h.query like '%closure_reauth_close%' and h.pid=any(pg_blocking_pids(w.pid)))) as blocked`,[applicationName]);
   return result.rows[0].blocked===true;
  },'Actual GoTrue session INSERT must wait behind uncommitted marker cleanup');
 }finally{release();await closeOutcome;if(signOutcome)await signOutcome;}
 const closed=await closeOutcome;assert.equal(closed.ok,true);const signed=await signOutcome;
 assert.ok(signed.error||signed.value.error);assert.equal(signed.value?.data.session??null,null);
 assert.equal((await db.query('select count(*)::int n from auth.sessions where user_id=$1 and user_agent=$2',[actor.user,agent])).rows[0].n,0);
 assert.deepEqual((await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows,baseline);

 // The reverse ordering: Auth commits, but its successful body has not reached
 // the SDK. Caller cancellation must independently close the owned marker.
 const controller=new AbortController();let accepted;const acceptedReady=new Promise(resolve=>{accepted=resolve;});let abortedAgent;
 const producer=createClosureReauthenticationProducer({transactions,clientForRequest:({agent,signal})=>{
  abortedAgent=agent;
  return createClient(origin,'synthetic-public-key',{...options,global:{headers:{'User-Agent':agent},fetch:async(input,init)=>{
   const target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),logout=target.pathname==='/auth/v1/logout';
   const response=await createAttachmentFetch(logout?AbortSignal.timeout(5000):signal,5000,65536)(input,init);
   if(target.pathname==='/auth/v1/token'&&target.search==='?grant_type=password'&&response.status===200){
    await response.arrayBuffer();accepted();
    await new Promise((resolve,reject)=>{const stop=()=>reject(signal.reason);if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true});});
   }
   return response;
  }}});
 }});
 const operation=producer(actor.email,actor.password,controller.signal,{userID:actor.user,sessionID:actor.session,epochID:actor.epoch,email:actor.email});
 const outcome=operation.then(value=>({value}),error=>({error}));
 try{
  await within(Promise.race([acceptedReady,outcome.then(result=>{throw result.error??Error('Producer ended before accepted response boundary');})]),5000,'Accepted Auth cancellation boundary not reached');
 }finally{controller.abort();await outcome;}
 const stopped=await outcome;assert.ok(stopped.error);assert.equal(stopped.value,undefined);
 assert.equal((await db.query('select count(*)::int n from auth.sessions where user_id=$1 and user_agent=$2',[actor.user,abortedAgent])).rows[0].n,0);
 assert.equal((await db.query('select closed_at is not null as closed from maintenance_private.closure_reauth_markers where marker_id=$1',[abortedAgent.split('/').at(-1)])).rows[0].closed,true);
 assert.deepEqual((await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows,baseline);
 console.log('closure-review actual Auth concurrency: session INSERT waits for cleanup COMMIT then is refused; accepted-undelivered password body plus caller abort still closes marker and removes session; original Auth retained');
}
