import {createHash} from 'node:crypto';

export const attachmentLimits={fileBytes:5*1024*1024,accountBytes:100*1024*1024,accountFiles:100} as const;
export type AttachmentType='image/jpeg'|'image/png'|'application/pdf';
export type ValidatedAttachment={bytes:Uint8Array;size:number;mime:AttachmentType;extension:'jpg'|'png'|'pdf';sha256:string};

/** Server-side bounded reader; names and client-declared sizes are never trusted. */
export async function readProductAttachment(request:Request,timeoutMs=15000):Promise<ValidatedAttachment>{
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error('Invalid attachment reader deadline');
 const mime=request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
 if(!['image/jpeg','image/png','application/pdf'].includes(mime??''))throw new Error('Unsupported attachment type');
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>attachmentLimits.fileBytes))throw new Error('Invalid attachment length');
 if(!request.body)throw new Error('Empty attachment');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(timeoutMs)]);
 const cancel=()=>{void reader.cancel().catch(()=>{});};
 signal.addEventListener('abort',cancel,{once:true});
 try{
  while(true){signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done)break;size+=value.byteLength;
   if(size>attachmentLimits.fileBytes)throw new Error('Attachment too large');chunks.push(value);
  }
 }catch(error){cancel();throw error;}finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
 if(size===0||declared!==null&&Number(declared)!==size)throw new Error('Attachment size mismatch');
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const begins=(prefix:number[])=>prefix.every((byte,index)=>bytes[index]===byte);
 const matches=mime==='image/jpeg'?size>=4&&begins([0xff,0xd8,0xff]):mime==='image/png'?size>=8&&begins([137,80,78,71,13,10,26,10]):size>=8&&begins([37,80,68,70,45]);
 if(!matches)throw new Error('Attachment type mismatch');
 // This is format identification, not sanitization or a malware scanner.
 return {bytes,size,mime:mime as AttachmentType,extension:mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'pdf',sha256:createHash('sha256').update(bytes).digest('hex')};
}
