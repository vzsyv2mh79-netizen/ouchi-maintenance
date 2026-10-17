"use client";
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {prepareWebClosureRead} from '@/lib/web-closure-read-client';
import {webClosureReferences,type WebClosureReference} from '@/lib/web-closure-reference-store';
import {prepareWebClosureRequest,requestWebClosure,refreshWebClosure,cancelWebClosure,prepareWebClosureRetry,retryWebClosure,type WebClosureState} from '@/lib/web-closure-review-client';

type Outcome={state?:WebClosureState|null;reference?:WebClosureReference|null;showForm?:boolean;retry?:boolean;message?:string};
const statusText=(state:WebClosureState)=>state.kind==='unconfirmed'?'受付結果を確認できません。申請情報を残して、もう一度状況を確認してください。':state.kind==='review'?(state.receipt.state==='cancelled'?'退会申請の取消を確認しました。':'退会申請を受け付けました。必要な内容を確認中です。削除完了ではありません。'):{pending:'退会処理を進めています。',running:'退会処理を進めています。',complete:'サーバー側のおうちメンテの退会処理の完了を確認しました。このブラウザの端末保存とAppleの定期購入は、別に確認してください。',failed:'退会処理が完了していません。申請情報を残して、状況を確認してください。'}[state.progress.state];

