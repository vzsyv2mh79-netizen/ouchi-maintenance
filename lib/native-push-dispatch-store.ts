import type { SupabaseClient } from '@supabase/supabase-js';
import type { NativePushDispatchDependencies, NativePushDestination } from './native-push-dispatch';
/** Internal adapter only. Inject bounded service transport and Sandbox sender.
 * No scheduler or production route is enabled. Neither token nor SQL is caller supplied.
 */
export function storedNativePushDispatch(db:SupabaseClient,send:NativePushDispatchDependencies['send']):NativePushDispatchDependencies{
 return {
  read:async id=>{
   const result=await db.rpc('read_maintenance_native_sandbox_destination',{registration_id:id});
   if(result.error)throw new Error('Notification destination unavailable');
   if(result.data===null)return null;
   if(!result.data||typeof result.data!=='object'||Array.isArray(result.data))throw new Error('Invalid notification destination');
   return result.data as NativePushDestination;
  },
  allowed:async id=>{
   const result=await db.rpc('maintenance_native_push_allowed',{registration_id:id});
   if(result.error)throw new Error('Notification guard unavailable');
   return result.data===true;
  },send,
 };
}
