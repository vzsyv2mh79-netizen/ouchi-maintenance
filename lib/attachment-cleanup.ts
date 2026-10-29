/** Explicit bounded worker only. No credentials, endpoint or schedule. */
export type AttachmentCleanupScope=Readonly<{id:string;user:string;epoch:string;owner:string;path:string;mime:string;lease:string}>;
export type AttachmentCleanupServices={
 candidates:(signal:AbortSignal)=>Promise<unknown>;
 claim:(id:string,lease:string,signal:AbortSignal)=>Promise<unknown>;
 current:(scope:AttachmentCleanupScope,signal:AbortSignal)=>Promise<boolean>;
 remove:(scope:AttachmentCleanupScope,signal:AbortSignal)=>Promise<void>;
 absent:(scope:AttachmentCleanupScope,signal:AbortSignal)=>Promise<boolean>;
 complete:(scope:AttachmentCleanupScope,signal:AbortSignal)=>Promise<boolean>;
};
const valid=(value:unknown):value is string=>typeof value==='string'
 &&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
 &&value!=='00000000-0000-0000-0000-000000000000';
export function checkedAttachmentCleanupScope(value:unknown,id:string,lease:string):AttachmentCleanupScope{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Cleanup scope unavailable');
 const item=Object.freeze({...value}) as AttachmentCleanupScope;
 const extension=item.mime==='image/png'?'png':item.mime==='image/jpeg'?'jpg':item.mime==='application/pdf'?'pdf':null;
 if(Object.keys(item).sort().join(',')!=='epoch,id,lease,mime,owner,path,user'
  ||![item.id,item.user,item.epoch,item.owner,item.lease].every(valid)
  ||item.id!==id||item.lease!==lease||item.user===item.epoch||!extension
  ||item.path!==`${item.user}/${item.epoch}/${item.id}.${extension}`)throw Error('Cleanup scope unavailable');
 return item;
}
/** A completed count is only this bounded batch, never whole-account erasure
 * or a retention SLA. Uncertain outcomes remain deferred, with durable SQL
 * fences/quota retained until the current lease acknowledges physical absence.
 */
export async function runAttachmentCleanupBatch(services:AttachmentCleanupServices,signal:AbortSignal){
 if(!(signal instanceof AbortSignal)||!services
  ||['candidates','claim','current','remove','absent','complete'].some(key=>typeof services[key as keyof AttachmentCleanupServices]!=='function'))throw Error('Explicit cleanup providers required');
 const ports=Object.freeze({...services});signal.throwIfAborted();
 let raw:unknown;
 try{raw=await ports.candidates(signal);}catch{signal.throwIfAborted();throw Error('Cleanup inventory unavailable');}
 signal.throwIfAborted();
 if(!Array.isArray(raw))throw Error('Cleanup inventory unavailable');
 const length=raw.length;
 if(!Number.isSafeInteger(length)||length<0||length>25)throw Error('Cleanup inventory unavailable');
 // Capture each candidate once before validating it, without trusting a
 // provider's iterator or allowing an accessor to replace a checked target.
 const ids=Object.freeze(Array.from({length},(_,index)=>raw[index]));
 if(ids.some(id=>!valid(id))||new Set(ids).size!==length)throw Error('Cleanup inventory unavailable');
 let completed=0,deferred=0;
 for(const id of ids){
  signal.throwIfAborted();
  try{
   const lease=crypto.randomUUID();const value=await ports.claim(id,lease,signal);signal.throwIfAborted();
   if(value===null){deferred++;continue;}
   const scope=checkedAttachmentCleanupScope(value,id,lease);
   const current=async()=>{signal.throwIfAborted();const ok=await ports.current(scope,signal);signal.throwIfAborted();if(ok!==true)throw Error('Cleanup lease unavailable');};
   await current();
   try{await ports.remove(scope,signal);}catch{/* The same object may already be gone; reconcile below. */}
   await current();
   if(await ports.absent(scope,signal)!==true)throw Error('Physical absence unconfirmed');
   await current();
   if(await ports.complete(scope,signal)!==true)throw Error('Cleanup acknowledgement unavailable');
   signal.throwIfAborted();completed++;
  }catch{signal.throwIfAborted();deferred++;}
 }
 return {attempted:ids.length,completed,deferred};
}
