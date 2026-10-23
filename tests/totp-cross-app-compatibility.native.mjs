import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
import {startFixtureGoTrue,fixtureTOTP} from './fixtures/scoped-native-gotrue.mjs';

test('real SDK and Swift Auth clients re-login and verify TOTP after shared enrollment invalidates AAL1 sessions',async()=>{
 const socket=process.env.OUCHI_SCOPED_TEST_PG_SOCKET;assert.match(socket??'',/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 const admin=new pg.Pool({host:socket,user:'ouchi_fixture',database:'postgres',port:5432,max:1});
 const directory=mkdtempSync('/private/tmp/ouchi-totp-compat-');let auth;
 try{
  const sdk=spawnSync('/usr/bin/xcrun',['--sdk','macosx','--show-sdk-path'],{encoding:'utf8'});assert.equal(sdk.status,0);
  const common=['-sdk',sdk.stdout.trim(),'-swift-version','6','-D','DEBUG','-module-cache-path',join(directory,'cache')];
  const core='ios/OuchiCore';
  for(const args of [[...common,'-emit-module','-emit-library','-module-name','OuchiCore',...readdirSync(core).filter(x=>x.endsWith('.swift')).sort().map(x=>join(core,x)),'-o',join(directory,'libOuchiCore.dylib'),'-emit-module-path',join(directory,'OuchiCore.swiftmodule')],[...common,'-I',directory,'-L',directory,'-lOuchiCore','-parse-as-library','ios/Tests/TOTPRealAuthCompatibility.swift','-o',join(directory,'compat')]]){
   const result=spawnSync('/usr/bin/swiftc',args,{encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr);
  }
  await admin.query('create role postgres;create schema auth;');
  auth=await startFixtureGoTrue(socket,'https://hphifiqyypwyxkzfanod.supabase.co/auth/v1');
  const email=randomUUID()+'@fixture.invalid',password=randomBytes(24).toString('base64url');
  const first=await auth.request('/signup',{email,password});
  const second=await auth.request('/token?grant_type=password',{email,password});
  const enrolling=await auth.request('/token?grant_type=password',{email,password});
  const staleIDs=[first,second].map(s=>JSON.parse(Buffer.from(s.access_token.split('.')[1],'base64url')).session_id);
  const factor=await auth.request('/factors',{factor_type:'totp',friendly_name:'Disposable shared fixture'},enrolling.access_token);
  const challenge=await auth.request('/factors/'+factor.id+'/challenge',{},enrolling.access_token);
  await auth.request('/factors/'+factor.id+'/verify',{challenge_id:challenge.id,code:fixtureTOTP(factor.totp.secret)},enrolling.access_token);
  assert.equal((await admin.query('select count(*)::int as n from auth.sessions where id=any($1::uuid[])',[staleIDs])).rows[0].n,0,'Real TOTP enrollment revokes both other low-AAL sessions');
  const fetcher=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.origin,auth.origin);assert.ok(url.pathname.startsWith('/auth/v1/'));url.pathname=url.pathname.slice('/auth/v1'.length);return fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(5000)});};
  const web=createClient(auth.origin,'sb_publishable_disposable_fixture_only',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetcher}});
  const stale=await web.auth.getUser(first.access_token);assert.ok(stale.error,'SDK refuses revoked old Web session');
  const login=await web.auth.signInWithPassword({email,password});assert.equal(login.error,null);assert.equal(login.data.user.id,first.user.id);
  const list=await web.auth.mfa.listFactors();assert.equal(list.error,null);assert.equal(list.data.totp.length,1);
  const promoted=await web.auth.mfa.challengeAndVerify({factorId:factor.id,code:fixtureTOTP(factor.totp.secret)});assert.equal(promoted.error,null);
  assert.equal(JSON.parse(Buffer.from(promoted.data.access_token.split('.')[1],'base64url')).aal,'aal2');
  const input={origin:auth.origin,email,password,account:first.user.id,stale:{access_token:second.access_token,refresh_token:second.refresh_token,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:second.user.id}},code:fixtureTOTP(factor.totp.secret)};
  await new Promise((resolve,reject)=>{
   const child=spawn(join(directory,'compat'),[],{env:{PATH:'/usr/bin:/bin',DYLD_LIBRARY_PATH:directory},stdio:['pipe','pipe','pipe']});
   let output='';const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Owned Swift fixture timeout'));},30000);
   child.stdout.on('data',b=>{output+=b.toString();});child.stderr.on('data',()=>{});
   child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',(code,signal)=>{clearTimeout(timer);if(code===0&&output.includes('PASS: actual Swift')){console.log(output.trim());resolve();}else reject(Error('Owned Swift compatibility assertion failed, exit '+code+' signal '+signal+' checkpoints '+output.split('\n').filter(x=>x.startsWith('CHECK:')).join('; ')));});
   child.stdin.end(JSON.stringify(input));
  });
  const remaining=await web.auth.getUser();assert.equal(remaining.error,null,'Other established AAL2 SDK login survives Native verification');
  assert.equal(remaining.data.user.id,first.user.id);
  console.log('PASS: real Supabase SDK2.117.2 password login and TOTP confirmation; existing AAL2 session retained. Web UI and shipping native navigation are not verified.');
 }finally{if(auth)await auth.stop();await admin.end();rmSync(directory,{recursive:true,force:true});}
});
