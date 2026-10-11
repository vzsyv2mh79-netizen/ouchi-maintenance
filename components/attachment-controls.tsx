"use client";
import {useEffect,useRef,useState} from 'react';
import {browserAttachmentAuth} from '@/lib/attachment-auth-lifecycle';
import {getSupabase} from '@/lib/supabase';
import {attachmentBinding,attachmentPage,downloadAttachment,removeAttachment,type AttachmentItem,type AttachmentBinding} from '@/lib/attachment-client';
import {browserPendingAttachments,type PendingWebAttachment} from '@/lib/pending-attachment-store';
import {sendPendingAttachment,AttachmentScopeChanged} from '@/lib/attachment-upload-flow';

export function AttachmentControls({product,account}:{product:string;account:string}){
 const [items,setItems]=useState<AttachmentItem[]>([]),[next,setNext]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const operation=useRef<AbortController|null>(null),binding=useRef<string|null>(null);
 const [file,setFile]=useState<File|null>(null),[pending,setPending]=useState<PendingWebAttachment|null>(null);
 useEffect(()=>{
  const client=getSupabase();
  let previousToken:string|null|undefined;
  const subscription=client?.auth.onAuthStateChange((event,session)=>{const nextToken=session?.access_token??null,changed=previousToken!==undefined&&previousToken!==nextToken;previousToken=nextToken;if(session?.user.id!==account||event==='SIGNED_OUT'||(event==='SIGNED_IN'&&changed)){operation.current?.abort();binding.current=null;setItems([]);setNext(null);setFile(null);setPending(null);setMessage('アカウントが変わりました。画面を開き直してください。');}}).data.subscription;
  return ()=>{operation.current?.abort();operation.current=null;binding.current=null;subscription?.unsubscribe();};
 },[product,account]);
 async function run(action:(token:string,signal:AbortSignal,current:AttachmentBinding)=>Promise<void>){
  if(operation.current)return;const controller=new AbortController();operation.current=controller;setBusy(true);setMessage('');
  try{
   const client=getSupabase();const session=await client?.auth.getSession();controller.signal.throwIfAborted();
   if(!session||session.error||session.data.session?.user.id!==account)throw Error('クラウド保存へログインしてください。');
   await browserAttachmentAuth.ready(account);controller.signal.throwIfAborted();
   const token=session.data.session.access_token,current=await attachmentBinding(token,controller.signal);controller.signal.throwIfAborted();
   if(current.account!==account.toLowerCase())throw Error('アカウントを確認してください。');
   if(binding.current&&binding.current!==current.epoch){setItems([]);setNext(null);setFile(null);setPending(null);binding.current=null;throw Error('登録状態が変わりました。一覧を確認し直してください。');}
   binding.current=current.epoch;
   await action(token,controller.signal,current);
  }catch(error){if(!controller.signal.aborted){if(error instanceof AttachmentScopeChanged){binding.current=null;setItems([]);setNext(null);setFile(null);setPending(null);}setMessage(error instanceof Error?error.message:'通信を確認してください。');}}
  finally{if(operation.current===controller){operation.current=null;setBusy(false);}}
 }
 function load(after:string|null){void run(async(token,signal)=>{
  const page=await attachmentPage(product,after,token,signal);const current=await attachmentBinding(token,signal);signal.throwIfAborted();
  if(current.account!==account.toLowerCase()||current.epoch!==binding.current)throw new AttachmentScopeChanged();
  if(after&&page.items.some(item=>items.some(existing=>existing.id===item.id)))throw Error('一覧が更新されました。一覧を確認し直してください。');
  setItems(after?[...items,...page.items]:page.items);setNext(page.next);if(!after&&!page.items.length)setMessage('保存済みファイルはありません。');
 });}
 function download(id:string){void run(async(token,signal)=>{
  const file=await downloadAttachment(id,token,signal);const current=await attachmentBinding(token,signal);signal.throwIfAborted();
  if(current.account!==account.toLowerCase()||current.epoch!==binding.current)throw new AttachmentScopeChanged();
  const url=URL.createObjectURL(file.blob);try{const link=document.createElement('a');link.href=url;link.download=file.filename;link.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 });}
 function remove(id:string){
  if(!items.some(item=>item.id===id)||!window.confirm('この写真・保証書をクラウドから削除しますか？家族も取り出せなくなります。必要なファイルは先に保存してください。'))return;
  void run(async(token,signal,current)=>{
   await removeAttachment(id,current.epoch,true,token,signal);signal.throwIfAborted();
   const latest=await attachmentBinding(token,signal);signal.throwIfAborted();
   if(latest.account!==current.account||latest.epoch!==current.epoch)throw new AttachmentScopeChanged();
   setItems(previous=>previous.filter(item=>item.id!==id));setMessage('ファイルの削除を確認しました。');
  });
 }
 function checkPending(){void run(async(token,signal,current)=>{
  const value=await browserPendingAttachments.read(current.account,current.epoch),latest=await attachmentBinding(token,signal);signal.throwIfAborted();
  if(latest.account!==current.account||latest.epoch!==current.epoch)throw new AttachmentScopeChanged();
  setPending(value);if(value)setFile(null);
  setMessage(!value?'確認待ちのファイルはありません。':value.product!==product.toLowerCase()?'別の製品への保存が確認待ちです。その製品の画面で確認してください。':'確認待ちのファイルがあります。同じファイルで保存結果を再確認できます。');
 });}
 function save(){
  if(!file||!window.confirm('このファイルをクラウドへ保存しますか？結果を確認できるまで、このブラウザにファイルを保持します。'))return;
  const selected=file;
  void run(async(token,signal,current)=>{
   const existing=await browserPendingAttachments.read(current.account,current.epoch);signal.throwIfAborted();
   if(existing){setPending(existing);setFile(null);throw Error('別の保存が確認待ちです。先に同じファイルで結果を確認してください。');}
   const value=await browserPendingAttachments.stage({...current,product,id:crypto.randomUUID(),blob:selected,mime:selected.type});signal.throwIfAborted();
   setPending(value);setFile(null);
   await sendPendingAttachment({...current,product:product.toLowerCase()},value.id,token,signal);signal.throwIfAborted();
   setPending(null);setItems([]);setNext(null);setMessage('保存を確認しました。一覧からファイルを取得できます。');
  });
 }
 function retry(){
  if(!pending||!window.confirm('同じファイルと保存先で結果を再確認します。未保存の場合は同じIDで送信します。'))return;
  const expectedID=pending.id;
  void run(async(token,signal,current)=>{
   await sendPendingAttachment({...current,product:product.toLowerCase()},expectedID,token,signal);signal.throwIfAborted();
   setPending(null);setItems([]);setNext(null);setMessage('保存を確認しました。');
  });
 }
 return <section className="settings-group attachment-controls" aria-label="写真・保証書" aria-busy={busy}><h2>写真・保証書</h2><p>新規保存には有料プランが必要です。保存済みのファイルは、契約終了後も取り出せます。保存した本人または住まいの所有者は、契約終了後も削除できます。住まいへのアクセス権が必要です。</p><p>JPEG・PNG・PDF、1ファイル約5MBまで。保存結果を確認できるまで、このブラウザにファイルを保持します。</p>
  <label>写真・保証書を選ぶ<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={busy||pending!==null} onChange={event=>{const chosen=event.target.files?.[0]??null;event.target.value='';if(chosen&&(chosen.size<1||chosen.size>5242880||!['image/jpeg','image/png','application/pdf'].includes(chosen.type))){setFile(null);setMessage('JPEG・PNG・PDFの約5MB以下のファイルを選択してください。');return;}setFile(chosen);setMessage('');}} /></label>
  {file?<p>{file.name} <button className="text-button" disabled={busy} onClick={()=>setFile(null)}>選択を取り消す</button></p>:null}
  <div className="attachment-actions"><button className="primary-button" disabled={busy||!file||pending!==null} onClick={save}>保存する</button>
  <button className="secondary-button" disabled={busy} onClick={checkPending}>確認待ちのファイルを確認</button></div>
  {pending?<div><p>{pending.product===product.toLowerCase()?'確認待ちのファイルがあります。':'別の製品への保存が確認待ちです。'}</p><button className="secondary-button" disabled={busy||pending.product!==product.toLowerCase()} onClick={retry}>同じファイルで保存結果を再確認</button></div>:null}
  <button className="secondary-button" disabled={busy} onClick={()=>load(null)}>{busy?'確認中…':'保存済みファイルを確認'}</button>{items.map(item=><div className="attachment-file" key={item.id}><p>{item.mime==='application/pdf'?'PDF':'写真'} · {Math.ceil(item.size/1024)} KB · {new Date(item.createdAt).toLocaleDateString('ja-JP')}</p><div className="attachment-actions"><button className="text-button" disabled={busy} onClick={()=>download(item.id)}>ファイルを保存</button><button className="text-button" disabled={busy} onClick={()=>remove(item.id)}>ファイルを削除</button></div></div>)}{next?<button className="secondary-button" disabled={busy} onClick={()=>load(next)}>続きを表示</button>:null}{message?<p role="status">{message}</p>:null}</section>;
}
