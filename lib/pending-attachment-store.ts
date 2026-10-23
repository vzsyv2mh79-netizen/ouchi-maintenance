export type PendingWebAttachment={version:1;account:string;epoch:string;product:string;id:string;mime:string;sha256:string;blob:Blob};
export type PendingWebAttachmentRemoval={version:1;kind:'removal';account:string;epoch:string;product:string;id:string};
export type PendingAttachmentDriver={read:(key:string)=>Promise<unknown>;revision:(key:string)=>Promise<number>;stage:(key:string,item:PendingWebAttachment|PendingWebAttachmentRemoval,revision:number)=>Promise<unknown>;reset:(account:string,blocked:boolean)=>Promise<void>;resetAll:()=>Promise<void>;complete:(key:string,id:string)=>Promise<void>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
function scope(account:string,epoch:string){if(!valid(account)||!valid(epoch)||account.toLowerCase()===epoch.toLowerCase())throw Error('登録状態を確認できません。');return `${account.toLowerCase()}/${epoch.toLowerCase()}`;}
async function digest(blob:Blob,mime:string){
 const prefix=mime==='image/png'?[137,80,78,71,13,10,26,10]:mime==='image/jpeg'?[255,216,255]:mime==='application/pdf'?[37,80,68,70,45]:null;
 if(!(blob instanceof Blob)||blob.size<1||blob.size>5242880||!prefix)throw Error('JPEG・PNG・PDFの5MiB以下のファイルを選択してください。');
 const bytes=new Uint8Array(await blob.arrayBuffer());if(!prefix.every((byte,index)=>bytes[index]===byte))throw Error('ファイル形式を確認してください。');
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function checked(value:unknown,account:string,epoch:string):Promise<PendingWebAttachment|null>{
 if(value===undefined||value===null)return null;
 const item=value as PendingWebAttachment;
 if(item.version!==1||item.account!==account.toLowerCase()||item.epoch!==epoch.toLowerCase()||!valid(item.product)||!valid(item.id)||typeof item.sha256!=='string'||!/^[0-9a-f]{64}$/.test(item.sha256)||await digest(item.blob,item.mime)!==item.sha256)throw Error('確認待ちのファイルを確認できません。保存先の登録と端末データを確認してください。');
 return Object.freeze({...item});
}
/** Atomic driver prevents another tab from replacing an uncertain upload with a new ID. */
export function pendingAttachmentStore(driver:PendingAttachmentDriver){return {
 read:async(account:string,epoch:string)=>checked(await driver.read(scope(account,epoch)),account,epoch),
 stage:async(input:{account:string;epoch:string;product:string;id:string;blob:Blob;mime:string})=>{
  const key=scope(input.account,input.epoch);if(!valid(input.product)||!valid(input.id))throw Error('保存先を確認してください。');
  const revision=await driver.revision(key);
  const sha256=await digest(input.blob,input.mime);
  const item:PendingWebAttachment={version:1,blob:new Blob([input.blob],{type:input.mime}),mime:input.mime,account:input.account.toLowerCase(),epoch:input.epoch.toLowerCase(),product:input.product.toLowerCase(),id:input.id.toLowerCase(),sha256};
  const saved=await checked(await driver.stage(key,item,revision),item.account,item.epoch);
  if(!saved||saved.id!==item.id||saved.product!==item.product||saved.sha256!==item.sha256||saved.mime!==item.mime)throw Error('別のファイルの保存が確認待ちです。先にその結果を確認してください。');
  return saved;
 },
 clearAllAccounts:async()=>driver.resetAll(),
 clearAccount:async(account:string)=>{if(!valid(account))throw Error('アカウントを確認してください。');await driver.reset(account.toLowerCase(),true);},
 resumeAccount:async(account:string)=>{if(!valid(account))throw Error('アカウントを確認してください。');await driver.reset(account.toLowerCase(),false);},
 complete:async(account:string,epoch:string,id:string)=>{if(!valid(id))throw Error('添付IDを確認してください。');await driver.complete(scope(account,epoch),id.toLowerCase());},
};}

function checkedRemoval(value:unknown,account:string,epoch:string):PendingWebAttachmentRemoval|null{
 if(value===undefined||value===null)return null;
 const item=value as PendingWebAttachmentRemoval;
 if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).sort().join(',')!=='account,epoch,id,kind,product,version'
  ||item.version!==1||item.kind!=='removal'||item.account!==account.toLowerCase()||item.epoch!==epoch.toLowerCase()
  ||!valid(item.product)||!valid(item.id))throw Error('確認待ちの削除情報を読み込めません。');
 return Object.freeze({...item});
}
/** Separate key from pending file bytes, with the same account logout fence.
 * A receipt is only a retry target, never deletion completion or permission. */
