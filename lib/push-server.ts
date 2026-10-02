import 'server-only';
import {createClient} from '@supabase/supabase-js';
import webpush from 'web-push';
import {isPushEndpoint,validPushKeys} from './push-validation';
export function pushConfiguration() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const publicKey=process.env.VAPID_PUBLIC_KEY,privateKey=process.env.VAPID_PRIVATE_KEY,subject=process.env.VAPID_SUBJECT;
 if(!url||!key||!publicKey||!privateKey||!subject||!process.env.CRON_SECRET)return null;
 return {url,key,publicKey,privateKey,subject};
}
export function pushDatabase(config:NonNullable<ReturnType<typeof pushConfiguration>>) {
 return createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function sendPush(config:NonNullable<ReturnType<typeof pushConfiguration>>,subscription:{endpoint:string;p256dh:string;auth:string},payload:object) {
 if(!isPushEndpoint(subscription.endpoint)||!validPushKeys(subscription.p256dh,subscription.auth))throw new Error('Unsupported subscription');
 await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify(payload),{
  vapidDetails:{subject:config.subject,publicKey:config.publicKey,privateKey:config.privateKey},TTL:86400,timeout:8000,urgency:'normal'
 });
}
