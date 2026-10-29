import test from 'node:test';
import assert from 'node:assert/strict';
import {createClosureReauthenticationProducer,REAUTH_REGISTER_SQL,REAUTH_OBSERVE_SQL,REAUTH_CLOSE_SQL,REAUTH_SWEEP_SQL} from '../lib/closure-reauth-producer.mjs';
const scope={userID:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333',email:'synthetic@example.invalid'};
function fixture({loss=false,abort=false}={}){
 const calls=[],controller=new AbortController();let marker,closed=false;
 const producer=createClosureReauthenticationProducer({transactions:{run:(signal,callback)=>callback({query:async(sql,args)=>{
  assert.equal(signal.aborted,false);calls.push(sql);
  if(sql===REAUTH_SWEEP_SQL)return {rows:[{swept:{closed:0,purged:0}}]};
  marker??=args[3];assert.equal(args[3],marker);assert.deepEqual(args.slice(0,3),[scope.userID,scope.sessionID,scope.epochID]);
  if(sql===REAUTH_REGISTER_SQL)return {rows:[{registered:true}]};
  if(sql===REAUTH_OBSERVE_SQL)return {rows:[{observed:1}]};
  assert.equal(sql,REAUTH_CLOSE_SQL);closed=true;return {rows:[{removed:1}]};
 }})},clientForRequest:({agent})=>{
  assert.equal(agent,'OuchiMaintenance/closure-reauth/v1/'+marker);
  return {auth:{signInWithPassword:async()=>{if(abort)controller.abort();return loss?{data:{user:null,session:null},error:Error('reply lost')}:{data:{user:{id:scope.userID},session:{}},error:null};},signOut:async()=>({error:null})}};
 }});
 return {calls,controller,closed:()=>closed,run:()=>producer(scope.email,'synthetic-password',controller.signal,scope)};
}
test('known authentication resolves only after marker cleanup and returns no tokens',async()=>{
 const f=fixture();assert.equal(await f.run(),scope.userID);assert.equal(f.closed(),true);assert.deepEqual(f.calls,[REAUTH_SWEEP_SQL,REAUTH_REGISTER_SQL,REAUTH_OBSERVE_SQL,REAUTH_CLOSE_SQL]);
});
test('lost Auth response still closes same marker and never reports authentication success',async()=>{
 const f=fixture({loss:true});assert.equal(await f.run(),null);assert.equal(f.closed(),true);assert.equal(f.calls.at(-1),REAUTH_CLOSE_SQL);
});
test('original request abort does not prevent independent finite marker cleanup',async()=>{
 const f=fixture({abort:true});await assert.rejects(f.run(),/abort/i);assert.equal(f.closed(),true);
});
