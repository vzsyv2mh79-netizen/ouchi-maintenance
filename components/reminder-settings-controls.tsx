"use client";
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {changeWebReminder,reminderSelectionCurrent,type WebReminderSelection} from '@/lib/web-reminder-client';
import {freeReminderSchedule,type ReminderSchedule} from '@/lib/reminder-schedule';
import type {BillingEnvironment} from '@/lib/billing';
export function ReminderSettingsControls({account,disabled=false}:{account:string;disabled?:boolean}){
 const [selection,setSelection]=useState<WebReminderSelection|null>(null),[schedule,setSchedule]=useState<ReminderSchedule>(freeReminderSchedule),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const operation=useRef<AbortController|null>(null);
 useEffect(()=>{
  const clear=()=>{operation.current?.abort();operation.current=null;setSelection(null);setSchedule(freeReminderSchedule);setBusy(false);setMessage('');};
  const client=getSupabase();const subscription=client?.auth.onAuthStateChange((event,session)=>{if(event!=='INITIAL_SESSION'||session?.user.id!==account)clear();}).data.subscription;
  const hidden=()=>{if(document.visibilityState!=='visible')clear();};document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',clear);
  const timer=setInterval(()=>setSelection(current=>current&&!reminderSelectionCurrent(current)?null:current),1000);
  return()=>{clear();subscription?.unsubscribe();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',clear);clearInterval(timer);};
 },[account]);
 const enabled=process.env.NEXT_PUBLIC_OUCHI_REMINDER_SETTINGS_ENABLED==='true',environment=process.env.NEXT_PUBLIC_OUCHI_REMINDER_SETTINGS_ENVIRONMENT;
 if(!enabled||!['Sandbox','Production'].includes(environment??''))return null;
 async function run(save=false){
  if(operation.current)return;const prior=selection;const controller=new AbortController();operation.current=controller;setSelection(null);setBusy(true);setMessage('');
  try{
   const client=getSupabase();if(!client||save&&!prior)throw Error('Settings unavailable');
   const value=await changeWebReminder({account,environment:environment as BillingEnvironment,signal:controller.signal,save:save&&prior?{prior,schedule}:undefined,session:async()=>{const value=await client.auth.getSession();if(value.error)throw value.error;const session=value.data.session;return session?{account:session.user.id,token:session.access_token}:null;}});
   controller.signal.throwIfAborted();if(operation.current===controller){setSelection(value);setSchedule(value.saved??value.effective);if(save)setMessage('設定の保存を確認しました。通知の配信は準備中です。');}
  }catch{if(!controller.signal.aborted)setMessage('設定の結果を確認できません。最新の設定を読み込んでから、もう一度お試しください。');}
  finally{if(operation.current===controller){operation.current=null;setBusy(false);}}
 }
 const canEdit=selection?.premiumActive===true&&reminderSelectionCurrent(selection)&&!busy&&!disabled;
 const labels=['日','月','火','水','木','金','土'];
 return <section className="settings-group reminder-settings-controls" aria-label="通知の細かな設定" aria-busy={busy}><h2>通知の細かな設定</h2><p>時刻・曜日・何日前から知らせるかを保存できます。保存した設定を使った通知配信は準備中です。</p><button className="secondary-button" disabled={busy||disabled} onClick={()=>void run()}>{busy?'確認中…':'最新の設定を読み込む'}</button>
 {selection?<p>{selection.premiumActive?'有料プランの利用権を確認済み':'無料の設定を使用：毎日9時、期限が来たお手入れ'}{!selection.premiumActive&&selection.saved?'。以前の設定は保存されています。':''}</p>:null}
 <fieldset disabled={!canEdit}><legend>通知の時刻・曜日（日本時間）</legend><label>通知時刻<input type="time" value={String(Math.floor(schedule.minuteOfDay/60)).padStart(2,'0')+':'+String(schedule.minuteOfDay%60).padStart(2,'0')} onChange={event=>{const [hour,minute]=event.target.value.split(':').map(Number);if(Number.isInteger(hour)&&Number.isInteger(minute))setSchedule({...schedule,minuteOfDay:hour*60+minute});}} /></label>
 {labels.map((label,index)=><label key={label}><input type="checkbox" checked={schedule.weekdays.includes(index+1)} onChange={event=>setSchedule({...schedule,weekdays:event.target.checked?[...schedule.weekdays,index+1].sort():schedule.weekdays.filter(day=>day!==index+1)})} />{label}曜日</label>)}
 <label>何日前から<select value={schedule.leadDays} onChange={event=>setSchedule({...schedule,leadDays:Number(event.target.value)})}><option value={0}>当日から</option><option value={1}>1日前から</option><option value={3}>3日前から</option><option value={7}>7日前から</option></select></label>
 <label><input type="checkbox" checked={schedule.includeOverdue} onChange={event=>setSchedule({...schedule,includeOverdue:event.target.checked})} />期限を過ぎたものも含める</label></fieldset>
 <button className="primary-button" disabled={!canEdit||!schedule.weekdays.length} onClick={()=>void run(true)}>設定を保存</button>{message?<p role="status">{message}</p>:null}</section>;
}
