import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createHomeHandoffPolicyReader} from '../../lib/home-handoff-policy.mjs';
import {HomeHandoffAdditionalVerificationRequired} from '../../lib/home-handoff-handler.mjs';

// Synthetic test authenticator only; never reads a real user's secret or code.
// RFC 6238 SHA1, 30-second counter, six digits; independently vector-tested.
export function syntheticTOTP(secret,seconds=Math.floor(Date.now()/1000)) {
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0;const bytes=[];
 assert.match(secret,/^[A-Z2-7]+=*$/);
 for(const character of secret.replace(/=+$/,'')) {
  value=(value<<5)|alphabet.indexOf(character);bits+=5;
  if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}
 }
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(seconds/30)));
 const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();
 const offset=digest[19]&15;
 return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}

export async function verifyDisposableHandoffMFA({account,sql,origin,options,createAttachmentFetch,createHomeHandoffIdentityVerifier}) {
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');
 assert.equal(origin,'http://127.0.0.1:54321');
 // Import only after the fixed disposable service opt-in; no remote DB option.
 const {Client}=await import('pg');
 const ok=result=>{assert.equal(result.error,null);return result.data;};
 const mfa=await account();
 const original=ok(await mfa.client.auth.getSession()).session.access_token;
 const factor=ok(await mfa.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic CI authenticator'}));
 assert.equal(factor.type,'totp');
 const challenge=ok(await mfa.client.auth.mfa.challenge({factorId:factor.id}));
 const promoted=ok(await mfa.client.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:syntheticTOTP(factor.totp.secret)}));
 assert.equal(JSON.parse(Buffer.from(promoted.access_token.split('.')[1],'base64url')).aal,'aal2');
 assert.equal(sql(`select aal::text from auth.sessions where id='${mfa.session}';`),'aal2');
 assert.equal(sql(`select status::text from auth.mfa_factors where id='${factor.id}';`),'verified');
 const projectID='abcdefghijklmnopqrst';
 async function identity(bearer) {
  const signal=AbortSignal.timeout(10000);
  // Injected policy is an explicitly labelled fixture, not live Management proof.
  const policyReader=createHomeHandoffPolicyReader({projectID,accessToken:'synthetic',readEffectiveLowAAL:async()=>({projectID,checkedAt:new Date().toISOString(),authVersion:'v2.196.0',allowLowAALSeconds:null}),fetcher:async()=>Response.json({sessions_timebox:null,sessions_inactivity_timeout:null,sessions_single_per_user:false,mfa_totp_verify_enabled:true,mfa_phone_verify_enabled:false,mfa_web_authn_verify_enabled:false})});
  const verifier=createHomeHandoffIdentityVerifier({projectID,policyReader,getUser:(token,callerSignal)=>createClient(origin,'synthetic-public-key',{...options,global:{fetch:createAttachmentFetch(callerSignal,5000,65536)}}).auth.getUser(token)});
  // Privileged disposable fixture only; this is not a shipping DB provider/grant.
  const db=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:5000});
  await db.connect();
  try {
   await db.query('begin');await db.query("set local statement_timeout='4500ms'");
   return await verifier(bearer,{signal,query:(text,values)=>db.query(text,values)});
  } finally {try{await db.query('rollback');}finally{await db.end();}}
 }
 assert.deepEqual(await identity(promoted.access_token),{userID:mfa.user,sessionID:mfa.session,epochID:mfa.epoch});
 // Older bearer cannot silently inherit the current session's promotion.
 await assert.rejects(identity(original),HomeHandoffAdditionalVerificationRequired);
 const passwordLogin=createClient(origin,'synthetic-public-key',options);
 const low=ok(await passwordLogin.auth.signInWithPassword({email:mfa.email,password:mfa.password}));
 assert.equal(JSON.parse(Buffer.from(low.session.access_token.split('.')[1],'base64url')).aal,'aal1');
 await assert.rejects(identity(low.session.access_token),HomeHandoffAdditionalVerificationRequired);
 // Exact original AAL2 bearer remains cryptographically valid after logout,
 // but live-session validation must refuse it. No Auth user is deleted.
 ok(await mfa.client.auth.signOut({scope:'local'}));
 assert.equal(await identity(promoted.access_token),null);
}
