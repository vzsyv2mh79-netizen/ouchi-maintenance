import {createHash,randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {verifyBillingStoreAccountPair} from './billing-server';
import {sessionAfterAuthVerification} from './verified-app-session';
import {readBillingBody} from './billing-body';
import {restoreAssertionClientData,type RestoreChallenge} from './billing-restore-client-data';
import {verifyRestoreAppAttestAssertion,type AttestBuildPolicy,type StoredAttestedKey} from './billing-app-attest-assertion';
import type {RestoreChallengeConfiguration} from './billing-restore-challenge-service';

export type RestoreCommitConfiguration=RestoreChallengeConfiguration & {buildPolicy:AttestBuildPolicy};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** Trusted server composition. Both Apple verifications and App Attest crypto
 * are hardwired. The SQL enqueue alone consumes nonce/counter and reserves the
 * job atomically. A pending response never grants rights or invokes Apple PUT.
 * Lost acknowledgements require scoped durable job recovery, not blind retry.
 */
export async function restoreCommitResponse(request:Request,config:Readonly<RestoreCommitConfiguration>|null,factory:(config:Readonly<RestoreCommitConfiguration>,signal:AbortSignal)=>SupabaseClient){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status:number)=>Response.json({error:'購入復元を確定できません。保存された処理状況を確認してください。'},{status,headers});
 if(!config||config.billing.environment!=='Sandbox'||config.billing.storage!=='verified-ledger'||config.attest.appID.split('.').slice(1).join('.')!==config.billing.bundleId)return fail(503);
 if(request.method!=='POST')return fail(405);if(new URL(request.url).search)return fail(400);
 const authorization=request.headers.get('authorization'),epoch=request.headers.get('X-Ouchi-App-Epoch');
 if(!authorization||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return fail(401);if(!id(epoch))return fail(400);
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(415);
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);
 try{
  signal.throwIfAborted();let body:Record<string,unknown>;
  try{body=await readBillingBody(new Request(request,{signal}),262144);}catch{return fail(400);}
  if(Object.keys(body).sort().join(',')!=='assertionBase64,keyID,requestID,signedAppTransaction,signedTransaction'||!id(body.requestID)||typeof body.keyID!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(body.keyID)||Buffer.from(body.keyID,'base64').toString('base64')!==body.keyID)return fail(400);
  for(const name of ['signedAppTransaction','signedTransaction'])if(typeof body[name]!=='string'||!body[name]||Buffer.byteLength(body[name] as string)>131072)return fail(400);
  if(typeof body.assertionBase64!=='string'||body.assertionBase64.length>174764)return fail(400);
  const assertion=Buffer.from(body.assertionBase64,'base64');
  if(!assertion.length||assertion.length>131072||assertion.toString('base64')!==body.assertionBase64)return fail(400);
  const db=factory(config,signal),bearer=authorization.slice(7);
  const verify=async()=>{
   const user=await db.auth.getUser(bearer);signal.throwIfAborted();if(user.error||!user.data.user)throw Error('Restore Auth unavailable');
   const identity=sessionAfterAuthVerification(bearer,user.data.user.id);if(!identity)throw Error('Restore session unavailable');
   const live=await db.rpc('read_maintenance_explicit_enrollment',{target_user:identity.userID,verified_session:identity.sessionID});signal.throwIfAborted();
   if(live.error||live.data!==epoch)throw Error('Restore enrollment changed');return identity;
  };
  const identity=await verify();
  const unchanged=async()=>{const current=await verify();if(current.userID!==identity.userID||current.sessionID!==identity.sessionID)throw Error('Restore Auth changed');};
  let pair:Awaited<ReturnType<typeof verifyBillingStoreAccountPair>>;
  try{pair=await verifyBillingStoreAccountPair(body.signedAppTransaction as string,body.signedTransaction as string,config.billing);}catch{return fail(422);}
  signal.throwIfAborted();const transaction=pair.transaction;
  if(transaction.environment!=='Sandbox'||transaction.revokedAt!==undefined||transaction.isUpgraded||!transaction.expiresAt||transaction.expiresAt<=Date.now()||!/^[1-9][0-9]{0,127}$/.test(pair.appTransactionId)||transaction.accountToken===epoch||!/^[1-9][0-9]{0,127}$/.test(transaction.originalTransactionId))return fail(409);
  await unchanged();
  const context=await db.rpc('read_maintenance_restore_verification_context',{target_request:body.requestID,target_user:identity.userID,verified_session:identity.sessionID,target_epoch:epoch,target_key:body.keyID,expected_app:config.attest.appID,expected_attest_environment:config.attest.attestEnvironment,verified_pair_hash:pair.proofSHA256});signal.throwIfAborted();
  const data=context.data;
  if(context.error||!object(data)||Object.keys(data).sort().join(',')!=='challenge,clientDataSHA256,key'||!object(data.key)||Object.keys(data.key).sort().join(',')!=='appID,attestEnvironment,counter,epochID,keyID,publicKeyHex,userID'||!object(data.challenge))return fail(409);
  const key=data.key,challenge=data.challenge as RestoreChallenge;
  const expected={...identity,epochID:epoch,requestID:body.requestID,keyID:body.keyID,appID:config.attest.appID,attestEnvironment:config.attest.attestEnvironment,purchaseEnvironment:'Sandbox',proofSHA256:pair.proofSHA256};
  for(const [name,value] of Object.entries(expected))if(challenge[name as keyof RestoreChallenge]!==value)return fail(409);
  if(key.userID!==identity.userID||key.epochID!==epoch||key.keyID!==body.keyID||key.appID!==config.attest.appID||key.attestEnvironment!==config.attest.attestEnvironment||typeof key.publicKeyHex!=='string'||!/^04[0-9a-f]{128}$/.test(key.publicKeyHex)||typeof data.clientDataSHA256!=='string'||createHash('sha256').update(restoreAssertionClientData(challenge)).digest('hex')!==data.clientDataSHA256)return fail(409);
  const stored:StoredAttestedKey={userID:identity.userID,epochID:epoch,keyID:body.keyID,appID:config.attest.appID,attestEnvironment:config.attest.attestEnvironment,publicKeyX962:Buffer.from(key.publicKeyHex,'hex'),counter:key.counter as number};
  let proof:ReturnType<typeof verifyRestoreAppAttestAssertion>;
  try{proof=verifyRestoreAppAttestAssertion(assertion,stored,challenge,config.buildPolicy);}catch{return fail(422);}
  await unchanged();signal.throwIfAborted();
  restoreAssertionClientData(challenge);
  if(transaction.expiresAt<=Date.now())return fail(409);
  const enqueued=await db.rpc('enqueue_maintenance_restore_transfer',{target_request:body.requestID,target_user:identity.userID,verified_session:identity.sessionID,target_epoch:epoch,target_key:body.keyID,expected_counter:proof.previousCounter,verified_counter:proof.counter,verified_client_hash:proof.clientDataSHA256,verified_assertion_hash:proof.assertionSHA256,verified_pair_hash:pair.proofSHA256,original_tx:transaction.originalTransactionId,store_app_tx:pair.appTransactionId,prior_account_token:transaction.accountToken,bundle_id:config.billing.bundleId,lease_token:randomUUID()});signal.throwIfAborted();
  if(enqueued.error||enqueued.data!==body.requestID)return fail(409);
  await unchanged();
  return Response.json({requestID:body.requestID,status:'pending'},{status:202,headers});
 }catch{return fail(503);}
}