export function AccountClosureControls({account,disabled=false,onBusyChange}:{account:string;disabled?:boolean;onBusyChange:(busy:boolean)=>void}){
  const [references,setReferences]=useState<readonly WebClosureReference[]>([]),[selected,setSelected]=useState<WebClosureReference|null>(null);
  const [state,setState]=useState<WebClosureState|null>(null),[message,setMessage]=useState(''),[checkedAt,setCheckedAt]=useState('');
  const [retrying,setRetrying]=useState(false);
  const [form,setForm]=useState(false),[consent,setConsent]=useState(false),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
  const operation=useRef<AbortController|null>(null),revision=useRef(0);
  const referenceLabel=useId();
  const enabled=process.env.NEXT_PUBLIC_OUCHI_ACCOUNT_REVIEW_ENABLED==='true';
  const abandon=useCallback(()=>{revision.current++;operation.current?.abort();operation.current=null;setBusy(false);onBusyChange(false);},[onBusyChange]);
  useEffect(()=>{
    if(!enabled)return;
    const clear=()=>{abandon();setReferences([]);setSelected(null);setState(null);setCheckedAt('');setPassword('');setConsent(false);setForm(false);setRetrying(false);setMessage('');};
    // Synchronous callback only: no Auth/network/IndexedDB call while the SDK
    // holds its Auth callback lock. Reads run later in the separate effect.
    const subscription=getSupabase()?.auth.onAuthStateChange((event,session)=>{if(event!=='INITIAL_SESSION'||session?.user.id!==account){clear();setReload(v=>v+1);}}).data.subscription;
    const visibility=()=>{clear();if(document.visibilityState==='visible')setReload(v=>v+1);};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',clear);
    return()=>{abandon();subscription?.unsubscribe();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',clear);};
  },[account,enabled,abandon]);
  useEffect(()=>{
    if(!enabled||disabled||document.visibilityState!=='visible')return;
    const expected=revision.current;let active=true;
    void webClosureReferences.list(account).then(rows=>{if(active&&expected===revision.current)setReferences(rows);}).catch(()=>{if(active&&expected===revision.current)setMessage('保存した申請情報を読み込めません。保存領域を消去せず、もう一度確認してください。');});
    return()=>{active=false;};
  },[account,enabled,disabled,reload]);
  useEffect(()=>{
    if(!disabled)return;
    abandon();setState(null);setCheckedAt('');setForm(false);setRetrying(false);setConsent(false);setPassword('');
  },[disabled,abandon]);
  if(!enabled)return null;
  async function run(work:(options:{account:string;signal:AbortSignal;session:()=>Promise<{account:string;token:string}|null>},current:()=>boolean)=>Promise<Outcome>){
    if(disabled||operation.current||document.visibilityState!=='visible')return;
    const controller=new AbortController(),expected=++revision.current;operation.current=controller;
    const current=()=>operation.current===controller&&revision.current===expected&&!controller.signal.aborted;
    setBusy(true);onBusyChange(true);setState(null);setCheckedAt('');setMessage('');setPassword('');setConsent(false);setForm(false);setRetrying(false);
    try{
      const result=await work({account,signal:controller.signal,session:async()=>{const client=getSupabase();if(!client)throw Error('ログイン状態を確認してください。');const result=await client.auth.getSession();if(result.error)throw result.error;const s=result.data.session;return s?{account:s.user.id,token:s.access_token}:null;}},current);
      if(!current())return;
      if(result.reference!==undefined)setSelected(result.reference);
      setState(result.state??null);setCheckedAt(result.state?new Date().toLocaleString('ja-JP'):'');setForm(result.showForm??false);setRetrying(result.retry??false);setMessage(result.message??'');
    }catch{if(current()){setState(null);setCheckedAt('');setMessage('結果を確認できませんでした。申請情報は残しています。「保存した申請の状況を確認」から読み直してください。新しい申請は自動送信しません。');}}
    finally{
      if(current()){
        try{const rows=await webClosureReferences.list(account);if(current())setReferences(rows);}catch{if(current())setMessage('申請情報の保存を読み直せません。保存領域を消去せず確認してください。');}
        if(current()){operation.current=null;setBusy(false);onBusyChange(false);}
      }
    }
  }
  const selectedID=selected?.submissionID??'';
  return <section className="settings-group closure-controls" aria-label="おうちメンテからの退会" aria-busy={busy}>
    <h3>おうちメンテからの退会</h3>
    <p>このアプリに属する個人情報を削除して退会します。家族の共有記録は残します。投稿者を確認できない古い記録などは、運営が確認する場合があります。</p>
    <p>Appleの定期購入の解約は、Appleの購入管理から別に行ってください。他のアプリと共通のログインアカウントは削除しません。必要な記録は設定から無料で書き出せます。</p>
    <p>このブラウザには申請の確認情報を保存します。パスワードは保存しません。サイトのデータを消すと、ここから申請を確認できなくなる場合があります。</p>
    {references.length>0&&<label><span id={referenceLabel}>保存した退会申請</span><select aria-labelledby={referenceLabel} value={selectedID} disabled={busy||disabled} onChange={event=>{setSelected(references.find(r=>r.submissionID===event.target.value)??null);setState(null);setCheckedAt('');setForm(false);setRetrying(false);setConsent(false);setPassword('');setMessage('');}}><option value="">申請を選んでください</option>{references.map(r=><option key={r.submissionID} value={r.submissionID}>申請番号：{r.submissionID.slice(0,8).toUpperCase()}</option>)}</select></label>}
    <button type="button" className="secondary-button" disabled={busy||disabled||!selected} onClick={()=>{if(selected)void run(async options=>({state:await refreshWebClosure(options,selected)}));}}>保存した申請の状況を確認</button>
    {state&&<div role="status"><p>{statusText(state)}</p>{checkedAt&&<p>最終確認：{checkedAt}</p>}</div>}
    {state?.kind==='progress'&&selected&&process.env.NEXT_PUBLIC_OUCHI_CLOSURE_READ_CUSTODY_ENABLED==='true'&&<button type="button" className="secondary-button" disabled={busy||disabled} onClick={()=>{const scope={account,epochID:state.progress.epochID,submissionID:state.progress.submissionID,requestID:state.progress.requestID};void run(async options=>{await prepareWebClosureRead({...options,expectedAccount:account},scope);return {message:'確認情報をこのブラウザに保存し、登録を確認しました。ログアウト後は「保存した退会処理の確認」から状況を確認できます。'};});}}>ログアウト後の確認情報を保存</button>}
    {state?.kind==='review'&&state.receipt.state==='review_required'&&<button type="button" className="text-button" disabled={busy||disabled||!selected} onClick={()=>{if(selected&&window.confirm('退会申請を取り消しますか？ すでに処理が始まっている場合は取り消せません。'))void run(async options=>({state:await cancelWebClosure(options,selected)}));}}>退会申請を取り消す</button>}
    {state?.kind==='unconfirmed'&&selected&&!selected.retirementObserved&&<button type="button" className="secondary-button" disabled={busy||disabled} onClick={()=>{const saved=selected;void run(async options=>{const result=await prepareWebClosureRetry(options,saved);return {reference:result.reference,state:result.state,showForm:result.canRetry,retry:result.canRetry,message:result.canRetry?'同じ申請番号で再送できます。まだ削除の完了は確認していません。内容と本人確認のパスワードを確認してください。':'状況を確認できました。再送せず、表示された受付状況を確認してください。'};});}}>同じ申請番号で再送を確認</button>}
    <button type="button" className="text-button" disabled={busy||disabled} onClick={()=>void run(async options=>{const prepared=await prepareWebClosureRequest(options);return {reference:prepared.reference,state:prepared.state,showForm:prepared.canRequest,message:prepared.canRequest?'内容を確認してから、本人確認のパスワードを入力してください。':'確認待ちの申請があります。上の状況を確認してください。'};})}>退会の手続きを確認</button>
    {form&&<form className="form-grid" onSubmit={event=>{event.preventDefault();if(!consent||!password)return;const secret=password,savedRetry=retrying?selected:null;void run(async(options,current)=>{if(savedRetry)return retryWebClosure({...options,password:secret},savedRetry);const result=await requestWebClosure({...options,password:secret,onSaved:reference=>{if(current())setSelected(reference);}});return result;});}}>
      <p>処理が始まると取り消せません。申請の受付と削除の完了は別で、状況は上の欄から確認できます。</p>{retrying&&<p>保存済みの同じ申請番号で再送します。新しい申請番号は作りません。</p>}
      <label><span>退会申請の本人確認パスワード</span><input type="password" required maxLength={1024} autoComplete="current-password" value={password} disabled={busy||disabled} onChange={event=>setPassword(event.target.value)}/></label>
      <label className="enrollment-consent"><input type="checkbox" checked={consent} disabled={busy||disabled} onChange={event=>setConsent(event.target.checked)}/>共有記録の扱いと、定期購入の解約は別の手続きであることを確認しました</label>
      <button className="secondary-button" disabled={busy||disabled||!consent||!password}>{retrying?'同じ申請番号で再送する':'退会を申請する'}</button>
      <button type="button" className="text-button" disabled={busy} onClick={()=>{setForm(false);setRetrying(false);setPassword('');setConsent(false);}}>申請せずに閉じる</button>
    </form>}
    {busy&&<p role="status">確認しています…</p>}{message&&<p role="status">{message}</p>}
    <p><a href="/privacy">プライバシーについて</a> ・ <a href="/support">問い合わせ</a></p>
  </section>;
}
