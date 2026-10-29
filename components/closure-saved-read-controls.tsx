"use client";
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {listWebClosureReads,recoverWebClosureRead,forgetExpiredWebClosureRead,cleanupWebClosurePendingFiles} from '@/lib/web-closure-read-client';
import type {WebClosureReadMetadata,WebClosureReadStatus} from '@/lib/web-closure-read-types';
const date=(value:string)=>new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
const text=(state:WebClosureReadStatus['state'])=>({pending:'退会処理を進めています。',running:'退会処理を進めています。',failed:'退会処理が完了していません。確認情報を残して、もう一度状況を確認してください。',complete:'サーバー側の退会処理の完了を確認しました。このブラウザに残る記録と、Appleの定期購入は別に確認してください。'})[state];
export function ClosureSavedReadControls({account,ready,disabled=false,onBusyChange}:{account:string|null;ready:boolean;disabled?:boolean;onBusyChange:(busy:boolean)=>void}){
  const [rows,setRows]=useState<readonly WebClosureReadMetadata[]>([]),[selected,setSelected]=useState<WebClosureReadMetadata|null>(null),[status,setStatus]=useState<WebClosureReadStatus|null>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[checkedAt,setCheckedAt]=useState('');
  const operation=useRef<AbortController|null>(null),revision=useRef(0),label=useId();
  const enabled=process.env.NEXT_PUBLIC_OUCHI_CLOSURE_READ_CUSTODY_ENABLED==='true';
  const abandon=useCallback(()=>{revision.current++;operation.current?.abort();operation.current=null;setBusy(false);onBusyChange(false);setRows([]);setSelected(null);setStatus(null);setMessage('');setCheckedAt('');},[onBusyChange]);
  useEffect(()=>{
    if(!enabled)return;
    const subscription=getSupabase()?.auth.onAuthStateChange((event,session)=>{if(event!=='INITIAL_SESSION'||(session?.user.id??null)!==account)abandon();}).data.subscription;
    const hidden=()=>{if(document.visibilityState!=='visible')abandon();};document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',abandon);
    return()=>{abandon();subscription?.unsubscribe();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',abandon);};
  },[account,enabled,abandon]);
  useEffect(()=>{if(!ready||disabled)abandon();},[ready,disabled,abandon]);
  if(!enabled)return null;
  async function run(work:(options:{expectedAccount:string|null;signal:AbortSignal;session:()=>Promise<{account:string;token:string}|null>})=>Promise<{rows?:readonly WebClosureReadMetadata[];status?:WebClosureReadStatus|null;message?:string}>){
    if(!ready||disabled||operation.current||document.visibilityState!=='visible')return;
    const controller=new AbortController(),expected=++revision.current;operation.current=controller;
    const current=()=>operation.current===controller&&revision.current===expected&&!controller.signal.aborted;
    setBusy(true);onBusyChange(true);setStatus(null);setMessage('');setCheckedAt('');
    try{
      const result=await work({expectedAccount:account,signal:controller.signal,session:async()=>{const client=getSupabase();if(!client)throw Error('ログイン状態を確認できません。');const r=await client.auth.getSession();if(r.error)throw r.error;const s=r.data.session;return s?{account:s.user.id,token:s.access_token}:null;}});
      if(!current())return;
      if(result.rows){setRows(result.rows);setSelected(null);}
      setStatus(result.status??null);setCheckedAt(result.status?new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'');setMessage(result.message??'');
    }catch{if(current()){setStatus(null);setCheckedAt('');setMessage('状況を確認できませんでした。保存した確認情報は残しています。通信と端末の日時を確認して、もう一度お試しください。');}}
    finally{if(current()){operation.current=null;setBusy(false);onBusyChange(false);}}
  }
  const expired=selected!==null&&Date.parse(selected.expiresAt)<=Date.now();
  return <section className="settings-group closure-controls" aria-label="保存した退会処理の確認" aria-busy={busy}>
    <h3>保存した退会処理の確認</h3>
    <p>事前にこのブラウザへ保存した確認情報で、ログアウト後も状況を確認できます。新しい退会申請や取消は送りません。</p>
    <p>このブラウザを使える人も状況を確認できます。サイトのデータを消すと、確認できなくなる場合があります。</p>
    <button type="button" className="secondary-button" disabled={!ready||disabled||busy} onClick={()=>void run(async options=>{const list=await listWebClosureReads(options);return {rows:list,message:list.length?'確認する退会処理を選んでください。':'このブラウザに保存した確認情報はありません。'};})}>保存した退会処理を開く</button>
    {rows.length>0&&<label><span id={label}>確認する退会処理</span><select aria-labelledby={label} value={selected?.requestID??''} disabled={busy||disabled||!ready} onChange={event=>{setSelected(rows.find(r=>r.requestID===event.target.value)??null);setStatus(null);setMessage('');setCheckedAt('');}}><option value="">退会処理を選んでください</option>{rows.map(r=><option key={r.requestID} value={r.requestID}>処理番号：{r.requestID.slice(0,8).toUpperCase()}</option>)}</select></label>}
    {selected&&<><p>確認期限（最長・日本時間）：{date(selected.expiresAt)}</p><p>サーバー側の情報が先に削除される場合もあります。確認できないことは、退会完了を意味しません。</p></>}
    <button type="button" className="secondary-button" disabled={busy||disabled||!ready||!selected||expired} onClick={()=>{if(selected)void run(async options=>{const result=await recoverWebClosureRead(options,selected);return {status:result,message:result?'':'現在の状況を確認できません。元の確認情報を残し、もう一度お試しください。完了したとは限りません。'};});}}>保存した鍵で状況を確認</button>
    {expired&&<><p>この確認情報は期限切れです。確認期限は延長できません。</p><button type="button" className="text-button" disabled={busy||disabled||!ready} onClick={()=>{if(selected&&window.confirm('期限切れの確認情報をこのブラウザから消去しますか？ サーバーの退会処理は変更しません。'))void run(async options=>{await forgetExpiredWebClosureRead(options,selected);return {rows:await listWebClosureReads(options),message:'期限切れの確認情報をこのブラウザから消去しました。'};});}}>期限切れの確認情報を消去</button></>}
    {status&&<div role="status"><p>{text(status.state)}</p><p>最終確認（日本時間）：{checkedAt}</p></div>}
    {status?.state==='complete'&&selected&&!expired&&<><p>この退会の登録に紐づく、送信・削除の確認待ちファイルをこのブラウザから消去できます。ログインせずに作った記録、別の登録のファイル、退会の確認情報は残します。Appleの定期購入は解約されません。</p>{account!==null?<p>消去する場合は、先に上の「ログアウト」を押してください。その後、保存した退会処理を開き、状況を確認してください。</p>:<button type="button" className="secondary-button" disabled={busy||disabled||!ready} onClick={()=>{if(selected&&window.confirm('この退会の登録に紐づく確認待ちファイルを、このブラウザから消去しますか？ 直前に退会完了を再確認します。端末だけにある未送信ファイルは元に戻せません。'))void run(async options=>{await cleanupWebClosurePendingFiles(options,selected);return {message:'この退会の登録の確認待ちファイルを、このブラウザから消去したことを確認しました。退会の確認情報は残しています。'};});}}>この登録の確認待ちファイルを消去</button>}</>}
    {busy&&<p role="status">確認しています…</p>}{message&&<p role="status">{message}</p>}
  </section>;
}
