import type {SupabaseClient} from '@supabase/supabase-js';
import type {BillingEnvironment} from './billing';
import type {APNsEnvironment} from './apns-maintenance';
import {attachmentDeployment} from './attachment-service-handler';
import {validAttachmentEpoch} from './attachment-epoch';
import {sessionAfterAuthVerification} from './verified-app-session';
import {readBillingBody} from './billing-body';
type Deployment={url:string;key:string;environment:BillingEnvironment;storage:string;pushEnvironment:APNsEnvironment};
export function nativePushDeployment(config:Omit<Deployment,'pushEnvironment'>|null,enabled:string|undefined,pushEnvironment:string|undefined):Deployment|null{
 const checked=attachmentDeployment(config,enabled);
 if(!checked||(pushEnvironment!=='Sandbox'&&pushEnvironment!=='Production'))return null;
 return {...checked,pushEnvironment};
}
/** Held service; both environments come only from server deployment configuration.
 * Registration never grants paid rights and never triggers a notification. */
export async function nativePushRegistrationResponse(request:Request,config:Deployment|null,factory:(config:Deployment,signal:AbortSignal)=>SupabaseClient){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status:number)=>Response.json({error:status===503?'iPhone通知は準備中、または確認できない状態です。':'通知の登録状態を確認し直してください。'},{status,headers});
 if(!config)return fail(503);
 config=Object.freeze({...config});
 if(!['POST','DELETE'].includes(request.method))return fail(405);
 if(new URL(request.url).search)return fail(400);
 const expected=request.headers.get('X-Ouchi-App-Epoch');if(!validAttachmentEpoch(expected))return fail(400);
 const authorization=request.headers.get('authorization');
 if(!authorization?.startsWith('Bearer ')||authorization.length>16384||!authorization.slice(7)||/\s/.test(authorization.slice(7)))return fail(401);
 try{
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);signal.throwIfAborted();
  const scoped=new Request(request,{signal}),db=factory(config,signal),bearer=authorization.slice(7);
  const verify=async()=>{
   signal.throwIfAborted();const verified=await db.auth.getUser(bearer);if(verified.error||!verified.data.user)return null;
   const identity=sessionAfterAuthVerification(bearer,verified.data.user.id);if(!identity)return null;
   const epoch=await db.rpc('current_maintenance_purchase_account',{target_user:identity.userID,verified_session:identity.sessionID});
   if(epoch.error)throw Error('Registration scope unavailable');signal.throwIfAborted();
   return epoch.data===expected?identity:null;
  };
  const identity=await verify();if(!identity)return fail(403);
  let body:Record<string,unknown>;try{body=await readBillingBody(scoped);}catch{return fail(400);}
  const disabling=request.method==='DELETE',field=disabling?'registrationId':'deviceToken',value=body[field];
  if(Object.keys(body).length!==1||!Object.hasOwn(body,field)||(disabling?typeof value!=='string'||!validAttachmentEpoch(value):typeof value!=='string'||!/^([0-9a-f]{2}){16,512}$/i.test(value)))return fail(400);
  const args={target_user:identity.userID,verified_session:identity.sessionID,expected_epoch:expected,push_environment:config.pushEnvironment,purchase_environment:config.environment};
  const result=await db.rpc(disabling?'disable_maintenance_native_scoped_push':'register_maintenance_native_scoped_push',{...args,...(disabling?{registration_id:(value as string).toLowerCase()}:{token:(value as string).toLowerCase()})});
  if(result.error)throw Error('Registration unavailable');signal.throwIfAborted();
  if(disabling?typeof result.data!=='boolean':!validAttachmentEpoch(result.data))throw Error('Invalid registration acknowledgement');
  const after=await verify();if(!after||after.userID!==identity.userID||after.sessionID!==identity.sessionID)return fail(403);
  return Response.json({notificationEnvironment:config.pushEnvironment,purchaseEnvironment:config.environment,purchaseAccountToken:expected,...(disabling?{disabled:result.data}:{registrationId:result.data.toLowerCase()})},{headers});
 }catch{return fail(503);}
}
