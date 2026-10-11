"use client";
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {readOrEnrollWebAccount,type WebEnrollmentState} from '@/lib/web-enrollment-client';
export function EnrollmentControls({account,disabled=false}:{account:string;disabled?:boolean}){
 const [state,setState]=useState<WebEnrollmentState|null>(null),[password,setPassword]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const operation=useRef<AbortController|null>(null);
 useEffect(()=>{
  const clear=()=>{operation.current?.abort();operation.current=null;setState(null);setPassword('');setConsent(false);setBusy(false);setMessage('');};
  const subscription=getSupabase()?.auth.onAuthStateChange((event,session)=>{if(event!=='INITIAL_SESSION'||session?.user.id!==account)clear();}).data.subscription;
  const hidden=()=>{if(document.visibilityState!=='visible')clear();};document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',clear);
  return()=>{clear();subscription?.unsubscribe();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',clear);};
 },[account]);
 if(process.env.NEXT_PUBLIC_OUCHI_EXPLICIT_ENROLLMENT_ENABLED!=='true')return null;
 async function run(register=false){
  if(operation.current)return;const controller=new AbortController();operation.current=controller;setBusy(true);setMessage('');setState(null);
  const confirmation=register?{password,requestID:crypto.randomUUID()}:undefined;setPassword('');setConsent(false);
  try{
   const client=getSupabase();if(!client)throw Error('Login required');
   const result=await readOrEnrollWebAccount({account,signal:controller.signal,consent:confirmation,session:async()=>{const result=await client.auth.getSession();if(result.error)throw result.error;const s=result.data.session;return s?{account:s.user.id,token:s.access_token}:null;}});
   controller.signal.throwIfAborted();if(operation.current===controller){setState(result);setMessage(result.enrolled?'このログインのおうちメンテ登録を確認しました。':'このログインはまだおうちメンテに登録されていません。');}
  }catch{if(!controller.signal.aborted)setMessage('登録結果を確認できません。パスワードと通信状態を確認し、まず「登録状態を確認」を押してください。退会処理中は登録できません。');}
  finally{if(operation.current===controller){operation.current=null;setBusy(false);}}
 }
 return <div className="enrollment-controls" aria-label="おうちメンテへの登録" aria-busy={busy}><h3>おうちメンテへの登録</h3><p>ログインアカウントを、このアプリで使うことに同意して登録します。登録は無料です。購入や有料契約は行いません。</p><button className="secondary-button" disabled={busy||disabled} onClick={()=>void run()}>登録状態を確認</button>
 {state?.enrolled?<button className="primary-button" disabled={busy||disabled} onClick={()=>window.location.reload()}>記録を読み込み直す</button>:state&&<form className="form-grid" onSubmit={event=>{event.preventDefault();if(consent)void run(true);}}><label><span>本人確認のパスワード</span><input type="password" required maxLength={1024} autoComplete="current-password" value={password} disabled={busy||disabled} onChange={event=>setPassword(event.target.value)}/></label><label className="enrollment-consent"><input type="checkbox" checked={consent} disabled={busy||disabled} onChange={event=>setConsent(event.target.checked)}/>このログインをおうちメンテで使うことに同意します</label><p>別のアプリの記録や購入権は引き継ぎません。以前の記録を削除済みの場合、その記録は戻りません。</p><button className="primary-button" disabled={busy||disabled||!consent||!password}>無料で登録する</button></form>}
 {message&&<p role="status">{message}</p>}</div>;
}
