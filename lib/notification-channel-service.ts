import type {SupabaseClient} from '@supabase/supabase-js';
import type {BillingEnvironment} from './billing';
import {attachmentDeployment} from './attachment-service-handler';
import {validAttachmentEpoch} from './attachment-epoch';
import {storedReminderSettings} from './reminder-settings-store';
import {readBillingBody} from './billing-body';
export type NotificationChannel='web'|'native'|'both';
const channel=(value:unknown):value is NotificationChannel=>value==='web'||value==='native'||value==='both';
type Deployment={url:string;key:string;environment:BillingEnvironment;storage:string};
export const notificationChannelDeployment=attachmentDeployment;
/** Free preference; does not grant rights, register a destination or send messages. */
export async function notificationChannelResponse(request:Request,config:Deployment|null,factory:(config:Deployment,signal:AbortSignal)=>SupabaseClient){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status:number)=>Response.json({error:status===409?'別の変更があります。読み込み直してください。':status===412?'先にiPhoneの通知先を登録してください。':'通知先の設定を確認できません。読み込み直してください。'},{status,headers});
 if(!config)return fail(503);config=Object.freeze({...config});
 if(!['GET','PUT'].includes(request.method))return fail(405);
 if(new URL(request.url).search)return fail(400);
 const epoch=request.headers.get('X-Ouchi-App-Epoch');if(!validAttachmentEpoch(epoch))return fail(400);
 const authorization=request.headers.get('authorization');if(!authorization||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return fail(401);
 try{
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);signal.throwIfAborted();
  const scoped=new Request(request,{signal}),db=factory(config,signal),verify=storedReminderSettings(db,config.environment).verify;
  let input:{revision:number;channel:NotificationChannel}|undefined;
  if(request.method==='PUT'){
   if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return fail(415);
   try{const body=await readBillingBody(scoped);if(Object.keys(body).sort().join(',')!=='channel,revision'||!Number.isSafeInteger(body.revision)||(body.revision as number)<0||(body.revision as number)>=Number.MAX_SAFE_INTEGER||!channel(body.channel))return fail(400);input={revision:body.revision as number,channel:body.channel};}catch{return fail(400);}
  }
  const identity=await verify(authorization.slice(7));signal.throwIfAborted();if(!identity)return fail(401);if(identity.epochID!==epoch)return fail(403);
  const fixed=Object.freeze({...identity}),args={target_user:fixed.userID,verified_session:fixed.sessionID,target_epoch:fixed.epochID,target_environment:config.environment};
  const result=input?await db.rpc('save_maintenance_notification_channel',{...args,expected_revision:input.revision,selected_channel:input.channel}):await db.rpc('read_maintenance_notification_channel',args);
  if(result.error){if(result.error.code==='P0001'&&result.error.message==='Settings changed; reload required')return fail(409);if(result.error.code==='P0001'&&result.error.message==='iPhone registration required')return fail(412);throw Error('Channel unavailable');}
  signal.throwIfAborted();const value=result.data;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='channel,environment,nativeRegistered,revision'||value.environment!==config.environment||!channel(value.channel)||typeof value.nativeRegistered!=='boolean'||!Number.isSafeInteger(value.revision)||value.revision<0||(value.revision===0&&value.channel!=='both')||(input&&(value.revision!==input.revision+1||value.channel!==input.channel)))throw Error('Channel unconfirmed');
  const receipt=Object.freeze({environment:value.environment,revision:value.revision,channel:value.channel,nativeRegistered:value.nativeRegistered});
  const latest=await verify(authorization.slice(7));signal.throwIfAborted();if(!latest||latest.userID!==fixed.userID||latest.sessionID!==fixed.sessionID||latest.epochID!==fixed.epochID)return fail(403);
  return Response.json({...receipt,purchaseAccountToken:fixed.epochID},{headers});
 }catch{return fail(503);}
}
