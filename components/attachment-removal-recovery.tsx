"use client";
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {browserAttachmentAuth} from '@/lib/attachment-auth-lifecycle';
import {attachmentBinding,type AttachmentBinding} from '@/lib/attachment-client';
import {browserPendingAttachmentRemovals,type PendingWebAttachmentRemoval} from '@/lib/pending-attachment-store';
import {sendPendingAttachmentRemoval} from '@/lib/attachment-removal-flow';
import {AttachmentScopeChanged} from '@/lib/attachment-upload-flow';

/** Available from settings even when the original product was removed. */
export function AttachmentRemovalRecovery({account,disabled}:{account:string;disabled:boolean}){
 const [pending,setPending]=useState<PendingWebAttachmentRemoval|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const operation=useRef<AbortController|null>(null);
 useEffect(()=>{
  let previousToken:string|null|undefined;
  const subscription=getSupabase()?.auth.onAuthStateChange((event,session)=>{
   const token=session?.access_token??null,changed=previousToken!==undefined&&previousToken!==token;previousToken=token;
   if(session?.user.id!==account||event==='SIGNED_OUT'||(event==='SIGNED_IN'&&changed)){
    operation.current?.abort();operation.current=null;setPending(null);setMessage('');setBusy(false);
   }
  }).data.subscription;
  return ()=>{operation.current?.abort();operation.current=null;subscription?.unsubscribe();};
 },[account]);
 async function run(action:(token:string,signal:AbortSignal,current:AttachmentBinding)=>Promise<void>){
  if(operation.current||disabled)return;
  const controller=new AbortController();operation.current=controller;setBusy(true);setMessage('');
  try{
   const session=await getSupabase()?.auth.getSession();controller.signal.throwIfAborted();
   if(!session||session.error||session.data.session?.user.id!==account)throw Error('クラウド保存へログインしてください。');
   await browserAttachmentAuth.ready(account);controller.signal.throwIfAborted();
   const token=session.data.session.access_token,current=await attachmentBinding(token,controller.signal);controller.signal.throwIfAborted();
   if(current.account!==account.toLowerCase())throw new AttachmentScopeChanged();
   await action(token,controller.signal,current);
  }catch(error){
   if(!controller.signal.aborted){if(error instanceof AttachmentScopeChanged)setPending(null);setMessage(error instanceof Error?error.message:'削除結果を確認できませんでした。');}
  }finally{if(operation.current===controller){operation.current=null;setBusy(false);}}
 }
 function load(){void run(async(token,signal,current)=>{
  const saved=await browserPendingAttachmentRemovals.read(current.account,current.epoch);signal.throwIfAborted();
  const latest=await attachmentBinding(token,signal);signal.throwIfAborted();
  if(latest.account!==current.account||latest.epoch!==current.epoch)throw new AttachmentScopeChanged();
  setPending(saved);setMessage(saved?'前回のファイル削除の結果が確認待ちです。':'この端末には確認待ちの削除がありません。');
 });}
 function retry(){
  if(!pending||!window.confirm('前回の同じファイルの削除結果を再確認します。削除が未完了の場合は、そのファイルを削除します。続けますか？'))return;
  const saved=pending;
  void run(async(token,signal,current)=>{
   if(saved.account!==current.account||saved.epoch!==current.epoch)throw new AttachmentScopeChanged();
   await sendPendingAttachmentRemoval(current,saved.id,token,signal);signal.throwIfAborted();
   setPending(null);setMessage('前回のファイルの削除を確認しました。');
  });
 }
 return <div aria-label="写真・保証書の削除確認" aria-busy={busy}>
  <h3>写真・保証書の削除確認</h3>
  <p>通信が切れた削除の結果を確認できます。製品が削除されていても、前回と同じファイルだけを再確認します。</p>
  <button className="secondary-button" disabled={busy||disabled} onClick={load}>確認待ちの削除を確認</button>
  {pending?<button className="secondary-button" disabled={busy||disabled} onClick={retry}>同じファイルの削除結果を再確認</button>:null}
  {message?<p role="status">{message}</p>:null}
 </div>;
}
