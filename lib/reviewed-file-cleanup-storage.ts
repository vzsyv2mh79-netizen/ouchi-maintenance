import 'server-only';
import {createHash} from 'node:crypto';
import {createClient,StorageApiError} from '@supabase/supabase-js';
import {createAttachmentFetch} from './attachment-fetch';

type ObjectDescriptor={attachmentID:string;objectPath:string;sizeBytes:number;mime:string;sha256:string};
type CleanupManifest={requestID:string;kind:'personal_file'|'household_file';homeInstanceID:string|null;
 source:ObjectDescriptor&{uploaderID?:string;uploaderEpoch?:string};retained?:ObjectDescriptor};
const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
function validate(m:Readonly<CleanupManifest>){
 const validObject=(o:ObjectDescriptor)=>o&&uuid(o.attachmentID)&&Object.hasOwn(extensions,o.mime)&&Number.isSafeInteger(o.sizeBytes)&&o.sizeBytes>0&&o.sizeBytes<=5242880&&/^[0-9a-f]{64}$/.test(o.sha256);
 if(!m||!uuid(m.requestID)||!(m.homeInstanceID===null||uuid(m.homeInstanceID))||!validObject(m.source))throw Error('Exact reviewed cleanup manifest required');
 const f=m.source,ext=extensions[f.mime];
 if(m.kind==='personal_file'){
  if(!uuid(f.uploaderID)||!uuid(f.uploaderEpoch)||f.objectPath!==`${f.uploaderID}/${f.uploaderEpoch}/${f.attachmentID}.${ext}`)throw Error('Exact reviewed cleanup manifest required');
 }else if(m.kind!=='household_file'||!uuid(m.homeInstanceID)||f.uploaderID!==undefined||f.uploaderEpoch!==undefined||f.objectPath!==`households/${m.homeInstanceID}/${f.attachmentID}.${ext}`)throw Error('Exact reviewed cleanup manifest required');
 const d=m.retained;
 if(d&&(!validObject(d)||!uuid(m.homeInstanceID)||m.kind!=='personal_file'||d.attachmentID===f.attachmentID||d.objectPath!==`households/${m.homeInstanceID}/${d.attachmentID}.${ext}`||d.sizeBytes!==f.sizeBytes||d.mime!==f.mime||d.sha256!==f.sha256))throw Error('Exact retained household object required');
}

/** Dormant server transport, NOT a deletion authorization or worker. A private
 * SQL coordinator must lock and revalidate the typed queue, lease, fingerprints,
 * quiet writers and permanent ID nonreuse protection BEFORE calling this port.
 * No route, default credentials, metadata erase or capacity release is exposed.
 * API absence is not proof of provider-wide physical GC or billing settlement.
 */
export function createReviewedFileCleanupStorage({projectID,secretKey}:{projectID:string;secretKey:string}){
 if(!/^[a-z]{20}$/.test(projectID)||!/^sb_secret_[A-Za-z0-9_-]{1,2000}$/.test(secretKey))throw Error('Explicit private cleanup Storage configuration required');
 const origin=`https://${projectID}.supabase.co`,bucket='ouchi-product-attachments';
 return Object.freeze({cleanup:async(manifest:Readonly<CleanupManifest>,signal:AbortSignal)=>{
  // Copy once: caller mutation across awaits cannot redirect the deletion.
  const m=structuredClone(manifest);validate(m);
  if(!(signal instanceof AbortSignal))throw Error('Bounded cleanup signal required');signal.throwIfAborted();
  const prefix=origin+'/storage/v1/object/'+bucket;
  const client=createClient(origin,secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
   const url=typeof input==='string'?input:input instanceof URL?input.href:input.url,method=init?.method??'GET';
   const read=method==='GET'&&(url===prefix+'/'+m.source.objectPath||(m.retained&&url===prefix+'/'+m.retained.objectPath));
   let remove=false;
   if(method==='DELETE'&&url===prefix&&typeof init?.body==='string'){
    const body=JSON.parse(init.body);
    remove=body&&Object.keys(body).length===1&&Array.isArray(body.prefixes)&&body.prefixes.length===1&&body.prefixes[0]===m.source.objectPath;
   }
   if(!read&&!remove)throw Error('Exact reviewed cleanup Storage operation required');
   return createAttachmentFetch(signal,5000,Math.max(8192,m.source.sizeBytes))(input,{...init,cache:'no-store'});
  }}}).storage.from(bucket);
  async function inspect(file:ObjectDescriptor){
   const {data,error}=await client.download(file.objectPath,{}, {signal,cache:'no-store'});signal.throwIfAborted();
   if(error instanceof StorageApiError&&error.code==='NoSuchKey'&&(error.status===404||(error.status===400&&error.statusCode==='404')))return false;
   if(error||!(data instanceof Blob))throw Error('Cleanup Storage read unconfirmed');
   if(data.size!==file.sizeBytes||data.type!==file.mime||createHash('sha256').update(new Uint8Array(await data.arrayBuffer())).digest('hex')!==file.sha256)throw Error('Cleanup Storage content mismatch');
   signal.throwIfAborted();return true;
  }
  // Preserve the family copy before inspecting or deleting the departing file.
  if(m.retained&&!await inspect(m.retained))throw Error('Retained household object missing');
  if(!await inspect(m.source))return Object.freeze({sourceAbsenceObserved:true,deleteAcknowledged:false,capacityReleaseAuthorized:false});
  let deleteAcknowledged=false;
  try{
   const {data,error}=await client.remove([m.source.objectPath]);signal.throwIfAborted();
   deleteAcknowledged=!error&&Array.isArray(data)&&data.length===1&&data[0]?.name===m.source.objectPath;
  }catch{
   // Transport loss does not prove rollback. Probe only this fixed source; never
   // retry DELETE in this invocation, and never reinterpret cancellation.
   signal.throwIfAborted();
  }
  signal.throwIfAborted();
  if(await inspect(m.source))throw Error('Cleanup source absence unconfirmed');
  return Object.freeze({sourceAbsenceObserved:true,deleteAcknowledged,capacityReleaseAuthorized:false});
 }});
}
