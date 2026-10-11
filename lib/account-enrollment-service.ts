import type {SupabaseClient} from '@supabase/supabase-js';
import {sessionAfterAuthVerification} from './verified-app-session';
import {readBillingBody} from './billing-body';
export type EnrollmentConfiguration={url:string;key:string;publishableKey:string};
export function enrollmentConfiguration(value:EnrollmentConfiguration|null,enabled:string|undefined){
 if(enabled!=='true'||!value?.key||!value.publishableKey)return null;
 try{const url=new URL(value.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.hostname==='.supabase.co'||url.pathname!=='/'||url.port||url.username||url.password||url.search||url.hash)return null;return Object.freeze({...value});}catch{return null;}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validID=(v:unknown):v is string=>typeof v==='string'&&uuid.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
/** Free, explicit consent only. No purchase mutation or shared Auth deletion.
 * Temporary Auth must use an independent bounded logout transport after abort.
 */
export async function accountEnrollmentResponse(request:Request,config:EnrollmentConfiguration|null,factories:{database:(config:EnrollmentConfiguration,signal:AbortSignal)=>SupabaseClient;temporaryAuth:(config:EnrollmentConfiguration,signal:AbortSignal)=>SupabaseClient}){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status:number)=>Response.json({error:'登録結果を確認できません。最新の状態を確認してください。'},{status,headers});
 if(!config)return fail(503);config=Object.freeze({...config});
 if(!['GET','POST'].includes(request.method))return fail(405);if(new URL(request.url).search)return fail(400);
 const authorization=request.headers.get('authorization');if(!authorization||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return fail(401);
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);let temporary:SupabaseClient|undefined,cleanupDone=false;
 try{
  signal.throwIfAborted();let input:{password:string;requestID:string}|undefined;
  if(request.method==='POST'){
   if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(415);
   let body:Record<string,unknown>;try{body=await readBillingBody(new Request(request,{signal}));}catch{return fail(400);}
   if(Object.keys(body).sort().join(',')!=='confirmation,password,requestID'||body.confirmation!=='ENROLL_OUCHI_MAINTENANCE'||!validID(body.requestID)||typeof body.password!=='string'||body.password.length<1||body.password.length>1024)return fail(400);
   input={password:body.password,requestID:body.requestID.toLowerCase()};
  }
  const db=factories.database(config,signal),bearer=authorization.slice(7);
  const verify=async()=>{const result=await db.auth.getUser(bearer);signal.throwIfAborted();if(result.error||!result.data.user?.email)throw Error('Enrollment Auth unavailable');const identity=sessionAfterAuthVerification(bearer,result.data.user.id);if(!identity)throw Error('Enrollment session unavailable');const live=await db.rpc('maintenance_auth_session_is_current',{target_user:identity.userID,verified_session:identity.sessionID});signal.throwIfAborted();if(live.error||live.data!==true)throw Error('Enrollment session changed');return Object.freeze({...identity,email:result.data.user.email});};
  const identity=await verify(),policy=await db.rpc('maintenance_explicit_enrollment_is_required');signal.throwIfAborted();if(policy.error||policy.data!==true)return fail(503);
  const unchanged=async()=>{const current=await verify();if(current.userID!==identity.userID||current.sessionID!==identity.sessionID||current.email!==identity.email)throw Error('Enrollment Auth changed');const policy=await db.rpc('maintenance_explicit_enrollment_is_required');signal.throwIfAborted();if(policy.error||policy.data!==true)throw Error('Enrollment policy changed');};
  if(!input){const result=await db.rpc('read_maintenance_explicit_enrollment',{target_user:identity.userID,verified_session:identity.sessionID});signal.throwIfAborted();if(result.error||result.data!==null&&!validID(result.data))throw Error('Invalid enrollment state');const epoch=result.data as string|null;await unchanged();return Response.json({userID:identity.userID,sessionID:identity.sessionID,epochID:epoch?.toLowerCase()??null,enrolled:epoch!==null},{headers});}
  temporary=factories.temporaryAuth(config,signal);
  const login=await temporary.auth.signInWithPassword({email:identity.email,password:input.password});signal.throwIfAborted();
  if(login.error||!login.data.user||!login.data.session)throw Error('Reauthentication required');
  const token=login.data.session.access_token,verified=await db.auth.getUser(token);signal.throwIfAborted();
  if(verified.error||verified.data.user?.id!==identity.userID||login.data.user.id!==identity.userID)throw Error('Reauthentication mismatch');
  const proof=sessionAfterAuthVerification(token,identity.userID);if(!proof||proof.sessionID===identity.sessionID)throw Error('Fresh reauthentication required');
  await unchanged();
  const result=await db.rpc('enroll_maintenance_app_with_consent',{target_user:identity.userID,verified_session:identity.sessionID,reauthenticated_session:proof.sessionID,target_request:input.requestID});signal.throwIfAborted();
  const value=result.data;if(result.error||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='epochID,requestID,sessionID,userID'||value.userID!==identity.userID||value.sessionID!==identity.sessionID||value.requestID!==input.requestID||!validID(value.epochID))throw Error('Enrollment acknowledgement unavailable');
  const receipt=Object.freeze({userID:identity.userID,sessionID:identity.sessionID,requestID:input.requestID,epochID:value.epochID.toLowerCase()});
  const cleanup=await temporary.auth.signOut({scope:'local'});cleanupDone=!cleanup.error;if(!cleanupDone)throw Error('Temporary authentication cleanup failed');
  await unchanged();return Response.json(receipt,{headers});
 }catch{return fail(503);}finally{
  // Sign-out uses only this temporary session; never revoke the owner's session
  // or global sessions. A failure stays unconfirmed and requires fresh status.
  if(temporary&&!cleanupDone){try{await temporary.auth.signOut({scope:'local'});}catch{/* no personal payload or credentials logged */}}
 }
}
