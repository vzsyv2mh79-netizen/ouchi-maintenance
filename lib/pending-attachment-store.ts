export type PendingWebAttachment={version:1;account:string;epoch:string;product:string;id:string;mime:string;sha256:string;blob:Blob};
export type PendingAttachmentDriver={read:(key:string)=>Promise<unknown>;revision:(key:string)=>Promise<number>;stage:(key:string,item:PendingWebAttachment,revision:number)=>Promise<unknown>;reset:(account:string,blocked:boolean)=>Promise<void>;complete:(key:string,id:string)=>Promise<void>};
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
 clearAccount:async(account:string)=>{if(!valid(account))throw Error('アカウントを確認してください。');await driver.reset(account.toLowerCase(),true);},
 resumeAccount:async(account:string)=>{if(!valid(account))throw Error('アカウントを確認してください。');await driver.reset(account.toLowerCase(),false);},
 complete:async(account:string,epoch:string,id:string)=>{if(!valid(id))throw Error('添付IDを確認してください。');await driver.complete(scope(account,epoch),id.toLowerCase());},
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
export const browserPendingAttachments=pendingAttachmentStore({
 read:key=>transaction(key,'readonly',value=>value),
 revision:async key=>{const current=fence(await transaction(fenceKey(key.split('/')[0]),'readonly',value=>value));if(current.blocked)throw Error('ログインし直してから保存してください。');return current.revision;},
 stage:async(key,item,revision)=>{
  const db=await database();try{return await new Promise<unknown>((resolve,reject)=>{
   const tx=db.transaction('uploads','readwrite'),store=tx.objectStore('uploads'),permission=store.get(fenceKey(item.account));let result:unknown,error:unknown;
   permission.onsuccess=()=>{try{const current=fence(permission.result);if(current.blocked||current.revision!==revision)throw Error('ログイン状態が変わったため端末への保存を止めました。');const request=store.get(key);request.onsuccess=()=>{result=request.result;if(result===undefined){store.add(item,key);result=item;}};}catch(reason){error=reason;tx.abort();}};
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error??Error('端末への保存を確認できません。'));tx.onerror=()=>{error??=Error('端末への保存を確認できません。');};
  });}finally{db.close();}
 },
 reset:resetAccount,
 complete:async(key,id)=>{await transaction(key,'readwrite',(value,store)=>{if(value===undefined)return;if((value as PendingWebAttachment).id!==id)throw Error('別のファイルの確認待ち情報は消去できません。');store.delete(key);});},
});
