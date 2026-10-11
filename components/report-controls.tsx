"use client";
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {loadWebReport,reportLeaseCurrent,type WebReportLease} from '@/lib/web-report-client';
import type {BillingEnvironment} from '@/lib/billing';

export function ReportControls({account,home,disabled=false}:{account:string;home:string;disabled?:boolean}){
 const [lease,setLease]=useState<WebReportLease|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const operation=useRef<AbortController|null>(null);
 useEffect(()=>{
  const clear=()=>{operation.current?.abort();operation.current=null;setLease(null);setBusy(false);};
  const client=getSupabase();const subscription=client?.auth.onAuthStateChange((event,session)=>{if(event!=='INITIAL_SESSION'||session?.user.id!==account)clear();}).data.subscription;
  const hidden=()=>{if(document.visibilityState!=='visible')clear();};document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',clear);
  const timer=setInterval(()=>setLease(current=>current&&!reportLeaseCurrent(current)?null:current),1000);
  return()=>{clear();subscription?.unsubscribe();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',clear);clearInterval(timer);};
 },[account,home]);
 const configured=process.env.NEXT_PUBLIC_OUCHI_REPORTS_ENABLED==='true',environment=process.env.NEXT_PUBLIC_OUCHI_REPORT_ENVIRONMENT;
 if(!configured||!['Sandbox','Production'].includes(environment??''))return null;
 async function load(){
  if(operation.current)return;const controller=new AbortController();operation.current=controller;setBusy(true);setLease(null);setMessage('');
  try{
   const client=getSupabase();if(!client)throw Error('Login required');
   const value=await loadWebReport({account,home,environment:environment as BillingEnvironment,signal:controller.signal,session:async()=>{const value=await client.auth.getSession();if(value.error)throw value.error;const session=value.data.session;return session?{account:session.user.id,token:session.access_token}:null;}});
   controller.signal.throwIfAborted();if(operation.current===controller&&reportLeaseCurrent(value))setLease(value);
  }catch{if(!controller.signal.aborted)setMessage('レポートを取得できません。有料プランの利用状態と通信を確認し、もう一度お試しください。');}
  finally{if(operation.current===controller){operation.current=null;setBusy(false);}}
 }
 const report=lease&&reportLeaseCurrent(lease)?lease.report:null;
 return <section className="settings-group" aria-label="お手入れレポート" aria-busy={busy}><h2>お手入れレポート</h2><p>住まい全体のお手入れと、6か月の完了履歴を集計します。有料プランの利用権を確認して表示します。</p><button className="secondary-button" disabled={disabled||busy} onClick={()=>void load()}>{busy?'確認中…':'レポートを更新'}</button>
 {report?<><h3>{report.homeName}</h3><p>{report.today}時点 · 製品{report.productCount}件 · お手入れ{report.taskCount}件</p><p>期限を過ぎた項目 {report.overdue}件 · 今日の項目 {report.dueToday}件</p><h3>6か月のお手入れ実績</h3><ul>{report.months.map(month=><li key={month.month}>{month.month}：{month.completed}件</li>)}</ul><h3>製品ごとの今月の実績</h3><ul>{report.perProduct.map(product=><li key={product.productId}>{product.name}：{product.completedThisMonth}件</li>)}</ul><p>{report.explanation}</p><p>表示は最長5分です。アプリを離れた後は更新して確認してください。</p></>:null}{message?<p role="status">{message}</p>:null}</section>;
}
