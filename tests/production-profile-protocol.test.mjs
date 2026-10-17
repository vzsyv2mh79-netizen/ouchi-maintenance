import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyRetirementRpcHTTPServices} from './fixtures/retirement-rpc-http-services.mjs';

async function environment(callback){
 const keys=['OUCHI_RETIREMENT_RPC_HTTP_TEST','OUCHI_TEST_REST_PORT'],prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 process.env.OUCHI_RETIREMENT_RPC_HTTP_TEST='true';process.env.OUCHI_TEST_REST_PORT='19001';
 try{await callback();}finally{for(const key of keys)if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
}
test('full-profile verification refuses an absent versioned review schema before any fixture mutation or HTTP fallback',async()=>{
 await environment(async()=>{
  const statements=[];let connections=0,http=0;
  await assert.rejects(verifyRetirementRpcHTTPServices({
   db:{query:async sql=>{statements.push(sql);return {rows:[{ready:false}]};}},
   connect:async()=>{connections++;throw Error('Unexpected connection');},authPort:19002,
   fetcher:async()=>{http++;throw Error('Unexpected HTTP');},privilegeProfile:'observed-production-20261017',accountContentReview:true,
  }),/versioned review schema is required/);
  assert.equal(statements.length,1);assert.match(statements[0],/^select to_regprocedure/);assert.equal(connections,0);assert.equal(http,0);
 });
});
test('full-profile protocol selection must be an explicit boolean',async()=>{
 await environment(async()=>{
  let calls=0;
  for(const accountContentReview of ['legacy','false',1,null])await assert.rejects(verifyRetirementRpcHTTPServices({db:{query:async()=>{calls++;}},authPort:19002,privilegeProfile:'observed-production-20261017',accountContentReview}));
  assert.equal(calls,0);
 });
});
