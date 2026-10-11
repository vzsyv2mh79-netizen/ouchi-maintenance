import type {SupabaseClient} from '@supabase/supabase-js';
import {sessionAfterAuthVerification} from './verified-app-session';
import {ReminderSettingsError,type ReminderSettingsDependencies,type ReminderScope} from './reminder-settings';
/** Bounded service client only; exact bearer verification precedes signed claim use. */
export function storedReminderSettings(db:SupabaseClient):ReminderSettingsDependencies{
 const args=(s:ReminderScope)=>({target_user:s.userID,verified_session:s.sessionID,target_epoch:s.epochID,target_environment:'Sandbox'});
 const result=(r:{data:unknown;error:unknown})=>{
  if(r.error){const e=r.error as {code?:string;message?:string};if(e.code==='P0001'){
   if(e.message==='Settings changed; reload required')throw new ReminderSettingsError('conflict');
   if(e.message==='Premium required')throw new ReminderSettingsError('premium');
   if(e.message==='Purchase account unavailable')throw new ReminderSettingsError('identity');
  }throw Error('Settings unavailable');}return r.data;
 };
 return {
  verify:async bearer=>{const u=await db.auth.getUser(bearer);if(u.error||!u.data.user)return null;const s=sessionAfterAuthVerification(bearer,u.data.user.id);if(!s)return null;
   const epoch=await db.rpc('current_maintenance_purchase_account',{target_user:s.userID,verified_session:s.sessionID});if(epoch.error)throw Error('Session unavailable');if(typeof epoch.data!=='string')return null;return {userID:s.userID,sessionID:s.sessionID,epochID:epoch.data};},
  read:async s=>result(await db.rpc('read_maintenance_reminder_schedule',args(s))),
  save:async(s,revision,schedule)=>result(await db.rpc('save_maintenance_reminder_schedule',{...args(s),expected_revision:revision,notification_minute:schedule.minuteOfDay,notification_weekdays:schedule.weekdays,advance_days:schedule.leadDays,include_expired:schedule.includeOverdue})),
 };
}
