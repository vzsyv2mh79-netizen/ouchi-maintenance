import type {SupabaseClient} from '@supabase/supabase-js';
import type {RestoreChallengeConfiguration} from './billing-restore-challenge-service';
import {sessionAfterAuthVerification} from './verified-app-session';
import {readBillingBody} from './billing-body';
import {runRestoreTransfer,assertRestoreTransferJob,type RestoreTransferJob,type RestoreTransferDependencies} from './billing-restore-transfer-worker';
import {createRestoreTransferStore} from './billing-restore-transfer-store';
const id=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
type Apple=Pick<RestoreTransferDependencies,'readCurrent'|'setToken'>;
/** Only a matching live service-ledger claim dispatches the hardwired worker.
 * Job, lease, Apple IDs/tokens never come from request JSON or leave this route.
 */
export async function restoreProcessResponse(request:Request,config:Readonly<RestoreChallengeConfiguration>|null,
 factory:(config:Readonly<RestoreChallengeConfiguration>,signal:AbortSignal)=>SupabaseClient,
 appleFactory:(config:Readonly<RestoreChallengeConfiguration>,signal:AbortSignal)=>Apple|null){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status:number)=>Response.json({error:'復元を完了できません。保存された情報を残して、時間をおいて状況を確認してください。'},{status,headers});
 if(!config||config.billing.environment!=='Sandbox'||config.billing.storage!=='verified-ledger'||config.attest.appID.split('.').slice(1).join('.')!==config.billing.bundleId)return fail(503);
 if(request.method!=='POST')return fail(405);if(new URL(request.url).search)return fail(400);
 const authorization=request.headers.get('authorization'),epoch=request.headers.get('X-Ouchi-App-Epoch');
 if(!authorization||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return fail(401);if(!id(epoch))return fail(400);
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(415);
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(55000)]);
 try{
  signal.throwIfAborted();let body:Record<string,unknown>;
  try{body=await readBillingBody(new Request(request,{signal}),1024);}catch{return fail(400);}
  if(Object.keys(body).sort().join(',')!=='assertionSHA256,pairSHA256,requestID'||!id(body.requestID)||!digest(body.pairSHA256)||!digest(body.assertionSHA256))return fail(400);
  const db=factory(config,signal),bearer=authorization.slice(7);
  const verify=async()=>{
   const user=await db.auth.getUser(bearer);signal.throwIfAborted();if(user.error||!user.data.user)throw Error('Restore Auth unavailable');
   const identity=sessionAfterAuthVerification(bearer,user.data.user.id);if(!identity)throw Error('Restore session unavailable');
   const live=await db.rpc('read_maintenance_explicit_enrollment',{target_user:identity.userID,verified_session:identity.sessionID});signal.throwIfAborted();
   if(live.error||live.data!==epoch)throw Error('Restore enrollment changed');return identity;
  };
  const identity=await verify();
  const claimed=await db.rpc('claim_maintenance_restore_transfer',{target_request:body.requestID,target_user:identity.userID,verified_session:identity.sessionID,target_epoch:epoch,expected_bundle:config.billing.bundleId,verified_pair_hash:body.pairSHA256,verified_assertion_hash:body.assertionSHA256});signal.throwIfAborted();
  const data=claimed.data;
  if(claimed.error||!data||typeof data!=='object'||Array.isArray(data))return fail(409);
  let status:'pending'|'complete';
  if(['pending','complete'].includes(data.status)&&Object.keys(data).join(',')==='status')status=data.status;
  else if(data.status==='claimed'&&Object.keys(data).sort().join(',')==='job,status'){
   const job=data.job as RestoreTransferJob;assertRestoreTransferJob(job);
   const keys=['appTransactionID','authorizedAt','bundleID','environment','epochID','id','lease','originalTransactionID','phase','previousAccountToken','sessionID','userID'];if(job.phase==='update_started')keys.push('mutationStartedAt');
   if(Object.keys(job).sort().join(',')!==keys.sort().join(',')||job.id!==body.requestID||job.userID!==identity.userID||job.sessionID!==identity.sessionID||job.epochID!==epoch||job.bundleID!==config.billing.bundleId)return fail(409);
   const current=await verify();if(current.userID!==identity.userID||current.sessionID!==identity.sessionID)return fail(503);
   const apple=appleFactory(config,signal);if(!apple)return fail(503);
   const result=await runRestoreTransfer(job,{store:createRestoreTransferStore(async(name,args)=>await db.rpc(name,args)),...apple},signal);
   signal.throwIfAborted();status=result.state;
  }else return fail(409);
  const current=await verify();if(current.userID!==identity.userID||current.sessionID!==identity.sessionID)return fail(503);
  // Current premium is always a separate verified-ledger entitlement request.
  return Response.json({requestID:body.requestID,status},{headers});
 }catch{return fail(503);}
}
