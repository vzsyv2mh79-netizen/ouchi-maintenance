import {browserPendingAttachments} from './pending-attachment-store';
type CleanupStore=Pick<typeof browserPendingAttachments,'clearAccount'|'clearAllAccounts'|'resumeAccount'>;
/** Serializes local cleanup outside Supabase auth callbacks. Does not confer server rights. */
export function attachmentAuthLifecycle(store:CleanupStore){
 let account:string|null=null,initialized=false,revision=0,tail=Promise.resolve();const failed=new Set<string>();
 const normalized=(value:string|null)=>value?.toLowerCase()??null;
 function enqueue(action:()=>Promise<void>){const result=tail.then(action);tail=result.catch(()=>{});return result;}
 async function cleanup(target:string){try{if(target==='*')await store.clearAllAccounts();else await store.clearAccount(target);failed.delete(target);}catch(error){failed.add(target);throw error;}}
 function observe(next:string|null){next=normalized(next);const previous=account,first=!initialized;initialized=true;account=next;if(first||previous!==next)revision++;
  if(first&&next===null)void enqueue(()=>cleanup('*')).catch(()=>{});
  else if(previous&&previous!==next)void enqueue(()=>cleanup(previous)).catch(()=>{});
 }
 async function ready(target:string){const expected=normalized(target),captured=revision;await tail;
  if(!initialized||account!==expected||revision!==captured)throw Error('ログイン状態が変わりました。画面を開き直してください。');
  if(failed.size)throw Error('端末の確認待ちファイルを消去できませんでした。ログインし直してください。');
 }
 async function clear(target:string){target=target.toLowerCase();if(account!==target)throw Error('ログイン状態を確認してください。');await enqueue(()=>cleanup(target));}
 async function activate(target:string){target=target.toLowerCase();const captured=revision;
  await enqueue(async()=>{
   for(const pending of [...failed])await cleanup(pending);
   if(!initialized||account!==target||revision!==captured)throw Error('ログイン状態を確認してください。');
   try{await store.resumeAccount(target);}catch(error){failed.add(target);throw error;}
   if(account!==target||revision!==captured)throw Error('ログイン状態が変わりました。');
  });
 }
 return {observe,ready,clear,activate};
}
export const browserAttachmentAuth=attachmentAuthLifecycle(browserPendingAttachments);