export function pendingAttachmentRemovalStore(driver:PendingAttachmentDriver){return {
 read:async(account:string,epoch:string)=>checkedRemoval(await driver.read(scope(account,epoch)+'/removal'),account,epoch),
 stage:async(input:{account:string;epoch:string;product:string;id:string})=>{
  const key=scope(input.account,input.epoch)+'/removal';
  if(!valid(input.product)||!valid(input.id))throw Error('削除するファイルを確認してください。');
  const revision=await driver.revision(key);
  const item:PendingWebAttachmentRemoval={version:1,kind:'removal',account:input.account.toLowerCase(),epoch:input.epoch.toLowerCase(),product:input.product.toLowerCase(),id:input.id.toLowerCase()};
  const saved=checkedRemoval(await driver.stage(key,item,revision),item.account,item.epoch);
  if(!saved||saved.id!==item.id||saved.product!==item.product)throw Error('別のファイルの削除が確認待ちです。設定から先にその結果を確認してください。');
  return saved;
 },
 complete:async(account:string,epoch:string,id:string)=>{if(!valid(id))throw Error('添付IDを確認してください。');await driver.complete(scope(account,epoch)+'/removal',id.toLowerCase());},
};}

function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(Error('このブラウザに確認待ちのファイルを保持できません。'));return;}
 const request=indexedDB.open('ouchi-maintenance-pending-attachments',1);let rejected=false;
 request.onupgradeneeded=()=>{request.result.createObjectStore('uploads');};
 request.onerror=()=>{rejected=true;reject(Error('端末の保存領域を開けません。'));};
 request.onblocked=()=>{rejected=true;reject(Error('別のタブを閉じてから確認してください。'));};
 request.onsuccess=()=>{if(rejected){request.result.close();return;}request.result.onversionchange=()=>request.result.close();resolve(request.result);};
});}
async function transaction(key:string,mode:IDBTransactionMode,change:(value:unknown,store:IDBObjectStore)=>unknown){
 const db=await database();
 try{return await new Promise<unknown>((resolve,reject)=>{
  const tx=db.transaction('uploads',mode),store=tx.objectStore('uploads'),request=store.get(key);let result:unknown,error:unknown;
  request.onsuccess=()=>{try{result=change(request.result,store);}catch(reason){error=reason;tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error??Error('端末への保存を確認できません。'));tx.onerror=()=>{error??=Error('端末への保存を確認できません。');};
 });}finally{db.close();}
}
type Fence={revision:number;blocked:boolean};
const fenceKey=(account:string)=>`@account/${account}`;
const retiredScopeKey=(key:string)=>`@retired/${key.replace(/\/removal$/,'')}`;
function fence(value:unknown):Fence{
 if(value===undefined)return {revision:0,blocked:false};
 const current=value as Fence;if(!Number.isSafeInteger(current.revision)||current.revision<0||current.revision>=Number.MAX_SAFE_INTEGER||typeof current.blocked!=='boolean')throw Error('端末の登録状態を確認できません。');
 return current;
}
async function resetAccount(account:string,blocked:boolean){
 const db=await database();try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('uploads','readwrite'),store=tx.objectStore('uploads'),request=store.get(fenceKey(account));let error:unknown;
  request.onsuccess=()=>{try{const current=fence(request.result);store.put({revision:current.revision+1,blocked},fenceKey(account));const cursor=store.openCursor(IDBKeyRange.bound(`${account}/`,`${account}/\uffff`));cursor.onsuccess=()=>{const row=cursor.result;if(row){row.delete();row.continue();}};}catch(reason){error=reason;tx.abort();}};
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(error??Error('端末の確認待ちファイルを消去できません。'));tx.onerror=()=>{error??=Error('端末の確認待ちファイルを消去できません。');};
 });}finally{db.close();}
}
async function resetAllAccounts(){
 const db=await database();try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('uploads','readwrite'),store=tx.objectStore('uploads'),cursor=store.openCursor(),accounts=new Set<string>();let error:unknown;
  const abort=(reason:unknown)=>{error=reason;tx.abort();};
  cursor.onsuccess=()=>{try{
   const row=cursor.result;
   if(row){const key=String(row.key);if(key.startsWith('@retired/')){row.continue();return;}const account=key.startsWith('@account/')?key.slice(9):key.split('/')[0];if(valid(account)){accounts.add(account.toLowerCase());if(!key.startsWith('@account/'))row.delete();}else row.delete();row.continue();return;}
   for(const account of accounts){const request=store.get(fenceKey(account));request.onsuccess=()=>{try{const current=fence(request.result);store.put({revision:current.revision+1,blocked:true},fenceKey(account));}catch(reason){abort(reason);}};}
  }catch(reason){abort(reason);}};
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(error??Error('端末の確認待ちファイルを消去できません。'));tx.onerror=()=>{error??=Error('端末の確認待ちファイルを消去できません。');};
 });}finally{db.close();}
}
const browserPendingAttachmentDriver:PendingAttachmentDriver={
 read:key=>transaction(key,'readonly',value=>value),
 revision:async key=>{if(await transaction(retiredScopeKey(key),'readonly',value=>value)!==undefined)throw Error('この登録の端末保存は終了しています。');const current=fence(await transaction(fenceKey(key.split('/')[0]),'readonly',value=>value));if(current.blocked)throw Error('ログインし直してから保存してください。');return current.revision;},
 stage:async(key,item,revision)=>{
  const db=await database();try{return await new Promise<unknown>((resolve,reject)=>{
   const tx=db.transaction('uploads','readwrite'),store=tx.objectStore('uploads'),permission=store.get(fenceKey(item.account)),retired=store.get(retiredScopeKey(key));let result:unknown,error:unknown;
   retired.onsuccess=()=>{try{const current=fence(permission.result);if(retired.result!==undefined||current.blocked||current.revision!==revision)throw Error('ログイン状態が変わったため端末への保存を止めました。');const request=store.get(key);request.onsuccess=()=>{result=request.result;if(result===undefined){store.add(item,key);result=item;}};}catch(reason){error=reason;tx.abort();}};
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error??Error('端末への保存を確認できません。'));tx.onerror=()=>{error??=Error('端末への保存を確認できません。');};
  });}finally{db.close();}
 },
 reset:resetAccount,resetAll:resetAllAccounts,
 complete:async(key,id)=>{await transaction(key,'readwrite',(value,store)=>{if(value===undefined)return;if((value as PendingWebAttachment).id!==id)throw Error('別のファイルの確認待ち情報は消去できません。');store.delete(key);});},
};
export const browserPendingAttachments=pendingAttachmentStore(browserPendingAttachmentDriver);
export const browserPendingAttachmentRemovals=pendingAttachmentRemovalStore(browserPendingAttachmentDriver);

