import type {ReportSession} from './web-report-client';
export type ClosureSessionReader=()=>Promise<ReportSession|null>;
export const closureID=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
export type ClosureTransport={session:ClosureSessionReader;signal:AbortSignal;origin?:string;fetcher?:typeof fetch};
/** Original bearer checked around bounded streamed I/O. The server independently verifies Auth. */
export async function closureJSON(options:ClosureTransport&{account:string;path:'progress'|'request'|'read'|'cancel';body:object;statuses:readonly number[]}){
 if(!closureID(options.account)||!['progress','request','read','cancel'].includes(options.path))throw Error('申請したアカウントを確認してください。');
 const signal=AbortSignal.any([options.signal,AbortSignal.timeout(options.path==='request'?30000:10000)]);
 async function bound<T>(work:()=>Promise<T>):Promise<T>{
  signal.throwIfAborted();let stop:()=>void=()=>{};
  const aborted=new Promise<never>((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
  try{return await Promise.race([Promise.resolve().then(work),aborted]);}finally{signal.removeEventListener('abort',stop);}
 }
 const initial=await bound(options.session);signal.throwIfAborted();
 if(!initial||initial.account!==options.account||!initial.token||initial.token.length>16384||/[\s,]/.test(initial.token))throw Error('申請したアカウントでログインしてください。');
 const captured=Object.freeze({...initial});
 async function check(){const current=await bound(options.session);signal.throwIfAborted();if(current?.account!==captured.account||current?.token!==captured.token)throw Error('ログイン状態が変わりました。確認結果を読み直してください。');}
 const origin=new URL(options.origin??location.origin);
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('確認先を利用できません。');
 const url=new URL('/api/account/closure-review/'+options.path,origin),body=JSON.stringify(options.body);
 if(new TextEncoder().encode(body).length>4096)throw Error('申請内容を確認してください。');
 await check();const response=await bound(()=>(options.fetcher??fetch)(url,{method:'POST',headers:{Authorization:'Bearer '+captured.token,'Content-Type':'application/json'},body,signal,cache:'no-store',redirect:'error',credentials:'omit'}));signal.throwIfAborted();
 if(response.url!==url.href||response.redirected||!options.statuses.includes(response.status)||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json'){
  void response.body?.cancel().catch(()=>{});throw Error('退会の進み具合を確認できません。保存した申請情報は残してください。');
 }
 const declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>4096)){void response.body?.cancel().catch(()=>{});throw Error('確認結果を読み取れません。');}
 const reader=response.body?.getReader();if(!reader)throw Error('確認結果を読み取れません。');
 const chunks:Uint8Array[]=[];let count=0,done=false;
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{for(;;){const part=await bound(()=>reader.read());signal.throwIfAborted();if(part.done){done=true;break;}count+=part.value.byteLength;if(count>4096)throw Error('確認結果を読み取れません。');chunks.push(part.value);}}
 finally{signal.removeEventListener('abort',cancel);if(!done)cancel();reader.releaseLock();}
 if(!count||declared!==null&&Number(declared)!==count)throw Error('確認結果を読み取れません。');
 const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));await check();return {status:response.status,value};
}
