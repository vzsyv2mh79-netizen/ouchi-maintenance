import {closureID} from './web-closure-transport';
import type {SavedWebClosureSubmission} from './web-closure-progress-client';
export type WebClosureReference=SavedWebClosureSubmission&Readonly<{kind:'ouchi-web-closure-reference/v1';retirementObserved:boolean}>;
function checked(value:unknown,account?:string):WebClosureReference{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('保存した申請情報を読み取れません。');
  const r=value as Record<string,unknown>;
  if(Object.keys(r).sort().join(',')!=='account,epochID,kind,retirementObserved,submissionID'||r.kind!=='ouchi-web-closure-reference/v1'||!closureID(r.account)||!closureID(r.epochID)||!closureID(r.submissionID)||typeof r.retirementObserved!=='boolean'||account!==undefined&&r.account!==account)throw Error('保存した申請情報を読み取れません。');
  return Object.freeze({...r}) as WebClosureReference;
}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(Error('このブラウザに申請の確認情報を保存できません。'));return;}
  const request=indexedDB.open('ouchi-maintenance-closure-references',1);let rejected=false;
  const timer=setTimeout(()=>{rejected=true;try{request.transaction?.abort();}catch{}reject(Error('申請情報の保存領域を確認できません。'));},5000);
  request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('submissions',{keyPath:'submissionID'}).createIndex('account','account');db.createObjectStore('current',{keyPath:'scope'});};
  request.onerror=request.onblocked=()=>{clearTimeout(timer);rejected=true;reject(Error('申請情報の保存領域を開けません。別のタブも確認してください。'));};
  request.onsuccess=()=>{clearTimeout(timer);const db=request.result;if(rejected){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
});}
async function transaction<T>(mode:IDBTransactionMode,work:(tx:IDBTransaction,done:(value:T)=>void,fail:(error:unknown)=>void)=>void):Promise<T>{
  const db=await database();
  try{return await new Promise<T>((resolve,reject)=>{
    const tx=db.transaction(['submissions','current'],mode,mode==='readwrite'?{durability:'strict'}:undefined);
    let value:T,ready=false,failure:unknown;
    const timer=setTimeout(()=>{failure=Error('申請情報の保存を確認できません。');try{tx.abort();}catch{reject(failure);}},5000);
    const fail=(error:unknown)=>{failure=error;try{tx.abort();}catch{reject(error);}};
    tx.oncomplete=()=>{clearTimeout(timer);if(ready)resolve(value);else reject(Error('申請情報の保存を確認できません。'));};
    tx.onabort=tx.onerror=()=>{clearTimeout(timer);reject(failure??Error('申請情報の保存を確認できません。'));};
    try{work(tx,result=>{value=result;ready=true;},fail);}catch(error){fail(error);}
  });}finally{db.close();}
}
function pointer(value:unknown,account:string,epochID:string):string|null{
  if(value===undefined)return null;
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('申請の保存先を確認できません。');
  const r=value as Record<string,unknown>;
  if(Object.keys(r).sort().join(',')!=='scope,submissionID'||r.scope!==account+'/'+epochID||!closureID(r.submissionID))throw Error('申請の保存先を確認できません。');
  return r.submissionID;
}
export const webClosureReferences={
  async list(account:string):Promise<readonly WebClosureReference[]>{
    if(!closureID(account))throw Error('ログイン状態を確認してください。');
    return transaction('readonly',(tx,done,fail)=>{const read=tx.objectStore('submissions').index('account').getAll(account,65);read.onsuccess=()=>{try{if(read.result.length>64)throw Error('保存した申請が多すぎます。');done(read.result.map(value=>checked(value,account)));}catch(error){fail(error);}};});
  },
  async current(account:string,epochID:string):Promise<WebClosureReference|null>{
    if(!closureID(account)||!closureID(epochID))throw Error('登録状態を確認してください。');
    return transaction('readonly',(tx,done,fail)=>{const read=tx.objectStore('current').get(account+'/'+epochID);read.onsuccess=()=>{try{
      const id=pointer(read.result,account,epochID);if(!id){done(null);return;}
      const item=tx.objectStore('submissions').get(id);item.onsuccess=()=>{try{const r=checked(item.result,account);if(r.epochID!==epochID||r.submissionID!==id)throw Error('申請情報が一致しません。');done(r);}catch(error){fail(error);}};
    }catch(error){fail(error);}};});
  },
  /** CAS pointer serializes competing tabs. Existing uncertainty is never
   * overwritten; only an exact previous, freshly cancelled submission advances.
   * This stores IDs only, never a password, bearer, read capability or completion.
   */
  async reserve(account:string,epochID:string,previousSubmissionID?:string):Promise<WebClosureReference>{
    if(!closureID(account)||!closureID(epochID)||previousSubmissionID!==undefined&&!closureID(previousSubmissionID))throw Error('登録状態を確認してください。');
    const proposed:WebClosureReference=Object.freeze({kind:'ouchi-web-closure-reference/v1',account,epochID,submissionID:crypto.randomUUID(),retirementObserved:false});
    await transaction<void>('readwrite',(tx,done,fail)=>{
      const store=tx.objectStore('submissions'),read=tx.objectStore('current').get(account+'/'+epochID);
      read.onsuccess=()=>{try{
        const prior=pointer(read.result,account,epochID);
        if(prior!==(previousSubmissionID??null))throw Error('別の申請が確認待ちです。保存した申請を読み直してください。');
        const advance=()=>{const count=store.count();count.onsuccess=()=>{try{
          if(count.result>=64)throw Error('申請の確認情報をこれ以上保存できません。');
          store.add(proposed);tx.objectStore('current').put({scope:account+'/'+epochID,submissionID:proposed.submissionID});done();
        }catch(error){fail(error);}};};
        if(prior){const old=store.get(prior);old.onsuccess=()=>{try{const r=checked(old.result,account);if(r.epochID!==epochID||r.retirementObserved)throw Error('処理中の申請を置き換えられません。');advance();}catch(error){fail(error);}};}else advance();
      }catch(error){fail(error);}};
    });
    const readback=await webClosureReferences.current(account,epochID);
    if(readback?.submissionID!==proposed.submissionID)throw Error('保存した申請を確認できません。送信せず状況を確認してください。');
    return readback;
  },
  async markRetirement(input:SavedWebClosureSubmission):Promise<WebClosureReference>{
    const saved=Object.freeze({...input});if(!closureID(saved.account)||!closureID(saved.epochID)||!closureID(saved.submissionID))throw Error('保存した申請が一致しません。');
    return transaction('readwrite',(tx,done,fail)=>{const store=tx.objectStore('submissions'),read=store.get(saved.submissionID);read.onsuccess=()=>{try{
      const r=checked(read.result,saved.account);if(r.epochID!==saved.epochID||r.submissionID!==saved.submissionID)throw Error('保存した申請が一致しません。');
      const next=Object.freeze({...r,retirementObserved:true});store.put(next);done(next);
    }catch(error){fail(error);}};});
  },
};
