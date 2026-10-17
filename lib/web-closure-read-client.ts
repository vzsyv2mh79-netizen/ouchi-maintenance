import {closureID,type ClosureTransport} from './web-closure-transport';
import {webClosureReadVault} from './web-closure-read-vault';
import {retireBrowserPendingAttachmentScope} from './pending-attachment-store';
import {closureReadAlive,closureReadDate,closureReadDeadline,closureReadMetadata,closureReadScope,closureReadToken,sameClosureRead,type WebClosureReadScope,type WebClosureReadMetadata,type WebClosureReadCredential,type WebClosureReadStatus} from './web-closure-read-types';
type Vault=Pick<typeof webClosureReadVault,'list'|'read'|'prepare'|'forgetExpired'>;
type Options=ClosureTransport&{expectedAccount:string|null;vault?:Vault;clearPending?:typeof retireBrowserPendingAttachmentScope};
type Operation=Options&{check:()=>Promise<void>;bound:<T>(work:()=>Promise<T>)=>Promise<T>;bearer:string|null};
async function operation(options:Options):Promise<Operation>{
  if(options.expectedAccount!==null&&!closureID(options.expectedAccount))throw Error('ログイン状態を確認してください。');
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(45000)]);
  async function bound<T>(work:()=>Promise<T>):Promise<T>{signal.throwIfAborted();let stop:()=>void=()=>{};
    const aborted=new Promise<never>((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
    try{return await Promise.race([Promise.resolve().then(work),aborted]);}finally{signal.removeEventListener('abort',stop);}
  }
  const initial=await bound(options.session);signal.throwIfAborted();
  if((initial?.account??null)!==options.expectedAccount||initial&&(!initial.token||initial.token.length>16384||/[\s,]/.test(initial.token)))throw Error('ログイン状態が変わりました。');
  const account=initial?.account??null,bearer=initial?.token??null;
  const check=async()=>{const current=await bound(options.session);signal.throwIfAborted();if((current?.account??null)!==account||(current?.token??null)!==bearer)throw Error('ログイン状態が変わりました。');};
  return {...options,expectedAccount:account,signal,bound,check,bearer};
}
async function request(op:Operation,action:'describe'|'register'|'status',scope:WebClosureReadScope,saved?:WebClosureReadCredential):Promise<Record<string,unknown>|null>{
  await op.check();
  const origin=new URL(op.origin??location.origin);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('確認先を利用できません。');
  const url=new URL('/api/account/closure-review/custody/'+action,origin);
  const headers:Record<string,string>={'Content-Type':'application/json'};
  // Status is a separate capability-only protocol: never send Auth/cookies.
  if(action!=='status'){if(!op.bearer||op.expectedAccount!==scope.account)throw Error('申請したアカウントでログインしてください。');headers.Authorization='Bearer '+op.bearer;}
  if(action!=='describe'){if(!saved||!closureReadToken(saved.token))throw Error('元の確認用の鍵が必要です。');headers['X-Ouchi-Closure-Read']=saved.token;}
  const body=JSON.stringify({expectedEpochID:scope.epochID,submissionID:scope.submissionID,requestID:scope.requestID,...(action==='describe'?{}:{credentialID:saved!.credentialID}),...(action==='register'?{expiresAt:saved!.expiresAt}:{})});
  const signal=AbortSignal.any([op.signal,AbortSignal.timeout(10000)]);
  const response=await op.bound(()=>(op.fetcher??fetch)(url,{method:'POST',headers,body,signal,cache:'no-store',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'}));signal.throwIfAborted();
  if(response.url!==url.href||response.redirected||![200,404].includes(response.status)||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json'){
    void response.body?.cancel().catch(()=>{});throw Error('状況を確認できません。元の確認情報は残してください。');
  }
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>4096)){void response.body?.cancel().catch(()=>{});throw Error('確認結果を読み取れません。');}
  const reader=response.body?.getReader();if(!reader)throw Error('確認結果を読み取れません。');
  let count=0,done=false;const chunks:Uint8Array[]=[];const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{for(;;){const part=await op.bound(()=>reader.read());signal.throwIfAborted();if(part.done){done=true;break;}count+=part.value.byteLength;if(count>4096)throw Error('確認結果を読み取れません。');chunks.push(part.value);}}
  finally{signal.removeEventListener('abort',cancel);if(!done)cancel();reader.releaseLock();}
  if(!count||declared!==null&&Number(declared)!==count)throw Error('確認結果を読み取れません。');
  const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));await op.check();
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('確認結果を読み取れません。');const r=value as Record<string,unknown>;
  const common={epochID:scope.epochID,submissionID:scope.submissionID,requestID:scope.requestID,...(action==='describe'?{}:{credentialID:saved!.credentialID})};
  if(Object.entries(common).some(([k,v])=>r[k]!==v))throw Error('保存した確認情報と結果が一致しません。');
  if(response.status===404){if(Object.keys(r).sort().join(',')!==['kind',...Object.keys(common),'state'].sort().join(',')||r.kind!=='app-closure-read-unavailable/v1'||r.state!=='unavailable')throw Error('確認結果を読み取れません。');return null;}
  const kind=action==='describe'?'app-closure-read-window/v1':action==='register'?'app-closure-read-registration/v1':'app-closure-read-status/v1';
  const keys=['kind',...Object.keys(common),...(action==='status'?['state']:['expiresAt']),...(action==='register'?['registered']:[])].sort().join(',');
  if(Object.keys(r).sort().join(',')!==keys||r.kind!==kind)throw Error('保存した確認情報と結果が一致しません。');
  if(action==='status'){if(!['pending','running','failed','complete'].includes(String(r.state)))throw Error('確認結果を読み取れません。');}
  else{if(!closureReadDate(r.expiresAt))throw Error('確認期限を確認できません。');closureReadDeadline(r.expiresAt);}
  if(action==='register'&&(r.registered!==true||r.expiresAt!==saved!.expiresAt))throw Error('元の確認情報の登録を確認できません。');
  return r;
}
function validate(saved:WebClosureReadCredential,scope:WebClosureReadScope){
  const meta=closureReadMetadata(saved);closureReadAlive(meta);
  if(meta.account!==scope.account||meta.epochID!==scope.epochID||meta.submissionID!==scope.submissionID||meta.requestID!==scope.requestID||!closureReadToken(saved.token))throw Error('元の確認用の鍵が一致しません。');
}
async function retained(op:Operation,saved:WebClosureReadCredential){
  const actual=await op.bound(()=>(op.vault??webClosureReadVault).read(saved));await op.check();
  if(!actual||!sameClosureRead(saved,actual)||actual.token!==saved.token)throw Error('元の確認用の鍵を読み直せません。');validate(actual,saved);
}
export async function prepareWebClosureRead(options:Options,scopeInput:WebClosureReadScope):Promise<{reference:WebClosureReadMetadata;status:WebClosureReadStatus|null}>{
  const scope=closureReadScope(scopeInput),op=await operation(options),vault=op.vault??webClosureReadVault;
  if(op.expectedAccount!==scope.account||!op.bearer)throw Error('申請したアカウントでログインしてください。');
  let saved=await op.bound(()=>vault.read(scope));await op.check();
  if(!saved){const window=await request(op,'describe',scope);if(!window)throw Error('確認情報を保存できる期限を確認できません。');
    saved=await op.bound(()=>vault.prepare(scope,window.expiresAt as string));await op.check();
    if(saved.expiresAt!==window.expiresAt)throw Error('元の確認期限が一致しません。');
  }
  validate(saved,scope);await retained(op,saved);
  const status=await request(op,'status',scope,saved);await retained(op,saved);
  if(status)return {reference:closureReadMetadata(saved),status:status as WebClosureReadStatus};
  // Only repeat registration of this exact saved key/deadline after a scoped
  // unavailable result. A transport failure cannot authorize a replacement.
  if(!await request(op,'register',scope,saved))throw Error('確認情報の登録を確認できません。元の情報は残しています。');
  await retained(op,saved);return {reference:closureReadMetadata(saved),status:null};
}
export async function recoverWebClosureRead(options:Options,input:WebClosureReadMetadata):Promise<WebClosureReadStatus|null>{
  const meta=closureReadMetadata(input),op=await operation(options);
  if(op.expectedAccount!==null&&op.expectedAccount!==meta.account)throw Error('申請したアカウントを確認してください。');
  const saved=await op.bound(()=>(op.vault??webClosureReadVault).read(meta));await op.check();
  if(!saved||!sameClosureRead(saved,meta))throw Error('元の確認用の鍵が必要です。');validate(saved,meta);
  const status=await request(op,'status',meta,saved);await retained(op,saved);
  return status as WebClosureReadStatus|null;
}
export async function listWebClosureReads(options:Options):Promise<readonly WebClosureReadMetadata[]>{
  const op=await operation(options),rows=await op.bound(()=>(op.vault??webClosureReadVault).list(op.expectedAccount??undefined));await op.check();
  if(rows.some(r=>op.expectedAccount!==null&&r.account!==op.expectedAccount))throw Error('保存先のアカウントが一致しません。');return rows;
}
export async function forgetExpiredWebClosureRead(options:Options,input:WebClosureReadMetadata):Promise<void>{
  const meta=closureReadMetadata(input),op=await operation(options);
  if(op.expectedAccount!==null&&op.expectedAccount!==meta.account||Date.parse(meta.expiresAt)>Date.now())throw Error('期限切れの確認情報を選んでください。');
  await op.check();await op.bound(()=>(op.vault??webClosureReadVault).forgetExpired(meta,op.signal));await op.check();
}
/** Explicit local-only cleanup. A displayed/cached completed receipt is never
 * authority: retrieve canonical completion again using the retained original
 * capability. Require Auth already absent so this operation cannot erase a new
 * login, revoke a shared Auth session, or race an account's newer enrollment.
 */
export async function cleanupWebClosurePendingFiles(options:Options,input:WebClosureReadMetadata):Promise<void>{
 const meta=closureReadMetadata(input),op=await operation(options);
 if(op.expectedAccount!==null||op.bearer!==null)throw Error('先にこのブラウザからログアウトしてください。');
 const saved=await op.bound(()=>(op.vault??webClosureReadVault).read(meta));await op.check();
 if(!saved||!sameClosureRead(saved,meta))throw Error('元の確認用の鍵が必要です。');validate(saved,meta);
 const status=await request(op,'status',meta,saved);await retained(op,saved);
 if(status?.state!=='complete')throw Error('退会完了を確認できないため端末のファイルは消去しません。');
 await op.check();
 await op.bound(()=>(op.clearPending??retireBrowserPendingAttachmentScope)(meta.account,meta.epochID,op.signal,meta.expiresAt));
 await op.check();await retained(op,saved);
}
