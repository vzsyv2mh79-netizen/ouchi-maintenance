import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {billingConfiguration,verifyBillingStoreAccountPair} from './billing-server';
import {sessionAfterAuthVerification} from './verified-app-session';
import {readBillingBody} from './billing-body';
import {createRestoreChallenge,restoreAssertionClientData,type RestoreChallenge} from './billing-restore-client-data';
import type {AttestRegistrationConfiguration} from './billing-app-attest-registration-service';

export type RestoreChallengeConfiguration={billing:NonNullable<ReturnType<typeof billingConfiguration>>;attest:Readonly<AttestRegistrationConfiguration>};
const validID=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
/** Apple verifier is hardwired. This issues a nonce only; it never consumes an
 * assertion, dispatches Apple updates or grants ownership/paid entitlement.
 */
export async function restoreChallengeResponse(request:Request,config:Readonly<RestoreChallengeConfiguration>|null,factory:(config:Readonly<RestoreChallengeConfiguration>,signal:AbortSignal)=>SupabaseClient){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status:number)=>Response.json({error:'購入復元の確認情報を取得できません。最新の状態を確認してください。'},{status,headers});
 if(!config||config.billing.environment!=='Sandbox'||config.billing.storage!=='verified-ledger'||config.attest.appID.split('.').slice(1).join('.')!==config.billing.bundleId)return fail(503);
 if(request.method!=='POST')return fail(405);if(new URL(request.url).search)return fail(400);
 const authorization=request.headers.get('authorization'),epoch=request.headers.get('X-Ouchi-App-Epoch');
 if(!authorization||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return fail(401);if(!validID(epoch))return fail(400);
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(415);
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);
 try{
  signal.throwIfAborted();let body:Record<string,unknown>;
  try{body=await readBillingBody(new Request(request,{signal}),262144);}catch{return fail(400);}
  if(Object.keys(body).sort().join(',')!=='keyID,requestID,signedAppTransaction,signedTransaction'||!validID(body.requestID)||typeof body.keyID!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(body.keyID)||Buffer.from(body.keyID,'base64').length!==32||Buffer.from(body.keyID,'base64').toString('base64')!==body.keyID)return fail(400);
  for(const name of ['signedAppTransaction','signedTransaction'])if(typeof body[name]!=='string'||!body[name]||Buffer.byteLength(body[name] as string)>131072)return fail(400);
  const db=factory(config,signal),bearer=authorization.slice(7);
  const verify=async()=>{
   const user=await db.auth.getUser(bearer);signal.throwIfAborted();if(user.error||!user.data.user)throw Error('Restore Auth unavailable');
   const identity=sessionAfterAuthVerification(bearer,user.data.user.id);if(!identity)throw Error('Restore session unavailable');
   const live=await db.rpc('read_maintenance_explicit_enrollment',{target_user:identity.userID,verified_session:identity.sessionID});signal.throwIfAborted();
   if(live.error||live.data!==epoch)throw Error('Restore enrollment changed');return identity;
  };
  const identity=await verify();
  const unchanged=async()=>{const current=await verify();if(current.userID!==identity.userID||current.sessionID!==identity.sessionID)throw Error('Restore Auth changed');};
  const key=await db.rpc('read_maintenance_restore_key',{target_user:identity.userID,verified_session:identity.sessionID,target_epoch:epoch,target_key:body.keyID,expected_app:config.attest.appID,expected_attest_environment:config.attest.attestEnvironment});signal.throwIfAborted();
  const stored=key.data as Record<string,unknown>|null;
  if(key.error||!stored||typeof stored!=='object'||Array.isArray(stored)||Object.keys(stored).sort().join(',')!=='appID,attestEnvironment,counter,epochID,keyID,publicKeyHex,userID'||stored.userID!==identity.userID||stored.epochID!==epoch||stored.keyID!==body.keyID||stored.appID!==config.attest.appID||stored.attestEnvironment!==config.attest.attestEnvironment||typeof stored.publicKeyHex!=='string'||!/^04[0-9a-f]{128}$/.test(stored.publicKeyHex)||!Number.isInteger(stored.counter)||(stored.counter as number)<0||(stored.counter as number)>=0xffffffff||createHash('sha256').update(Buffer.from(stored.publicKeyHex,'hex')).digest('base64')!==body.keyID)return fail(409);
  await unchanged();
  let pair:Awaited<ReturnType<typeof verifyBillingStoreAccountPair>>;
  try{pair=await verifyBillingStoreAccountPair(body.signedAppTransaction as string,body.signedTransaction as string,config.billing);}catch{return fail(422);}
  signal.throwIfAborted();
  const transaction=pair.transaction;
  if(transaction.environment!=='Sandbox'||transaction.revokedAt!==undefined||transaction.isUpgraded||!transaction.expiresAt||transaction.expiresAt<=Date.now()||!/^[1-9][0-9]{0,127}$/.test(pair.appTransactionId)||transaction.accountToken===epoch||!/^[1-9][0-9]{0,127}$/.test(transaction.originalTransactionId))return fail(409);
  const expected={...identity,epochID:epoch,requestID:body.requestID,keyID:body.keyID,appID:config.attest.appID,attestEnvironment:config.attest.attestEnvironment,purchaseEnvironment:'Sandbox' as const,proofSHA256:pair.proofSHA256};
  const fresh=createRestoreChallenge(expected);const bytes=restoreAssertionClientData(fresh);
  await unchanged();
  const issued=await db.rpc('issue_maintenance_restore_challenge',{payload:fresh,client_hash:createHash('sha256').update(bytes).digest('hex')});signal.throwIfAborted();
  if(issued.error||!issued.data)return fail(409);const challenge=issued.data as RestoreChallenge;
  for(const [key,value] of Object.entries(expected))if(challenge[key as keyof RestoreChallenge]!==value)throw Error('Stored restore scope mismatch');
  await unchanged();const canonical=restoreAssertionClientData(challenge);
  return Response.json({clientDataBase64:canonical.toString('base64')},{headers});
 }catch{return fail(503);}
}
