import {closureID} from './web-closure-transport';
import {closureReadScope,closureReadMetadata,closureReadToken,closureReadAlive,sameClosureRead,type WebClosureReadScope,type WebClosureReadMetadata,type WebClosureReadCredential} from './web-closure-read-types';
type Cipher=WebClosureReadMetadata&Readonly<{kind:'ouchi-web-closure-read-cipher/v1';iv:ArrayBuffer;ciphertext:ArrayBuffer}>;
const kind='ouchi-web-closure-read-cipher/v1';
function cipher(value:unknown):Cipher{
  const meta=closureReadMetadata(value),r=value as Record<string,unknown>;
  if(Object.keys(r).sort().join(',')!=='account,ciphertext,credentialID,epochID,expiresAt,iv,kind,requestID,submissionID'||r.kind!==kind||!(r.iv instanceof ArrayBuffer)||r.iv.byteLength!==12||!(r.ciphertext instanceof ArrayBuffer)||r.ciphertext.byteLength<32||r.ciphertext.byteLength>512)throw Error('保存した確認用の鍵を読み取れません。');
  return Object.freeze({...meta,kind,iv:r.iv.slice(0),ciphertext:r.ciphertext.slice(0)});
}
function key(value:unknown):CryptoKey{
  if(!(value instanceof CryptoKey)||value.type!=='secret'||value.extractable||value.algorithm.name!=='AES-GCM'||(value.algorithm as AesKeyAlgorithm).length!==256||[...value.usages].sort().join(',')!=='decrypt,encrypt')throw Error('保存した確認情報を開けません。');
  return value;
}
const aad=(meta:WebClosureReadMetadata)=>new TextEncoder().encode(JSON.stringify([kind,meta.account,meta.epochID,meta.submissionID,meta.requestID,meta.credentialID,meta.expiresAt]));
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'||!globalThis.crypto?.subtle){reject(Error('このブラウザでは確認用の鍵を保存できません。'));return;}
  const request=indexedDB.open('ouchi-maintenance-closure-read-custody',1);let rejected=false;
  const timer=setTimeout(()=>{rejected=true;try{request.transaction?.abort();}catch{}reject(Error('保存領域を確認できません。'));},5000);
  request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('credentials',{keyPath:'requestID'}).createIndex('account','account');db.createObjectStore('keys');};
  request.onerror=request.onblocked=()=>{clearTimeout(timer);rejected=true;reject(Error('確認用の鍵の保存領域を開けません。'));};
  request.onsuccess=()=>{clearTimeout(timer);const db=request.result;if(rejected){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
});}
async function transaction<T>(mode:IDBTransactionMode,work:(tx:IDBTransaction,done:(value:T)=>void,fail:(error:unknown)=>void)=>void,signal?:AbortSignal):Promise<T>{
  signal?.throwIfAborted();const db=await database();try{signal?.throwIfAborted();return await new Promise<T>((resolve,reject)=>{
    const tx=db.transaction(['credentials','keys'],mode,mode==='readwrite'?{durability:'strict'}:undefined);let value:T,ready=false,failure:unknown;
    const timer=setTimeout(()=>{failure=Error('確認用の鍵の保存を確認できません。');try{tx.abort();}catch{reject(failure);}},5000);
    const abort=()=>{failure=signal?.reason;try{tx.abort();}catch{reject(failure);}};
    const clear=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
    const fail=(error:unknown)=>{failure=error;try{tx.abort();}catch{clear();reject(error);}};signal?.addEventListener('abort',abort,{once:true});
    tx.oncomplete=()=>{clear();if(ready)resolve(value);else reject(Error('確認用の鍵の保存を確認できません。'));};
    tx.onabort=tx.onerror=()=>{clear();reject(failure??Error('確認用の鍵の保存を確認できません。'));};
    try{work(tx,result=>{value=result;ready=true;},fail);}catch(error){fail(error);}
  });}finally{db.close();}
}
async function readCipher(scope:WebClosureReadScope):Promise<Cipher|null>{
  return transaction('readonly',(tx,done,fail)=>{const read=tx.objectStore('credentials').get(scope.requestID);read.onsuccess=()=>{try{
    if(read.result===undefined){done(null);return;}const r=cipher(read.result);
    if(r.account!==scope.account||r.epochID!==scope.epochID||r.submissionID!==scope.submissionID)throw Error('確認情報の保存先が一致しません。');done(r);
  }catch(error){fail(error);}};});
}
async function storedKey():Promise<CryptoKey|undefined>{return transaction('readonly',(tx,done,fail)=>{const read=tx.objectStore('keys').get('browser');read.onsuccess=()=>{try{done(read.result===undefined?undefined:key(read.result));}catch(error){fail(error);}};});}
async function ensureKey():Promise<CryptoKey>{
  const existing=await storedKey();if(existing)return existing;
  const candidate=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  // Key creation is add-only. Missing keys with existing credentials are an
  // error, never a reason to silently replace unreadable original credentials.
  return transaction('readwrite',(tx,done,fail)=>{const read=tx.objectStore('keys').get('browser');read.onsuccess=()=>{try{
    if(read.result!==undefined){done(key(read.result));return;}
    const count=tx.objectStore('credentials').count();count.onsuccess=()=>{try{if(count.result!==0)throw Error('元の確認用の鍵を開けません。');tx.objectStore('keys').add(candidate,'browser');done(candidate);}catch(error){fail(error);}};
  }catch(error){fail(error);}};});
}
async function decrypt(record:Cipher):Promise<WebClosureReadCredential>{
  const savedKey=await storedKey();if(!savedKey)throw Error('元の確認用の鍵を開けません。');
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv,additionalData:aad(record),tagLength:128},savedKey,record.ciphertext);
  if(bytes.byteLength>256)throw Error('保存した確認用の鍵を読み取れません。');
  const secret:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!secret||typeof secret!=='object'||Array.isArray(secret)||Object.keys(secret).sort().join(',')!=='kind,token'||(secret as Record<string,unknown>).kind!=='ouchi-closure-read-secret/v1'||!closureReadToken((secret as Record<string,unknown>).token))throw Error('保存した確認用の鍵を読み取れません。');
  return Object.freeze({...closureReadMetadata(record),token:(secret as {token:string}).token});
}
/** Separate browser custody. AES key is non-extractable but usable by this
 * origin: this does not defend against same-origin script compromise or claim
 * hardware/device-only storage. No Auth tokens/passwords or completion flags.
 */
