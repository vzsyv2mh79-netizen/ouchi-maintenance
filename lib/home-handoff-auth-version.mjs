// Prepared server-only discovery. A health response is never consent, current
// MFA configuration or authorization. No implicit key discovery or activation.
async function bounded(promise,signal){
 signal.throwIfAborted();let reject;
 const cancelled=new Promise((_,fail)=>{reject=fail;});
 const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
 try{return await Promise.race([promise,cancelled]);}
 finally{signal.removeEventListener('abort',abort);}
}
export function createHomeHandoffAuthVersionReader({projectID,publishableKey,fetcher=fetch,clock=Date.now,timeoutMS=3000}){
 if(typeof projectID!=='string'||!/^[a-z]{20}$/.test(projectID)
  ||typeof publishableKey!=='string'||publishableKey.length>2048||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)
  ||typeof fetcher!=='function'||typeof clock!=='function'||!Number.isInteger(timeoutMS)||timeoutMS<1||timeoutMS>15000)
  throw Error('Explicit project and publishable key required');
 const endpoint='https://'+projectID+'.supabase.co/auth/v1/health';
 const issued=new WeakMap();
 const fresh=record=>{const time=clock(),checked=Date.parse(record.checkedAt);return Number.isFinite(time)&&Number.isFinite(checked)&&checked<=time&&time-checked<60000;};
 const read=async callerSignal=>{
  if(!(callerSignal instanceof AbortSignal))return null;
  const signal=AbortSignal.any([callerSignal,AbortSignal.timeout(timeoutMS)]);
  let response,reader;
  try{
   signal.throwIfAborted();
   await bounded(Promise.resolve().then(()=>fetcher(endpoint,{method:'GET',headers:{apikey:publishableKey,accept:'application/json'},redirect:'error',cache:'no-store',signal})).then(value=>{
    response=value;if(signal.aborted)void value?.body?.cancel().catch(()=>{});return value;
   }),signal);
   signal.throwIfAborted();
   if(response.status!==200||response.redirected||(response.url&&response.url!==endpoint)||!response.body
    ||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))return null;
   const declared=response.headers.get('content-length');
   if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>8192))return null;
   reader=response.body.getReader();const chunks=[];let count=0;
   for(;;){
    const next=await bounded(reader.read(),signal);signal.throwIfAborted();if(next.done)break;
    count+=next.value.byteLength;if(count>8192)return null;chunks.push(next.value);
   }
   const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   const health=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(health?.name!=='GoTrue'||typeof health.version!=='string'||!/^v\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(health.version))return null;
   const observed=clock();if(!Number.isSafeInteger(observed)||observed<=0)return null;
   const record=Object.freeze({projectID,authVersion:health.version,checkedAt:new Date(observed).toISOString()});
   signal.throwIfAborted();if(!fresh(record))return null;issued.set(record,callerSignal);return record;
  }catch{return null;}
  finally{if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}else{void response?.body?.cancel().catch(()=>{});}}
 };
 // Unknown semver may be discovered here; the existing policy reader still
 // rejects unreviewed versions and requires independent effective low-AAL state.
 return Object.freeze(Object.assign(read,{isCurrent:record=>{
  const caller=issued.get(record);return !!caller&&!caller.aborted&&fresh(record);
 }}));
}
