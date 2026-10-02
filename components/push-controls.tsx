"use client";
import {useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
function applicationKey(key:string) {
 const bytes=atob(key.replace(/-/g,'+').replace(/_/g,'/'));
 return Uint8Array.from(bytes,char=>char.charCodeAt(0));
}
export function PushControls({cloud}:{cloud:boolean}) {
 const [supported,setSupported]=useState(false),[publicKey,setPublicKey]=useState<string|null>(null),[active,setActive]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  let current=true;
  const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  setSupported(supported);setActive(false);setPublicKey(null);
  if(!cloud||!supported)return;
  void (async()=>{
   try{
    const result=await fetch('/api/push/config',{cache:'no-store'});if(!result.ok)throw new Error();
    const config=await result.json();if(!current)return;setPublicKey(config.publicKey);
    const registration=await navigator.serviceWorker.getRegistration('/');const subscription=await registration?.pushManager.getSubscription();
    if(!subscription)return;
    const db=getSupabase();if(!db)return;
    const {data,error}=await db.from('maintenance_push_subscriptions').select('id').eq('endpoint',subscription.endpoint).maybeSingle();
    if(error)throw error;if(current)setActive(!!data);
   }catch{if(current)setMessage('通知の設定を確認できませんでした。通信状態を確認し、再読み込みしてください。');}
  })();
  return()=>{current=false;};
 },[cloud]);
 async function enable() {
  if(busy||!publicKey)return;setBusy(true);setMessage('');
  let created:PushSubscription|null=null;
  try {
   const db=getSupabase();if(!db)throw new Error();
   if(await Notification.requestPermission()!=='granted')throw new Error('通知が許可されていません。ブラウザの設定から通知を許可できます。');
   await navigator.serviceWorker.register('/sw.js');const registration=await navigator.serviceWorker.ready;
   let subscription=await registration.pushManager.getSubscription();
   if(!subscription){subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(publicKey)});created=subscription;}
   const json=subscription.toJSON();
   const {data,error}=await db.from('maintenance_push_subscriptions').upsert({endpoint:subscription.endpoint,p256dh:json.keys?.p256dh,auth:json.keys?.auth},{onConflict:'endpoint'}).select('id');
   if(error||!data?.length)throw new Error('通知先を保存できませんでした。同じ端末で別アカウントの通知を使っている場合は、そのアカウントで停止してから設定してください。');
   setActive(true);setMessage('この端末のお手入れ通知を有効にしました。');
  }catch(cause){if(created)await created.unsubscribe().catch(()=>{});setMessage(cause instanceof Error?cause.message:'通知を有効にできませんでした。');}
  finally{setBusy(false);}
 }
 async function disable() {
  if(busy)return;setBusy(true);setMessage('');
  try {
   const db=getSupabase();if(!db)throw new Error();
   const registration=await navigator.serviceWorker.getRegistration('/');const subscription=await registration?.pushManager.getSubscription();
   if(subscription){const {error}=await db.from('maintenance_push_subscriptions').delete().eq('endpoint',subscription.endpoint);if(error)throw error;await subscription.unsubscribe();}
   setActive(false);setMessage('この端末のお手入れ通知を停止しました。');
  }catch{setMessage('通知を停止できませんでした。通信状態を確認してもう一度お試しください。');}
  finally{setBusy(false);}
 }
 return <section className="settings-group"><h2>お手入れの通知</h2><p>期限が来たお手入れを毎朝9時ごろ、この端末にまとめて通知します。通知には件数だけを表示し、製品名や住まいの名前は表示しません。</p>
 {!cloud?<p>クラウド保存にログインすると設定できます。</p>:!supported?<p>このブラウザでは通知を利用できません。iPhone・iPadはホーム画面に追加したアプリから設定してください。</p>:!publicKey?<p>通知の送信準備中です。カレンダーのリマインダーは利用できます。</p>:<><button className="secondary-button" disabled={busy} onClick={active?disable:enable}>{busy?'設定中…':active?'この端末の通知を停止':'この端末で通知を受け取る'}</button><p>通知は端末ごとに設定します。アプリを閉じた後やログアウト後も継続します。停止する場合は、このアカウントでログインして通知を停止してください。端末の設定や通信状況により遅れることがあります。</p></>}
 {message&&<p role="status">{message}</p>}</section>;
}