export const webClosureReadVault={
  async list(account?:string):Promise<readonly WebClosureReadMetadata[]>{
    if(account!==undefined&&!closureID(account))throw Error('ログイン状態を確認してください。');
    return transaction('readonly',(tx,done,fail)=>{const store=tx.objectStore('credentials'),read=account===undefined?store.getAll(undefined,33):store.index('account').getAll(account,33);read.onsuccess=()=>{try{
      if(read.result.length>32)throw Error('確認情報が多すぎます。');const rows=read.result.map(value=>closureReadMetadata(cipher(value)));if(account!==undefined&&rows.some(r=>r.account!==account))throw Error('保存先が一致しません。');done(rows);
    }catch(error){fail(error);}};});
  },
  async read(input:WebClosureReadScope):Promise<WebClosureReadCredential|null>{const scope=closureReadScope(input),record=await readCipher(scope);return record?decrypt(record):null;},
  async prepare(input:WebClosureReadScope,expiresAt:string):Promise<WebClosureReadCredential>{
    const scope=closureReadScope(input),existing=await readCipher(scope);
    if(existing){if(existing.expiresAt!==expiresAt)throw Error('元の確認期限が一致しません。');closureReadAlive(existing);return decrypt(existing);}
    const meta=closureReadMetadata({...scope,credentialID:crypto.randomUUID(),expiresAt});closureReadAlive(meta);
    const browserKey=await ensureKey(),raw=new Uint8Array(32),iv=new Uint8Array(12);crypto.getRandomValues(raw);crypto.getRandomValues(iv);
    const token=btoa(String.fromCharCode(...raw)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(meta),tagLength:128},browserKey,new TextEncoder().encode(JSON.stringify({kind:'ouchi-closure-read-secret/v1',token})));
    const proposed:Cipher=Object.freeze({...meta,kind,iv:iv.buffer,ciphertext});
    const stored=await transaction<Cipher>('readwrite',(tx,done,fail)=>{const store=tx.objectStore('credentials'),read=store.get(scope.requestID);read.onsuccess=()=>{try{
      if(read.result!==undefined){const r=cipher(read.result);if(r.account!==scope.account||r.epochID!==scope.epochID||r.submissionID!==scope.submissionID||r.expiresAt!==expiresAt)throw Error('元の確認情報が一致しません。');done(r);return;}
      const count=store.count();count.onsuccess=()=>{try{if(count.result>=32)throw Error('確認情報をこれ以上保存できません。');store.add(proposed);done(proposed);}catch(error){fail(error);}};
    }catch(error){fail(error);}};});
    const readback=await webClosureReadVault.read(scope);
    if(!readback||!sameClosureRead(readback,stored))throw Error('保存した確認用の鍵を読み直せません。');
    // Readback must decrypt with the separately persisted CryptoKey. When this
    // call won the add, also prove its exact random token survived unchanged.
    if(stored.credentialID===meta.credentialID&&readback.token!==token)throw Error('元の確認用の鍵が一致しません。');
    return readback;
  },
  async forgetExpired(input:WebClosureReadMetadata,signal:AbortSignal):Promise<void>{
    const meta=closureReadMetadata(input);signal.throwIfAborted();if(Date.parse(meta.expiresAt)>Date.now())throw Error('確認期限が残っています。');
    await transaction<void>('readwrite',(tx,done,fail)=>{const store=tx.objectStore('credentials'),read=store.get(meta.requestID);read.onsuccess=()=>{try{
      signal.throwIfAborted();const actual=cipher(read.result);if(!sameClosureRead(actual,meta)||Date.parse(actual.expiresAt)>Date.now())throw Error('元の期限切れ情報が一致しません。');store.delete(meta.requestID);done();
    }catch(error){fail(error);}};},signal);
    if(await readCipher(meta)!==null)throw Error('期限切れ情報の消去を確認できません。');
  },
};
