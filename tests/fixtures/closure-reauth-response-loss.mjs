import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

/** Negative disposable witness for the existing SDK-only cleanup dependency.
 * Losing an accepted password-grant response prevents the SDK from learning
 * its new session. signOut(local) is then not proof that Auth removed it.
 * No production request/credentials/data, erasure or successful fix is claimed.
 */
export async function verifyDisposableReauthenticationResponseLoss({db,actor,origin,options,createAttachmentFetch}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 const agent='OuchiMaintenance/closure-reauth-probe/'+randomUUID();
 const other=createClient(origin,'synthetic-public-key',{...options,global:{headers:{'User-Agent':'OuchiMaintenance/other-login-probe/'+randomUUID()},fetch:createAttachmentFetch(AbortSignal.timeout(10000),5000,65536)}});
 const ordinary=await other.auth.signInWithPassword({email:actor.email,password:actor.password});assert.equal(ordinary.error,null);
 const baseline=(await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows;
 let accepted=false;
 const lost=createClient(origin,'synthetic-public-key',{...options,global:{fetch:async(input,init)=>{
  const target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const headers=new Headers(init?.headers);headers.set('User-Agent',agent);
  const response=await createAttachmentFetch(AbortSignal.timeout(10000),5000,65536)(input,{...init,headers});
  if(target.origin===origin&&target.pathname==='/auth/v1/token'&&target.search==='?grant_type=password'&&init?.method==='POST'&&response.status===200){
   const body=await response.json();assert.equal(body.user.id,actor.user);assert.ok(body.access_token);accepted=true;
   // Bytes were received by this fixture but never delivered to the SDK.
   // Do not log, persist or use the access/refresh tokens for cleanup.
   throw Error('Synthetic accepted password response loss');
  }
  return response;
 }}});
 try{
  const result=await lost.auth.signInWithPassword({email:actor.email,password:actor.password});
  assert.equal(accepted,true);assert.ok(result.error);assert.equal(result.data.session,null);
  const cleanup=await lost.auth.signOut({scope:'local'});assert.equal(cleanup.error,null);
  const remaining=(await db.query('select id::text from auth.sessions where user_id=$1 and user_agent=$2 order by id',[actor.user,agent])).rows;
  assert.ok(remaining.length>=1,'Accepted Auth session must still exist despite successful SDK-only logout');
  for(const row of baseline)assert.equal(remaining.some(value=>value.id===row.id),false);
  console.log('closure-review Auth response-loss negative witness: accepted password grant, SDK has no session, local logout reports success but marked Auth session remains; production cleanup gap confirmed');
 }finally{
  // Synthetic test account only; exact unguessable agent scope. Never delete
  // sessions by a before/after user-session difference in application code.
  await db.query('delete from auth.refresh_tokens where session_id in (select id from auth.sessions where user_id=$1 and user_agent=$2)',[actor.user,agent]);
  await db.query('delete from auth.sessions where user_id=$1 and user_agent=$2',[actor.user,agent]);
  assert.deepEqual((await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows,baseline);
  const {error}=await other.auth.signOut({scope:'local'});assert.equal(error,null);
 }
}
