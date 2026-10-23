/** Server-only bounded transport. A timeout is not proof that a write rolled back. */
export function createAttachmentFetch(callerSignal?:AbortSignal,timeoutMs=10000,maxBytes=5*1024*1024):typeof fetch{
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>5*1024*1024)throw new Error('Invalid attachment transport bounds');
 return async(input,init)=>{
  const signals=[AbortSignal.timeout(timeoutMs)];
  if(callerSignal)signals.push(callerSignal);
  if(input instanceof Request)signals.push(input.signal);
  if(init?.signal)signals.push(init.signal);
  const signal=AbortSignal.any(signals);
  const upstream=await fetch(input,{...init,redirect:'error',signal});
  const declared=upstream.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>maxBytes)){
   void upstream.body?.cancel().catch(()=>{});
   throw new Error('Attachment response too large');
  }
  signal.throwIfAborted();
  if(!upstream.body)return upstream;
  const reader=upstream.body.getReader(),chunks:Uint8Array[]=[];
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  let size=0,finished=false;
  try{
   while(true){
    signal.throwIfAborted();
    const {done,value}=await reader.read();
    signal.throwIfAborted();
    if(done){finished=true;break;}
    size+=value.byteLength;
    if(size>maxBytes)throw new Error('Attachment response too large');
    chunks.push(value);
   }
  }finally{
   signal.removeEventListener('abort',cancel);
   if(!finished)cancel();
   reader.releaseLock();
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const headers=new Headers(upstream.headers);
  // fetch may have decompressed the bytes; do not retain the wire encoding/size.
  headers.delete('content-encoding');headers.set('content-length',String(size));
  return new Response(bytes,{status:upstream.status,statusText:upstream.statusText,headers});
 };
}
