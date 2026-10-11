import {createHash,X509Certificate} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {sessionAfterAuthVerification} from './verified-app-session';
import {readBillingBody} from './billing-body';
import {createRegistrationChallenge,registrationClientData,registrationClientDataHash,type RegistrationChallenge} from './billing-app-attest-registration-challenge';
import {verifyStoredRegistrationChallengeProofs} from './billing-app-attest-prerequisites';
import type {AttestBuildPolicy} from './billing-app-attest-assertion';

export type AttestRegistrationConfiguration={url:string;key:string;appID:string;attestEnvironment:'development'|'production';policy:AttestBuildPolicy;privateRootPEM:string;publicRootDER:Buffer};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validID=(v:unknown):v is string=>typeof v==='string'&&uuid.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
/** Explicit gate; no native/UI or route activation is included. Root pins are
 * independent of the caller's configuration and are also checked by verifiers.
 */
export function attestRegistrationConfiguration(value:AttestRegistrationConfiguration|null,enabled:string|undefined):Readonly<AttestRegistrationConfiguration>|null{
 if(enabled!=='true'||!value?.key)return null;
 try{
  const url=new URL(value.url),p=value.policy;
  if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.hostname==='.supabase.co'||url.pathname!=='/'||url.port||url.username||url.password||url.search||url.hash
  ||!/^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]{1,200}$/.test(value.appID)||!['development','production'].includes(value.attestEnvironment)
  ||!p||!Array.isArray(p.validationCategories)||!p.validationCategories.length||p.validationCategories.length>3||p.validationCategories.some(c=>!Number.isInteger(c)||!(value.attestEnvironment==='development'?[3]:[2,4]).includes(c))
  ||!Array.isArray(p.bundleVersions)||!p.bundleVersions.length||p.bundleVersions.length>64||p.bundleVersions.some(v=>typeof v!=='string'||v.length>64||!/^[0-9]+(?:\.[0-9]+){0,2}$/.test(v))
  ||typeof value.privateRootPEM!=='string'||value.privateRootPEM.length>8192||!Buffer.isBuffer(value.publicRootDER)||value.publicRootDER.length>8192)return null;
  if(createHash('sha256').update(new X509Certificate(value.privateRootPEM).raw).digest('hex')!=='1cb9823ba28ba6ad2d33a006941de2ae4f513ef1d4e831b9f7e0fa7b6242c932'
  ||createHash('sha256').update(new X509Certificate(value.publicRootDER).raw).digest('hex')!=='63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179')return null;
  return Object.freeze({...value,publicRootDER:Buffer.from(value.publicRootDER),policy:Object.freeze({validationCategories:Object.freeze([...p.validationCategories]),bundleVersions:Object.freeze([...p.bundleVersions])})});
 }catch{return null;}
}
/** Real Apple verifier is hardwired; no injectable success flag. The server
 * reads the challenge via scoped RPC, derives its hash/scope and commits the
 * verified key/receipt atomically. An acknowledgement grants no purchase right.
 */
