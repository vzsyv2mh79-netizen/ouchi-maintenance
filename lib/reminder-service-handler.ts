import type {SupabaseClient} from '@supabase/supabase-js';
import type {BillingEnvironment} from './billing';
import {attachmentDeployment} from './attachment-service-handler';
import {validAttachmentEpoch} from './attachment-epoch';
import {handleReminderSettings} from './reminder-settings';
import {storedReminderSettings} from './reminder-settings-store';
type Deployment={url:string;key:string;environment:BillingEnvironment;storage:string};
export function reminderDeployment(config:Deployment|null,enabled:string|undefined){return attachmentDeployment(config,enabled);}
/** Prepared service. Saving settings does not schedule or send a notification. */
export async function reminderServiceResponse(request:Request,config:Deployment|null,factory:(config:Deployment,signal:AbortSignal)=>SupabaseClient){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(!config)return Response.json({error:'通知設定は準備中です。'},{status:503,headers});
 const expected=request.headers.get('X-Ouchi-App-Epoch');
 if(!validAttachmentEpoch(expected))return Response.json({error:'登録状態を確認し直してください。'},{status:400,headers});
 try{
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);signal.throwIfAborted();
  const scoped=new Request(request,{signal});
  const response=await handleReminderSettings(scoped,storedReminderSettings(factory(config,signal),config.environment),{environment:config.environment,expectedEpoch:expected});
  response.headers.set('X-Content-Type-Options','nosniff');return response;
 }catch{return Response.json({error:'通知設定を確認できません。'}, {status:503,headers});}
}
