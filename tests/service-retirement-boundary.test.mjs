import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {reviewedCleanupFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {recipient,rs,re,owner,os,oe} from './fixtures/home-handoff-identifiers.mjs';
import {snapshot} from './fixtures/retirement-rpc-cases.mjs';
const code=ts.transpileModule(readFileSync('lib/billing-app-attest-registration-challenge.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createRegistrationChallenge,registrationClientDataHash}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
async function service(db,sql,args=[]){
 await db.exec('set role service_role');try{return (await db.query(sql,args)).rows;}finally{await db.exec('reset role');}
}
const scalar=async(db,sql,args)=>(await service(db,sql,args))[0].value;

// This exercises SQL's trusted service boundary against the assembled schema.
// Transactions/challenges are synthetic trusted inputs, NOT verified Apple JWS,
// real App Attest, real APNs delivery, or an end-to-end enrollment UI proof.
test('assembled service controls cannot reopen a reviewed retired app identity; family remains enrolled',async t=>{
 let cases,transaction,challenge;
 const f=await reviewedCleanupFixture({beforeCoverage:async f=>{
  const db=f.db,fresh=randomUUID(),consent=randomUUID(),endpoint='https://web.push.apple.com/synthetic-service-retirement';
  await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())',[fresh,recipient]);
  const now=Date.now();transaction={environment:'Sandbox',accountToken:re,transactionId:'synthetic-service-period-1',originalTransactionId:'91001',productId:'ouchi.premium.monthly',signedAt:now,purchasedAt:now-1000,expiresAt:now+3600000,revokedAt:null,isUpgraded:false};
  assert.equal(await scalar(db,'select public.apply_maintenance_verified_transaction($1::jsonb,$2) value',[transaction,'f'.repeat(64)]),'inserted');
  await db.query('insert into public.maintenance_push_subscriptions(user_id,endpoint,p256dh,auth) values($1,$2,$3,$4)',[recipient,endpoint,'a'.repeat(87),'b'.repeat(22)]);
  const verifiedPublicKey=Buffer.concat([Buffer.from([4]),Buffer.alloc(64,9)]);
  challenge=createRegistrationChallenge({userID:recipient,sessionID:rs,epochID:re,requestID:randomUUID(),keyID:createHash('sha256').update(verifiedPublicKey).digest('base64'),appID:'SYNTHETIC1.dev.synthetic.ouchi',attestEnvironment:'production'});
  const bind=[recipient,rs,re,'Sandbox'];
  const make=(name,sql,args,positive,closed)=>({name,sql,args,positive,closed});
  cases=[
   make('current_maintenance_purchase_account','select public.current_maintenance_purchase_account($1,$2) value',[recipient,rs],v=>assert.equal(v,re),null),
   make('read_maintenance_explicit_enrollment','select public.read_maintenance_explicit_enrollment($1,$2) value',[recipient,rs],v=>assert.equal(v,re),null),
   make('enroll_maintenance_app_with_consent','select public.enroll_maintenance_app_with_consent($1,$2,$3,$4) value',[recipient,rs,fresh,consent],v=>assert.deepEqual(v,{userID:recipient,sessionID:rs,epochID:re,requestID:consent}),/Deletion not finalized/),
   make('read_maintenance_verified_entitlement','select public.read_maintenance_verified_entitlement($1,$2,$3,$4) value',bind,v=>assert.equal(v.plan,'premium'),/Purchase account unavailable/),
   make('register_maintenance_native_push','select public.register_maintenance_native_push($1,$2,$3,$4,$5) value',[recipient,rs,re,'aa'.repeat(32),'Sandbox'],v=>assert.match(v,/^[a-f0-9-]{36}$/),/Inactive registration/),
   make('register_maintenance_native_scoped_push','select public.register_maintenance_native_scoped_push($1,$2,$3,$4,$5,$6) value',[recipient,rs,re,'bb'.repeat(32),'Sandbox','Sandbox'],v=>assert.match(v,/^[a-f0-9-]{36}$/),/Purchase account unavailable/),
   make('save_maintenance_notification_channel','select public.save_maintenance_notification_channel($1,$2,$3,$4,$5,$6) value',[...bind,0,'web'],v=>assert.equal(v.revision,1),/Purchase account unavailable/),
   make('save_maintenance_reminder_schedule','select public.save_maintenance_reminder_schedule($1,$2,$3,$4,$5,$6,$7::smallint[],$8,$9) value',[...bind,0,600,[1,2,3,4,5,6,7],1,true],v=>assert.equal(v.revision,1),/Purchase account unavailable/),
   make('issue_maintenance_attest_registration_challenge','select public.issue_maintenance_attest_registration_challenge($1::jsonb,$2) value',[challenge,registrationClientDataHash(challenge).toString('hex')],v=>assert.deepEqual(v,challenge),null),
   make('read_maintenance_attest_registration_challenge','select public.read_maintenance_attest_registration_challenge($1,$2,$3,$4,$5) value',[challenge.requestID,recipient,rs,re,challenge.keyID],v=>assert.deepEqual(v,challenge),null),
   make('read_maintenance_reconciliation_seed','select public.read_maintenance_reconciliation_seed($1,$2,$3,$4) value',bind,v=>assert.equal(v.transactionId,transaction.transactionId),/Recovery enrollment unavailable/),
   make('enqueue_maintenance_reconciliation','select public.enqueue_maintenance_reconciliation($1,$2,$3,$4) value',bind,v=>assert.match(v,/^[a-f0-9-]{36}$/),/Recovery enrollment unavailable/),
   make('request_maintenance_closure_review','select public.request_maintenance_closure_review($1,$2,$3,$4) value',[recipient,rs,re,f.submission],v=>assert.equal(v.reviewRequestID,f.input.reviewRequestID),/Current app session required/),
   make('can_dispatch_maintenance_push_test','select public.can_dispatch_maintenance_push_test($1,$2) value',[recipient,endpoint],v=>assert.equal(v,true),false),
   make('claim_maintenance_push_test','select row_to_json(x) value from public.claim_maintenance_push_test($1,$2) x',[recipient,endpoint],v=>assert.equal(v.endpoint,endpoint),/App account closed/),
   make('record_maintenance_verified_notification','select public.record_maintenance_verified_notification($1::jsonb,$2) value',[{environment:'Sandbox',notificationId:randomUUID(),notificationType:'SUBSCRIBED',signedAt:now,disposition:'transaction_applied',accountToken:re,originalTransactionId:transaction.originalTransactionId},'e'.repeat(64)],v=>assert.equal(v,'inserted'),'retired'),
   make('commit_maintenance_attested_registration','select public.commit_maintenance_attested_registration($1,$2,$3,$4,$5,$6,$7,$8,$9) value',[challenge.requestID,recipient,rs,re,challenge.keyID,registrationClientDataHash(challenge).toString('hex'),'d'.repeat(64),verifiedPublicKey,Buffer.from('synthetic-verified-attestation-receipt')],v=>assert.equal(v,true),false)
  ];
  for(const c of cases){const v=await scalar(db,c.sql,c.args);c.positive(v);c.positiveObserved=true;c.result=v;}
  for(const [name,id,extra] of [['disable_maintenance_native_push',cases[4].result,[]],['disable_maintenance_native_scoped_push',cases[5].result,['Sandbox','Sandbox']]]){
   const c=make(name,`select public.${name}(${Array.from({length:4+extra.length},(_,i)=>'$'+(i+1)).join(',')}) value`,[recipient,rs,re,id,...extra],v=>assert.equal(v,true),false);
   c.positive(await scalar(db,c.sql,c.args));c.positiveObserved=true;cases.push(c);
  }
 }});
 try{
  await f.retire.execute(f.execute,f.signal);const baseline=await snapshot(f.db);
  for(const c of cases)await t.test(c.name,async()=>{
   assert.equal(c.positiveObserved,true,'the identical valid input passed before closure');
   const catalog=(await f.db.query("select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[c.name])).rows;
   assert.equal(catalog.length,1);assert.equal(catalog[0].prosecdef,false);assert.ok(catalog[0].proconfig.includes('search_path=""'));assert.equal(catalog[0].anon,false);assert.equal(catalog[0].authenticated,false);assert.equal(catalog[0].service,true);
   if(c.closed instanceof RegExp)await assert.rejects(scalar(f.db,c.sql,c.args),c.closed);else assert.equal(await scalar(f.db,c.sql,c.args),c.closed);
   assert.deepEqual(await snapshot(f.db),baseline,'no app/private/Auth row may change');
  });
  await t.test('late trusted transaction cannot create new period or owner; an existing refund is retained without restoring access',async()=>{
   for(const change of [{transactionId:'synthetic-late-new-period'}, {transactionId:'synthetic-late-new-owner-period',originalTransactionId:'synthetic-late-new-owner'}]){
    assert.equal(await scalar(f.db,'select public.apply_maintenance_verified_transaction($1::jsonb,$2) value',[{...transaction,...change,signedAt:transaction.signedAt+1},'a'.repeat(64)]),'retired');assert.deepEqual(await snapshot(f.db),baseline);
   }
   assert.equal(await scalar(f.db,'select public.apply_maintenance_verified_transaction($1::jsonb,$2) value',[{...transaction,signedAt:transaction.signedAt+2,revokedAt:transaction.signedAt+1},'b'.repeat(64)]),'updated');
   const after=await snapshot(f.db);assert.notEqual(after['maintenance_private.verified_transactions'],baseline['maintenance_private.verified_transactions']);delete after['maintenance_private.verified_transactions'];const expected={...baseline};delete expected['maintenance_private.verified_transactions'];assert.deepEqual(after,expected);
   assert.equal(await scalar(f.db,'select public.current_maintenance_purchase_account($1,$2) value',[recipient,rs]),null);
  });
  await t.test('remaining family keeps exact original enrollment and Auth sessions remain untouched',async()=>{
   assert.equal(await scalar(f.db,'select public.current_maintenance_purchase_account($1,$2) value',[owner,os]),oe);
   assert.equal((await f.db.query('select count(*)::int n from auth.sessions where id in ($1,$2)',[rs,os])).rows[0].n,2);
  });
 }finally{await f.db.close();}
});
