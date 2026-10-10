import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as proxyRequest} from 'node:http';
import {randomUUID,createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
test('actual additive migration preserves unbound household access and rejects stale purchase sessions',{skip:process.env.OUCHI_IDENTITY_MIGRATION_TEST!=='true',timeout:60000},async()=>{
 const gateway=createServer((request,response)=>{
  const auth=request.url?.startsWith('/auth/v1/'),rest=request.url?.startsWith('/rest/v1/');
  if(!auth&&!rest){response.writeHead(404).end();return;}
  const upstream=proxyRequest((auth?'http://127.0.0.1:9999':'http://127.0.0.1:3002')+request.url.slice(8),{method:request.method,headers:request.headers},result=>{response.writeHead(result.statusCode??502,result.headers);result.pipe(response);});
  upstream.on('error',()=>response.writeHead(502).end());request.pipe(upstream);
 });
 await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(54321,'127.0.0.1',resolve);});
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false}},origin='http://127.0.0.1:54321';
  const user=createClient(origin,'synthetic-public-key',options),email='identity-'+randomUUID()+'@example.invalid',password='Synthetic-'+randomUUID();
  const signup=await user.auth.signUp({email,password});assert.equal(signup.error,null);assert.ok(signup.data.session);
  const id=signup.data.user.id,claims=JSON.parse(Buffer.from(signup.data.session.access_token.split('.')[1],'base64url'));
  const home=randomUUID();assert.equal((await user.from('homes').insert({id:home,owner_id:id,name:'Synthetic migration home',kind:'home'})).error,null);
  const before=await user.rpc('load_household');assert.equal(before.error,null);assert.ok(before.data.homes.some(row=>row.id===home));
  assert.ok((await user.rpc('current_maintenance_purchase_account',{target_user:id,verified_session:claims.session_id})).error);
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300});
  const service=unsigned+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(unsigned).digest('base64url');
  const admin=createClient(origin,service,options),bind=session=>admin.rpc('current_maintenance_purchase_account',{target_user:id,verified_session:session});
  const binding=await bind(claims.session_id);assert.equal(binding.error,null);assert.ok(binding.data);assert.notEqual(binding.data,id);assert.equal((await bind(claims.session_id)).data,binding.data);
  // Synthetic normalized events only; no Apple signature or purchase claimed.
  const event={environment:'Sandbox',transactionId:'100',originalTransactionId:'10',accountToken:binding.data,productId:'ouchi.premium.monthly',signedAt:100,purchasedAt:50,expiresAt:200};
  const write=payload=>admin.rpc('apply_maintenance_verified_transaction',{payload,proof_sha256:'a'.repeat(64)});
  const first=await write(event);assert.equal(first.error,null);assert.equal(first.data,'inserted');assert.equal((await write(event)).data,'ignored');
  assert.equal((await write({...event,signedAt:101,revokedAt:101})).data,'updated');assert.equal((await write(event)).data,'ignored');
  assert.equal((await write({...event,environment:'Production'})).data,'inserted');
  assert.ok((await user.rpc('apply_maintenance_verified_transaction',{payload:event,proof_sha256:'a'.repeat(64)})).error);
  assert.ok((await user.rpc('load_household')).data.homes.some(row=>row.id===home));
  const second=createClient(origin,'synthetic-public-key',options),login=await second.auth.signInWithPassword({email,password});assert.equal(login.error,null);
  const secondClaims=JSON.parse(Buffer.from(login.data.session.access_token.split('.')[1],'base64url'));assert.notEqual(secondClaims.session_id,claims.session_id);assert.equal((await bind(secondClaims.session_id)).data,binding.data);
  assert.equal((await admin.rpc('current_maintenance_purchase_account',{target_user:randomUUID(),verified_session:secondClaims.session_id})).data,null);
  assert.match(secondClaims.session_id,/^[0-9a-f-]{36}$/i);
  execFileSync('docker',['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db','psql','-U','postgres','-d','auth_test','-v','ON_ERROR_STOP=1'],{input:"update auth.sessions set not_after=now()-interval '1 second' where id='"+secondClaims.session_id+"';",timeout:10000,stdio:['pipe','pipe','pipe']});
  const expired=await bind(secondClaims.session_id);assert.equal(expired.error,null);assert.equal(expired.data,null);
  assert.equal((await user.auth.signOut({scope:'local'})).error,null);const revoked=await bind(claims.session_id);assert.equal(revoked.error,null);assert.equal(revoked.data,null);
 }finally{gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));}
});
