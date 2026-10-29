import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {legacyUpgradeClient} from './fixtures/maintenance-upgrade-client.mjs';
const token='synthetic-upgrade-token',id='11111111-1111-4111-8111-111111111111';
test('real SDK canonical header sends exactly one original bearer for Auth and data requests',async()=>{
 const calls=[],fetcher=async(input,init)=>{
  calls.push({input,auth:new Headers(init.headers).get('authorization')});
  return Response.json(String(input).endsWith('/user')?{id}:[]);
 };
 const client=legacyUpgradeClient(token,fetcher);
 assert.equal((await client.auth.getUser(token)).error,null);assert.equal((await client.from('products').select('id')).error,null);
 assert.equal(calls.length,2);assert.ok(calls.every(call=>call.auth==='Bearer '+token));
});
test('negative SDK witness reproduces the duplicate case-insensitive header from lowercase fixture setup',async()=>{
 let observed;
 const client=createClient('http://127.0.0.1:54321','synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{authorization:'Bearer '+token},fetch:async(input,init)=>{observed=new Headers(init.headers).get('authorization');return Response.json({id});}}});
 await client.auth.getUser(token);assert.notEqual(observed,'Bearer '+token);assert.match(observed,/,/);
});
