import {StorageApiError} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {normalizeFamilyAttachmentPlan,requireFamilyAttachmentProof} from './family-attachment-handoff.mjs';

const bucket='ouchi-product-attachments';
function checkedFile(plan,file){
 const normalized=normalizeFamilyAttachmentPlan({...plan,files:plan.files.map(({destination,...rest})=>{void destination;return rest;})});
 if(JSON.stringify(normalized)!==JSON.stringify(plan))throw Error('Family destination plan changed');
 const expected=normalized.files.find(value=>value.id===file.id);
 if(!expected||JSON.stringify(expected)!==JSON.stringify(file))throw Error('Foreign family file');return expected;
}

/** Prepared service adapter, no implicit credentials, route or bucket creation.
 * clientForSignal must create a dedicated server SDK client with bounded body,
 * fixed trusted origin, redirect refusal and the original signal. guard must
 * independently check signed plan, current lease/phase, frozen manifest,
 * recipient enrollment, reserved quota and DB receipt before each operation.
 * Physical copies alone never authorize a metadata or home ownership switch.
 */
export function createFamilyAttachmentStoragePorts({clientForSignal,guard}) {
 if(typeof clientForSignal!=='function'||typeof guard!=='function')throw Error('Bounded family Storage provider required');
 async function current(scope,plan,file,operation,signal){
  signal.throwIfAborted();if(await guard(scope,plan,file,operation,signal)!==true)throw Error('Family Storage authority unavailable');signal.throwIfAborted();
 }
 async function storage(signal){const client=await clientForSignal(signal);signal.throwIfAborted();if(typeof client?.storage?.from!=='function')throw Error('Family Storage provider unavailable');return client.storage.from(bucket);}
 async function download(scope,plan,file,path,operation,signal){
  await current(scope,plan,file,operation,signal);const api=await storage(signal);
  const result=await api.download(path);await current(scope,plan,file,operation,signal);
  if(!result.data){if(result.error instanceof StorageApiError&&result.error.code==='NoSuchKey')return null;throw Error('Family Storage read unconfirmed');}
  if(result.error||!(result.data instanceof Blob)||result.data.size!==file.size||result.data.type!==file.mime)throw Error('Family Storage content mismatch');
  const bytes=await result.data.arrayBuffer();await current(scope,plan,file,operation,signal);
  if(bytes.byteLength!==file.size||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==file.sha256)throw Error('Family Storage hash mismatch');return result.data;
 }
 return Object.freeze({
  inspectDestination:async(scope,plan,file,signal)=>{const checked=checkedFile(plan,file);return download(scope,plan,checked,checked.destination.path,'inspect',signal);},
  writeDestination:async(scope,plan,file,signal)=>{
   const checked=checkedFile(plan,file);if(checked.source.path===checked.destination.path)throw Error('Member file must remain in place');
   const source=await download(scope,plan,checked,checked.source.path,'copy',signal);if(!source)throw Error('Family original unavailable');
   await current(scope,plan,checked,'copy',signal);const api=await storage(signal);
   const result=await api.upload(checked.destination.path,source,{contentType:checked.mime,upsert:false,cacheControl:'0'});
   await current(scope,plan,checked,'copy',signal);if(result.error||result.data?.path!==checked.destination.path)throw Error('Family copy unconfirmed');
   // The orchestrator independently reads/measures the new bytes. Upload's
   // response alone never returns a verified copy proof or activates ownership.
  },
  removeSource:async(scope,plan,file,proof,signal)=>{
   const checked=checkedFile(plan,file);if(checked.source.path===checked.destination.path)throw Error('Member original cannot be removed');
   requireFamilyAttachmentProof(proof,scope,plan);
   if(!await download(scope,plan,checked,checked.destination.path,'cleanup',signal))throw Error('Family destination missing');
   await current(scope,plan,checked,'cleanup',signal);requireFamilyAttachmentProof(proof,scope,plan);
   const api=await storage(signal);await current(scope,plan,checked,'cleanup',signal);
   const result=await api.remove([checked.source.path]);await current(scope,plan,checked,'cleanup',signal);
   if(result.error)throw Error('Family original removal unconfirmed');
  },
  sourceAbsent:async(scope,plan,file,signal)=>{
   const checked=checkedFile(plan,file);if(checked.source.path===checked.destination.path)throw Error('Member source absence forbidden');
   return await download(scope,plan,checked,checked.source.path,'cleanup',signal)===null;
  }
 });
}