/** Only the exact retired account/epoch's pending bytes/removal reference.
 * Retained read capabilities, other epochs/accounts, anonymous records and Auth
 * storage are separate. The irreversible fence prevents a suspended old writer
 * from restoring bytes even if a later login resumes that account's new epoch.
 * Caller must freshly verify canonical completion before entering this adapter.
 */
export async function retireBrowserPendingAttachmentScope(account:string,epoch:string,signal:AbortSignal,expiresAt:string){
 const key=scope(account,epoch),retiredKey=retiredScopeKey(key);
 const check=()=>{signal.throwIfAborted();if(!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now())throw Error('確認期限を過ぎています。');};
 check();const db=await database();
 try{
  check();await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction('uploads','readwrite',{durability:'strict'}),store=tx.objectStore('uploads');let error:unknown;
   const stop=()=>{error??=signal.reason??Error('端末の消去を中断しました。');try{tx.abort();}catch{}};
   const timer=setTimeout(()=>{error=Error('端末の消去を確認できません。');stop();},5000);signal.addEventListener('abort',stop,{once:true});
   const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);};
   tx.oncomplete=()=>{finish();resolve();};tx.onabort=()=>{finish();reject(error??Error('端末の消去を確認できません。'));};
   tx.onerror=()=>{error??=Error('端末の消去を確認できません。');};
   const marker=store.get(retiredKey);
   marker.onsuccess=()=>{try{
    check();
    if(marker.result!==undefined&&JSON.stringify(marker.result)!==JSON.stringify({version:1,account:account.toLowerCase(),epoch:epoch.toLowerCase(),retired:true}))throw Error('別の登録の情報は消去できません。');
    store.put({version:1,account:account.toLowerCase(),epoch:epoch.toLowerCase(),retired:true},retiredKey);
    for(const target of [key,key+'/removal']){
     const read=store.get(target);read.onsuccess=()=>{try{check();const row=read.result as PendingWebAttachment|PendingWebAttachmentRemoval|undefined;if(row!==undefined&&(row.account!==account.toLowerCase()||row.epoch!==epoch.toLowerCase()))throw Error('別の登録の情報は消去できません。');store.delete(target);}catch(reason){error=reason;stop();}};
    }
   }catch(reason){error=reason;stop();}};
  });
  check();
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction('uploads','readonly'),store=tx.objectStore('uploads'),a=store.get(key),b=store.get(key+'/removal'),m=store.get(retiredKey);
   tx.oncomplete=()=>{try{check();if(a.result!==undefined||b.result!==undefined||m.result?.retired!==true)throw Error('端末の消去を確認できません。');resolve();}catch(error){reject(error);}};
   tx.onabort=()=>reject(Error('端末の消去を確認できません。'));
  });
 }finally{db.close();}
}
