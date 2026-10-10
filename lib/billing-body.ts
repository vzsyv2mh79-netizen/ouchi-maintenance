/** Bound streamed purchase/notification JSON before parsing or verification. */
export async function readBillingBody(request:Request):Promise<Record<string,unknown>>{
 const limit=65536,declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>limit))throw new Error('Invalid billing payload length');
 if(!request.body)throw new Error('Empty billing payload');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new Error('Billing payload too large');chunks.push(value);}
 }catch(error){try{await reader.cancel();}catch{}throw error;}finally{reader.releaseLock();}
 if(size===0||(declared!==null&&Number(declared)!==size))throw new Error('Billing payload size mismatch');
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Billing payload must be an object');
 return value as Record<string,unknown>;
}
