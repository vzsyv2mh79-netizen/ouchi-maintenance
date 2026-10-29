"use client";
import {useEffect,useRef,useState} from 'react';
import type {createWebTOTPConfirmation} from '@/lib/web-totp-confirmation';

/** Candidate UI. Host owns real Auth transport and atomic credential custody.
 * No production host is connected yet. Never enrolls/removes a factor.
 */
export function TOTPConfirmationControls({flow,bindingRevision,disabled=false}:{flow:ReturnType<typeof createWebTOTPConfirmation>;bindingRevision:string;disabled?:boolean}){
 const [factors,setFactors]=useState<readonly string[]>([]),[selected,setSelected]=useState(''),[code,setCode]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const generation=useRef(0);
 useEffect(()=>{const ticket=generation;ticket.current++;flow.cancel();setFactors([]);setSelected('');setCode('');setReady(false);setBusy(false);setMessage('');return()=>{ticket.current++;flow.cancel();};},[flow,bindingRevision]);
 const run=async(action:'load'|'challenge'|'verify')=>{
  if(busy||disabled)return;const expected=generation.current,submitted=code;setCode('');setBusy(true);setMessage('');
  try{
   if(action==='load'){const values=await flow.prepare();if(expected!==generation.current)return;setFactors(values);setSelected(values.length===1?values[0]:'');setReady(false);if(values.length===0)setMessage('登録済みの認証アプリがありません。登録・紛失時の復旧は準備中です。設定を自動で変更しません。');}
   else if(action==='challenge'){await flow.challenge(selected);if(expected===generation.current)setReady(true);}
   else{await flow.verify(submitted);if(expected!==generation.current)return;setReady(false);setFactors([]);setSelected('');setMessage('本人確認が完了しました。引き継ぎ・退会は送信していません。元の依頼の結果を確認してください。');}
  }catch{if(expected===generation.current)setMessage('本人確認を完了できませんでした。コードの有効期限とログイン状態を確認してください。ログインが切れた場合は、同じアカウントでログインし直してください。保存済みの依頼は変更しません。');}
  finally{if(expected===generation.current)setBusy(false);}
 };
 const cancel=()=>{generation.current++;flow.cancel();setFactors([]);setSelected('');setCode('');setReady(false);setBusy(false);setMessage('確認を閉じました。送信済みの確認結果が不明な場合はログイン状態を確認してください。引き継ぎ・退会は自動で送信しません。');};
 return <section className="settings-group" aria-label="認証アプリで本人確認" aria-busy={busy}>
  <h2>認証アプリで本人確認</h2><p>登録済みの認証アプリに表示される6桁のコードを、この画面に入力します。コードはチャットや問い合わせへ送らないでください。</p>
  <button type="button" className="secondary-button" disabled={busy||disabled} onClick={()=>void run('load')}>登録済みの認証アプリを確認</button>
  {factors.length>0&&<><label><span>使う認証アプリ</span><select value={selected} disabled={busy||disabled} onChange={e=>{setSelected(e.target.value);setReady(false);setCode('');}}><option value="">選んでください</option>{factors.map((id,i)=><option key={id} value={id}>認証アプリ {i+1}</option>)}</select></label><button type="button" className="secondary-button" disabled={busy||disabled||!selected} onClick={()=>void run('challenge')}>確認コードの入力へ</button></>}
  {ready&&<form className="form-grid" onSubmit={e=>{e.preventDefault();void run('verify');}}><label><span>6桁のコード</span><input type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} disabled={busy||disabled} onChange={e=>setCode(e.target.value)}/></label><button className="primary-button" disabled={busy||disabled||!/^\d{6}$/.test(code)}>本人確認する</button></form>}
  <button type="button" className="text-button" onClick={cancel}>確認を閉じる</button>
  {message&&<p role="status">{message}</p>}
 </section>;
}
