import test from 'node:test';import assert from 'node:assert/strict';import {createServer,request as proxyRequest} from 'node:http';import {randomUUID,createHmac} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
// Disposable CI services only; no real user, SMTP or shared project.
test('real Auth JWT enforces closure and reenrollment through PostgREST', {skip:process.env.OUCHI_REAL_AUTH_TEST!=='true',timeout:30000},async()=>{
 const gateway=createServer((request,response)=>{
  const auth=request.url?.startsWith('/auth/v1/'),rest=request.url?.startsWith('/rest/v1/');
  if(!auth&&!rest){response.writeHead(404).end();return;}
  const origin=auth?'http://127.0.0.1:9999':'http://127.0.0.1:3002';
  const upstream=proxyRequest(origin+request.url.slice(auth?8:8),{method:request.method,headers:request.headers},result=>{response.writeHead(result.statusCode??502,result.headers);result.pipe(response);});
  upstream.on('error',()=>response.writeHead(502).end());request.pipe(upstream);
 });
 await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(54321,'127.0.0.1',resolve);});
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const client=createClient('http://127.0.0.1:54321','synthetic-public-key',options);
  const email='rest-'+randomUUID()+'@example.invalid',password='Synthetic-'+randomUUID();
  const signup=await client.auth.signUp({email,password});assert.equal(signup.error,null);assert.ok(signup.data.session);
  const token=signup.data.session.access_token,id=signup.data.user.id;
  const verified=await client.auth.getUser(token);assert.equal(verified.error,null);assert.equal(verified.data.user.id,id);
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));assert.equal(claims.sub,id);assert.ok(claims.session_id);
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300});
  const service=unsigned+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(unsigned).digest('base64url');
  const admin=createClient('http://127.0.0.1:54321',service,options);
  const bootstrap=await admin.rpc('bootstrap_synthetic_app_identity',{target_user:id,verified_session:claims.session_id});assert.equal(bootstrap.error,null);
  const old=await client.rpc('load_household');assert.equal(old.error,null);const oldHome=old.data.homes[0].id;
  const forbidden=await client.rpc('close_maintenance_app_identity',{target_user:id,verified_session:claims.session_id});assert.ok(forbidden.error);
  const closed=await admin.rpc('close_maintenance_app_identity',{target_user:id,verified_session:claims.session_id});assert.equal(closed.error,null);assert.equal(closed.data,true);
  assert.ok((await client.rpc('load_household')).error);assert.deepEqual((await client.from('homes').select('*')).data,[]);
  const forbiddenInsert=await client.from('homes').insert({owner_id:id,name:'closed synthetic home',kind:'home'});assert.ok(forbiddenInsert.error);
  const forged=token.split('.');forged[2]=(forged[2][0]==='A'?'B':'A')+forged[2].slice(1);
  const invalid=createClient('http://127.0.0.1:54321','synthetic-public-key',{...options,global:{headers:{Authorization:'Bearer '+forged.join('.')}}});
  assert.ok((await invalid.rpc('load_household')).error);
  const freshClient=createClient('http://127.0.0.1:54321','synthetic-public-key',options);
  const login=await freshClient.auth.signInWithPassword({email,password});assert.equal(login.error,null);assert.ok(login.data.session);
  const freshVerified=await freshClient.auth.getUser(login.data.session.access_token);assert.equal(freshVerified.error,null);assert.equal(freshVerified.data.user.id,id);
  const freshClaims=JSON.parse(Buffer.from(login.data.session.access_token.split('.')[1],'base64url'));assert.notEqual(freshClaims.session_id,claims.session_id);
  assert.ok((await freshClient.rpc('load_household')).error);
  const enrolled=await admin.rpc('reenroll_maintenance_app_identity',{target_user:id,verified_session:freshClaims.session_id});assert.equal(enrolled.error,null);
  assert.ok((await client.rpc('load_household')).error);
  const fresh=await freshClient.rpc('load_household');assert.equal(fresh.error,null);assert.notEqual(fresh.data.homes[0].id,oldHome);
  assert.ok((await admin.rpc('close_maintenance_app_identity',{target_user:id,verified_session:claims.session_id})).error);
  assert.equal((await freshClient.rpc('load_household')).error,null);
 }finally{gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));}
});
