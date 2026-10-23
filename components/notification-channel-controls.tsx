"use client";
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {changeWebNotificationChannel,channelSelectionCurrent,type WebChannelSelection} from '@/lib/web-notification-channel-client';
import type {NotificationChannel} from '@/lib/notification-channel-service';
import type {BillingEnvironment} from '@/lib/billing';
export function NotificationChannelControls({account,disabled=false}:{account:string;disabled?:boolean}){
 const [selection,setSelection]=useState<WebChannelSelection|null>(null),[chosen,setChosen]=useState<NotificationChannel>('both'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const operation=useRef<AbortController|null>(null);
 useEffect(()=>{
  const clear=()=>{operation.current?.abort();operation.current=null;setSelection(null);setChosen('both');setBusy(false);setMessage('');};
  const client=getSupabase();const subscription=client?.auth.onAuthStateChange((event,session)=>{if(event!=='INITIAL_SESSION'||session?.user.id!==account)clear();}).data.subscription;
  const hidden=()=>{if(document.visibilityState!=='visible')clear();};document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',clear);
  const timer=setInterval(()=>setSelection(current=>current&&!channelSelectionCurrent(current)?null:current),1000);
  return()=>{clear();subscription?.unsubscribe();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',clear);clearInterval(timer);};
 },[account]);
 const enabled=process.env.NEXT_PUBLIC_OUCHI_NOTIFICATION_CHANNELS_ENABLED==='true',environment=process.env.NEXT_PUBLIC_OUCHI_NOTIFICATION_CHANNEL_ENVIRONMENT;
 if(!enabled||!['Sandbox','Production'].includes(environment??''))return null;
 async function run(save=false){
  if(operation.current)return;const prior=selection,requested=chosen,controller=new AbortController();operation.current=controller;setSelection(null);setBusy(true);setMessage('');
  try{
   const client=getSupabase();if(!client||save&&!prior)throw Error('Channel unavailable');
   const value=await changeWebNotificationChannel({account,environment:environment as BillingEnvironment,signal:controller.signal,save:save&&prior?{prior,channel:requested}:undefined,session:async()=>{const result=await client.auth.getSession();if(result.error)throw result.error;const session=result.data.session;return session?{account:session.user.id,token:session.access_token}:null;}});
   controller.signal.throwIfAborted();if(operation.current===controller){setSelection(value);setChosen(value.channel);if(save)setMessage('受け取り先の保存を確認しました。実際の配信は準備中です。');}
  }catch{if(!controller.signal.aborted)setMessage('保存結果を確認できません。最新の設定を読み込んでください。');}
  finally{if(operation.current===controller){operation.current=null;setBusy(false);}}
 }
 const canEdit=selection!==null&&channelSelectionCurrent(selection)&&!busy&&!disabled;
 return <section className="settings-group notification-channel-controls" aria-label="通知の受け取り先" aria-busy={busy}><h2>通知の受け取り先</h2><p>無料で選べます。このアカウントの定期通知に反映します。iPhoneへの配信は準備中です。</p>
 <button className="secondary-button" disabled={busy||disabled} onClick={()=>void run()}>{busy?'確認中…':'受け取り先を確認'}</button>
 <fieldset disabled={!canEdit}><legend>受け取り先を選ぶ</legend>{([['both','WebとiPhoneの両方'],['web','Webだけ'],['native','iPhoneだけ']] as const).map(([value,label])=><label key={value}><input type="radio" name="notification-channel" value={value} checked={chosen===value} disabled={value==='native'&&!selection?.nativeRegistered} onChange={()=>setChosen(value)} />{label}</label>)}</fieldset>
 {selection&&!selection.nativeRegistered?<p>「iPhoneだけ」を選ぶには、iPhone版で通知先の登録が必要です。</p>:null}
 <p>「iPhoneだけ」は、このアカウントのすべてのWeb端末への定期通知を止めます。届いた通知と、別の端末内に予約済みの通知は取り消せません。</p>
 <button className="primary-button" disabled={!canEdit||chosen==='native'&&!selection?.nativeRegistered} onClick={()=>void run(true)}>受け取り先を保存</button>{message?<p role="status">{message}</p>:null}</section>;
}
