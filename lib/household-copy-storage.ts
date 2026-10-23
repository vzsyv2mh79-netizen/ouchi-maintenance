import 'server-only';
import {createHash} from 'node:crypto';
import {createClient,StorageApiError} from '@supabase/supabase-js';
import {createAttachmentFetch} from './attachment-fetch';
type Manifest={intentID:string;capacityClaimID:string;source:{attachmentID:string;uploaderID:string;uploaderEpoch:string;homeInstanceID:string;objectPath:string;sizeBytes:number;mime:string;sha256:string};destination:{id:string;homeInstanceID:string;objectPath:string;size:number;mime:string;sha256:string}};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'};
function paths(m:Readonly<Manifest>){
 const f=m?.source,d=m?.destination;
 if(!f||!d||![m.intentID,m.capacityClaimID,f.attachmentID,f.uploaderID,f.uploaderEpoch,f.homeInstanceID,d.id].every(uuid)||m.intentID!==m.capacityClaimID
  ||!Object.hasOwn(extensions,f.mime)||!Number.isSafeInteger(f.sizeBytes)||f.sizeBytes<1||f.sizeBytes>5242880||!/^[0-9a-f]{64}$/.test(f.sha256)
  ||f.objectPath!==`${f.uploaderID}/${f.uploaderEpoch}/${f.attachmentID}.${extensions[f.mime]}`||d.homeInstanceID!==f.homeInstanceID||d.mime!==f.mime||d.size!==f.sizeBytes||d.sha256!==f.sha256
  ||d.objectPath!==`households/${f.homeInstanceID}/${d.id}.${extensions[f.mime]}`)throw Error('Exact prepared copy paths required');return {source:f.objectPath,destination:d.objectPath};
}
/** Dedicated server copy-only Storage provider. Explicit project/secret only;
 * no implicit environment, bucket creation, signed URL, upsert or remove method.
 * SQL coordinator independently pins current intent/decision/capacity through
 * I/O. The upload acknowledgement alone is not measured copy confirmation.
 */
export function createHouseholdCopyStorage({projectID,secretKey}:{projectID:string;secretKey:string}){
 if(!/^[a-z]{20}$/.test(projectID)||!/^sb_secret_[A-Za-z0-9_-]{1,2000}$/.test(secretKey))throw Error('Explicit private copy Storage configuration required');
 const origin='https://'+projectID+'.supabase.co',bucket='ouchi-product-attachments';
 function client(m:Readonly<Manifest>,path:string,method:'GET'|'POST',signal:AbortSignal){
  const allowed=paths(m);if((method==='POST'&&path!==allowed.destination)||(method==='GET'&&path!==allowed.source&&path!==allowed.destination))throw Error('Exact copy operation required');if(!(signal instanceof AbortSignal))throw Error('Bounded copy signal required');signal.throwIfAborted();
  const endpoint=origin+'/storage/v1/object/'+bucket+'/'+path;
  return createClient(origin,secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
   const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
   const effectiveMethod=init?.method??(input instanceof Request?input.method:'GET');
   if(url!==endpoint||effectiveMethod!==method||(method==='GET'&&(init?.body!=null||(input instanceof Request&&input.body!==null))))throw Error('Exact copy Storage operation required');
   return createAttachmentFetch(signal,5000,method==='POST'?8192:Math.max(8192,m.destination.size))(input,{...init,cache:'no-store'});
  }}}).storage.from(bucket);
 }
 async function download(m:Readonly<Manifest>,which:'source'|'destination',signal:AbortSignal){
  const path=paths(m)[which],result=await client(m,path,'GET',signal).download(path,{}, {signal,cache:'no-store'});signal.throwIfAborted();
  // Storage v1.74 download wraps NoSuchKey's semantic 404 in HTTP 400.
  // Require the explicit code plus that exact semantic status; generic 400,
  // bucket failures and authorization failures never mean an absent object.
  if(result.error instanceof StorageApiError&&result.error.code==='NoSuchKey'
   &&(result.error.status===404||(result.error.status===400&&result.error.statusCode==='404')))return null;
  if(result.error||!(result.data instanceof Blob))throw Error('Copy Storage read unconfirmed');return result.data;
 }
 return Object.freeze({
  inspectDestination:(m:Readonly<Manifest>,signal:AbortSignal)=>download(m,'destination',signal),
  readSource:(m:Readonly<Manifest>,signal:AbortSignal)=>download(m,'source',signal),
  writeDestination:async(m:Readonly<Manifest>,blob:Blob,signal:AbortSignal)=>{
   const path=paths(m).destination;if(!(blob instanceof Blob)||blob.size!==m.destination.size||blob.type!==m.destination.mime)throw Error('Copy source bytes mismatch');
   const bytes=await blob.arrayBuffer();signal.throwIfAborted();if(createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==m.destination.sha256)throw Error('Copy source bytes mismatch');
   const result=await client(m,path,'POST',signal).upload(path,new Blob([bytes],{type:blob.type}),{upsert:false,contentType:m.destination.mime,cacheControl:'0'});
   signal.throwIfAborted();if(result.error||result.data?.path!==path||result.data?.fullPath!==bucket+'/'+path)throw Error('Copy upload acknowledgement unconfirmed');
  }
 });
}
