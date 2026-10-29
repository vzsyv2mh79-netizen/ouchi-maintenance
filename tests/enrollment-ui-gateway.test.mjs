import test from 'node:test';
import http from 'node:http';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {startEnrollmentUIGateway} from './fixtures/enrollment-ui-gateway.mjs';
test('isolated gateway refuses external Auth before opening ports',async()=>{
 await assert.rejects(startEnrollmentUIGateway({authOrigin:'https://example.com',handleEnrollment:()=>{}}),/Loopback/);
});
test('one committed reply is lost; GET recovery never repeats POST',async()=>{
 let committed=false,writes=0;
 const gateway=await startEnrollmentUIGateway({authOrigin:'http://127.0.0.1:1',authPort:0,enrollmentPort:0,handleEnrollment:async request=>{
  if(request.method==='POST'){committed=true;writes++;}
  return Response.json({enrolled:committed});
 }});
 try{
  assert.deepEqual(await(await fetch(gateway.enrollmentURL)).json(),{enrolled:false});
  assert.equal((await fetch(gateway.enrollmentURL,{method:'POST',body:'{}'})).status,503);
  assert.deepEqual(await(await fetch(gateway.enrollmentURL)).json(),{enrolled:true});
  assert.equal(writes,1);assert.equal(gateway.evidence.lostAcknowledgements,1);
  assert.equal(gateway.evidence.enrollmentPosts,1);assert.equal(gateway.evidence.enrollmentReads,2);
  assert.equal((await fetch(gateway.authURL+'/rest/v1/maintenance_homes')).status,403);
  assert.equal((await fetch(gateway.authURL+'/auth/v1/admin/users')).status,404);
  assert.equal((await fetch(gateway.authURL+'/rest/v1/maintenance_homes',{method:'DELETE'})).status,404);
  assert.equal((await fetch(gateway.authURL+'/rest/v1/rpc/load_household',{method:'POST',body:'{}'})).status,403);
  assert.equal(gateway.evidence.recordDenials,2);
  assert.equal((await fetch(gateway.authURL+'/rest/v1/rpc/complete_maintenance',{method:'POST',body:'{}'})).status,404);
  assert.equal((await fetch(gateway.authURL+'/rest/v1/rpc/load_household',{method:'DELETE'})).status,404);
  assert.equal(gateway.evidence.authRequests,0);
 }finally{await gateway.stop();}
});

test('Auth diagnostic retains only route and status, never credentials or response bodies',async()=>{
 const upstream=http.createServer((req,res)=>{req.resume();res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({error:'synthetic-private-response'}));});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 let gateway;
 try {
  gateway=await startEnrollmentUIGateway({authOrigin:`http://127.0.0.1:${upstream.address().port}`,authPort:0,enrollmentPort:0,handleEnrollment:()=>Response.json({})});
  const response=await fetch(gateway.authURL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer synthetic-private-token'},body:JSON.stringify({email:'synthetic@fixture.invalid',password:'synthetic-private-password'})});
  assert.equal(response.status,401);
  assert.deepEqual(gateway.evidence.authResponses,[{path:'/auth/v1/token',status:401}]);
  assert.equal(gateway.evidence.authRequests,1);
  const saved=JSON.stringify(gateway.evidence);
  for(const forbidden of ['synthetic-private','fixture.invalid','grant_type','authorization','password'])assert.equal(saved.includes(forbidden),false);
 } finally {
  await gateway?.stop();
  await new Promise(resolve=>{upstream.close(resolve);upstream.closeAllConnections();});
 }
});
