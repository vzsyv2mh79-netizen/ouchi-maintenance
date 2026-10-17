import type {SupabaseClient} from '@supabase/supabase-js';
import type {RestoreChallengeConfiguration} from './billing-restore-challenge-service';
import {sessionAfterAuthVerification} from './verified-app-session';
import {readBillingBody} from './billing-body';
const id=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const keyID=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(v)&&Buffer.from(v,'base64').toString('base64')===v;
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
/** Cancels only a stored, scoped, unconsumed nonce with no transfer job. The
 * atomic database receipt is the only positive acknowledgement; missing state
 * is unknown and must not authorize proof erasure or a fresh reservation. */
export async function restoreCancelResponse(request:Request,config:Readonly<RestoreChallengeConfiguration>|null,factory:(config:Readonly<RestoreChallengeConfiguration>,signal:AbortSignal)=>SupabaseClient){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status:number)=>Response.json({error:'復元の再開準備を確認できません。保存された情報を残して、時間をおいて再確認してください。'},{status,headers});
 if(!config||config.billing.environment!=='Sandbox'||config.billing.storage!=='verified-ledger'||config.attest.appID.split('.').slice(1).join('.')!==config.billing.bundleId)return fail(503);
 if(request.method!=='POST')return fail(405);if(new URL(request.url).search)return fail(400);
 const authorization=request.headers.get('authorization'),epoch=request.headers.get('X-Ouchi-App-Epoch');
 if(!authorization||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return fail(401);if(!id(epoch))return fail(400);
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(415);
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(15000)]);
 try{
  signal.throwIfAborted();let body:Record<string,unknown>;
  try{body=await readBillingBody(new Request(request,{signal}),1024);}catch{return fail(400);}
  if(Object.keys(body).sort().join(',')!=='assertionSHA256,keyID,pairSHA256,requestID'||!keyID(body.keyID)||!id(body.requestID)||!digest(body.pairSHA256)||!digest(body.assertionSHA256))return fail(400);
  const db=factory(config,signal),bearer=authorization.slice(7);
  const verify=async()=>{
   const user=await db.auth.getUser(bearer);signal.throwIfAborted();if(user.error||!user.data.user)throw Error('Restore Auth unavailable');
   const identity=sessionAfterAuthVerification(bearer,user.data.user.id);if(!identity)throw Error('Restore session unavailable');
   const live=await db.rpc('read_maintenance_explicit_enrollment',{target_user:identity.userID,verified_session:identity.sessionID});signal.throwIfAborted();
   if(live.error||live.data!==epoch)throw Error('Restore enrollment changed');return identity;
  };
  const identity=await verify();
  const result=await db.rpc('cancel_maintenance_unreserved_restore',{target_request:body.requestID,target_user:identity.userID,verified_session:identity.sessionID,target_epoch:epoch,target_key:body.keyID,expected_app:config.attest.appID,expected_attest_environment:config.attest.attestEnvironment,verified_pair_hash:body.pairSHA256,verified_assertion_hash:body.assertionSHA256});signal.throwIfAborted();
  const data=result.data;
  if(result.error||!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).sort().join(',')!=='assertionSHA256,pairSHA256,requestID,status'||data.requestID!==body.requestID||data.status!=='cancelled'||data.pairSHA256!==body.pairSHA256||data.assertionSHA256!==body.assertionSHA256)return fail(409);
  const current=await verify();if(current.userID!==identity.userID||current.sessionID!==identity.sessionID)return fail(503);
  return Response.json({requestID:body.requestID,status:'cancelled',pairSHA256:body.pairSHA256,assertionSHA256:body.assertionSHA256},{headers});
 }catch{return fail(503);}
}