export async function appAttestRegistrationResponse(request:Request,operation:'challenge'|'commit',config:Readonly<AttestRegistrationConfiguration>|null,factory:(config:Readonly<AttestRegistrationConfiguration>,signal:AbortSignal)=>SupabaseClient){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status:number)=>Response.json({error:'端末の登録結果を確認できません。最新の状態を確認してください。'},{status,headers});
 config=attestRegistrationConfiguration(config,'true');if(!config)return fail(503);
 if(request.method!=='POST')return fail(405);if(!['challenge','commit'].includes(operation)||new URL(request.url).search)return fail(400);
 const authorization=request.headers.get('authorization'),epoch=request.headers.get('X-Ouchi-App-Epoch');
 if(!authorization||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return fail(401);if(!validID(epoch))return fail(400);
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail(415);
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);
 try{
  signal.throwIfAborted();let body:Record<string,unknown>;
  try{body=await readBillingBody(new Request(request,{signal}),operation==='challenge'?4096:262144);}catch{return fail(400);}
  if(Object.keys(body).sort().join(',')!==(operation==='challenge'?'keyID,requestID':'attestationBase64,keyID,requestID')||!validID(body.requestID)||typeof body.keyID!=='string')return fail(400);
  const db=factory(config,signal),bearer=authorization.slice(7);
  const verify=async()=>{
   const user=await db.auth.getUser(bearer);signal.throwIfAborted();if(user.error||!user.data.user)throw Error('App Attest Auth unavailable');
   const identity=sessionAfterAuthVerification(bearer,user.data.user.id);if(!identity)throw Error('App Attest session unavailable');
   const live=await db.rpc('read_maintenance_explicit_enrollment',{target_user:identity.userID,verified_session:identity.sessionID});signal.throwIfAborted();
   if(live.error||live.data!==epoch)throw Error('App Attest enrollment changed');return Object.freeze(identity);
  };
  const identity=await verify();
  const expected={...identity,epochID:epoch,requestID:body.requestID,keyID:body.keyID,appID:config.appID,attestEnvironment:config.attestEnvironment};
  // Constructor validates identity/key/config shape before any issuing write.
  let fresh:RegistrationChallenge;try{fresh=createRegistrationChallenge(expected);}catch{return fail(400);}
  const unchanged=async()=>{signal.throwIfAborted();const current=await verify();if(current.userID!==identity.userID||current.sessionID!==identity.sessionID)throw Error('App Attest Auth changed');};
  if(operation==='challenge'){
   await unchanged();const result=await db.rpc('issue_maintenance_attest_registration_challenge',{payload:fresh,client_hash:registrationClientDataHash(fresh).toString('hex')});signal.throwIfAborted();
   if(result.error||!result.data)return fail(409);const stored=result.data as RegistrationChallenge;
   for(const [key,value] of Object.entries(expected))if(stored[key as keyof RegistrationChallenge]!==value)throw Error('Stored registration scope mismatch');
   const bytes=registrationClientData(stored);await unchanged();return Response.json({clientDataBase64:bytes.toString('base64')},{headers});
  }
  const encoded=body.attestationBase64;if(typeof encoded!=='string'||encoded.length<4||encoded.length>174764||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return fail(400);
  const attestation=Buffer.from(encoded,'base64');if(attestation.length<1||attestation.length>131072||attestation.toString('base64')!==encoded)return fail(400);
  const storedResult=await db.rpc('read_maintenance_attest_registration_challenge',{target_request:body.requestID,target_user:identity.userID,verified_session:identity.sessionID,target_epoch:epoch,target_key:body.keyID});signal.throwIfAborted();
  if(storedResult.error||!storedResult.data)return fail(409);const stored=storedResult.data as RegistrationChallenge;
  for(const [key,value] of Object.entries(expected))if(stored[key as keyof RegistrationChallenge]!==value)throw Error('Stored registration scope mismatch');
  const hash=registrationClientDataHash(stored);await unchanged();
  let proof:ReturnType<typeof verifyStoredRegistrationChallengeProofs>;
  try{proof=verifyStoredRegistrationChallengeProofs(attestation,stored,config.policy,config.privateRootPEM,config.publicRootDER);}catch{return fail(422);}
  signal.throwIfAborted();await unchanged();
  const committed=await db.rpc('commit_maintenance_attested_registration',{target_request:stored.requestID,target_user:stored.userID,verified_session:stored.sessionID,target_epoch:stored.epochID,target_key:stored.keyID,verified_client_hash:hash.toString('hex'),verified_attestation_hash:createHash('sha256').update(attestation).digest('hex'),verified_public_key:'\\x'+proof.prerequisites.certificate.publicKeyX962.toString('hex'),verified_receipt:'\\x'+proof.prerequisites.receiptToVerify.toString('hex')});signal.throwIfAborted();
  if(committed.error||committed.data!==true)return fail(409);await unchanged();registrationClientData(stored);
  return Response.json({requestID:stored.requestID,userID:stored.userID,sessionID:stored.sessionID,epochID:stored.epochID,keyID:stored.keyID,appID:stored.appID,attestEnvironment:stored.attestEnvironment,registered:true},{headers});
 }catch{return fail(503);}
}
