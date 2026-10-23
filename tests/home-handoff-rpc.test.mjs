import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {homeHandoffRPCDependencies} from '../lib/home-handoff-rpc.mjs';
import {HomeHandoffRefusal} from '../lib/home-handoff-handler.mjs';
const origin='https://ouchi-maintenance.vercel.app';
const scope={requestID:'66666666-6666-4666-8666-666666666666',userID:'11111111-1111-4111-8111-111111111111',sessionID:'77777777-7777-4777-8777-777777777777',epochID:'99999999-9999-4999-8999-999999999999'};
const homeID='44444444-4444-4444-8444-444444444444',recipientID='22222222-2222-4222-8222-222222222222';
const verifyCurrent=async()=>null;
const status={requestID:scope.requestID,homeID,state:'pending',expiresAt:'2099-01-01T00:00:00Z'};
function sdk(fetcher){return createClient('https://disposable.supabase.co','synthetic-test-only',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetcher}});}

test('actual SDK maps exact verified scope and forwards the abort signal to each RPC HTTP request',async()=>{
 const requests=[];const controller=new AbortController();
 const client=sdk(async(url,options)=>{requests.push({url:String(url),args:JSON.parse(options.body),signal:options.signal});return Response.json(status);});
 const deps=homeHandoffRPCDependencies({client,origin,verifyCurrent});
 assert.deepEqual(await deps.read(scope,controller.signal),status);
 assert.deepEqual(await deps.create({...scope,homeID,recipientID},controller.signal),status);
 assert.deepEqual(await deps.decide({...scope,accept:true},controller.signal),status);
 const common={target_request:scope.requestID,target_user:scope.userID,verified_session:scope.sessionID,expected_epoch:scope.epochID};
 assert.deepEqual(requests.map(item=>item.args),[common,{...common,target_home:homeID,target_recipient:recipientID},{...common,accept:true}]);
 assert.deepEqual(requests.map(item=>new URL(item.url).pathname.split('/').at(-1)),['read_maintenance_home_handoff','request_maintenance_home_handoff','decide_maintenance_home_handoff']);
 for(const item of requests)assert.equal(item.signal,controller.signal);
});

test('exact attachment SQL refusal is typed only for the decision RPC; null mutation and unknown errors stay unconfirmed',async()=>{
 for(const [error,typed] of [[{code:'P0001',message:'Attachment handoff required'},true],[{code:'OTHER',message:'Attachment handoff required'},false],[{code:'P0001',message:'Different error'},false]]){
  const client=sdk(async()=>Response.json(error,{status:400}));const deps=homeHandoffRPCDependencies({client,origin,verifyCurrent});
  await assert.rejects(deps.decide({...scope,accept:true},new AbortController().signal),value=>typed?value instanceof HomeHandoffRefusal:!(value instanceof HomeHandoffRefusal));
  await assert.rejects(deps.read(scope,new AbortController().signal),value=>!(value instanceof HomeHandoffRefusal));
 }
 const deps=homeHandoffRPCDependencies({client:sdk(async()=>Response.json(null)),origin,verifyCurrent});
 assert.equal(await deps.read(scope,new AbortController().signal),null);
 await assert.rejects(deps.create({...scope,homeID,recipientID},new AbortController().signal),/unconfirmed/);
});

test('abort before invocation and malformed internal scope never start SDK fetch',async()=>{
 let fetches=0;const deps=homeHandoffRPCDependencies({client:sdk(async()=>{fetches++;return Response.json(status);}),origin,verifyCurrent});
 const stopped=new AbortController();stopped.abort();await assert.rejects(deps.read(scope,stopped.signal));
 await assert.rejects(deps.read({...scope,epochID:'bad'},new AbortController().signal),/Invalid verified/);
 assert.throws(()=>deps.create({...scope,homeID,recipientID:scope.userID},new AbortController().signal),/Invalid handoff/);assert.equal(fetches,0);
});

test('aborted in-flight SDK result never acknowledges a mutation even if the simulated server committed',async()=>{
 const controller=new AbortController();let fetches=0;
 const deps=homeHandoffRPCDependencies({client:sdk(async()=>{fetches++;controller.abort();return Response.json({...status,state:'completed'});}),origin,verifyCurrent});
 await assert.rejects(deps.decide({...scope,accept:true},controller.signal));assert.equal(fetches,1);
});
