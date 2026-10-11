"use client";
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {attachmentBinding,attachmentPage,downloadAttachment,type AttachmentItem} from '@/lib/attachment-client';

export function AttachmentControls({product,account}:{product:string;account:string}){
 const [items,setItems]=useState<AttachmentItem[]>([]),[next,setNext]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const operation=useRef<AbortController|null>(null),binding=useRef<string|null>(null);
 useEffect(()=>{
  const client=getSupabase();
  const subscription=client?.auth.onAuthStateChange((_event,session)=>{if(session?.user.id!==account){operation.current?.abort();binding.current=null;setItems([]);setNext(null);setMessage('アカウントが変わりました。画面を開き直してください。');}}).data.subscription;
  return ()=>{operation.current?.abort();operation.current=null;binding.current=null;subscription?.unsubscribe();};
 },[product,account]);
 async function run(action:(token:string,signal:AbortSignal)=>Promise<void>){
  if(operation.current)return;const controller=new AbortController();operation.current=controller;setBusy(true);setMessage('');
  try{
   const client=getSupabase();const session=await client?.auth.getSession();controller.signal.throwIfAborted();
   if(!session||session.error||session.data.session?.user.id!==account)throw Error('クラウド保存へログインしてください。');
   const token=session.data.session.access_token,current=await attachmentBinding(token,controller.signal);controller.signal.throwIfAborted();
   if(current.account!==account.toLowerCase())throw Error('アカウントを確認してください。');
   if(binding.current&&binding.current!==current.epoch){setItems([]);setNext(null);binding.current=null;throw Error('登録状態が変わりました。一覧を確認し直してください。');}
   binding.current=current.epoch;
   await action(token,controller.signal);
  }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'通信を確認してください。');}
  finally{if(operation.current===controller){operation.current=null;setBusy(false);}}
 }
 function load(after:string|null){void run(async(token,signal)=>{
  const page=await attachmentPage(product,after,token,signal);const current=await attachmentBinding(token,signal);signal.throwIfAborted();
  if(current.account!==account.toLowerCase()||current.epoch!==binding.current)throw Error('登録状態が変わりました。');
  if(after&&page.items.some(item=>items.some(existing=>existing.id===item.id)))throw Error('一覧が更新されました。一覧を確認し直してください。');
  setItems(after?[...items,...page.items]:page.items);setNext(page.next);if(!after&&!page.items.length)setMessage('保存済みファイルはありません。');
 });}
 function download(id:string){void run(async(token,signal)=>{
  const file=await downloadAttachment(id,token,signal);const current=await attachmentBinding(token,signal);signal.throwIfAborted();
  if(current.account!==account.toLowerCase()||current.epoch!==binding.current)throw Error('登録状態が変わりました。');
  const url=URL.createObjectURL(file.blob);try{const link=document.createElement('a');link.href=url;link.download=file.filename;link.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 });}
 return <section className="settings-group" aria-label="写真・保証書"><h2>写真・保証書</h2><p>保存済みのファイルは、有料プランの契約終了後も取り出せます。住まいへのアクセス権が必要です。</p><button className="secondary-button" disabled={busy} onClick={()=>load(null)}>{busy?'確認中…':'保存済みファイルを確認'}</button>{items.map(item=><div key={item.id}><p>{item.mime==='application/pdf'?'PDF':'写真'} · {Math.ceil(item.size/1024)} KB · {new Date(item.createdAt).toLocaleDateString('ja-JP')}</p><button className="text-button" disabled={busy} onClick={()=>download(item.id)}>ファイルを保存</button></div>)}{next&&<button className="secondary-button" disabled={busy} onClick={()=>load(next)}>続きを表示</button>}{message&&<p role="status">{message}</p>}</section>;
}
