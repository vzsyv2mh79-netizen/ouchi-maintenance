import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {createAttachmentFetch} from './attachment-fetch';
type File={attachmentID:string;homeID:string;homeInstanceID:string;objectPath:string;bucket:string;sizeBytes:number;mime:string};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const formats:Record<string,string>={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'};
/** Server composition only: no default credentials, public/signed URL, writes,
 * environment activation or route. Caller must provide an explicitly provisioned
 * project secret. Operator SQL scope and content verification remain mandatory.
 */
export function createClosureHouseholdFileStorageReader({projectID,secretKey}:{projectID:string;secretKey:string}){
 if(!/^[a-z]{20}$/.test(projectID)||!/^sb_secret_[A-Za-z0-9_-]{1,2000}$/.test(secretKey))throw Error('Explicit private Storage configuration required');
 const origin='https://'+projectID+'.supabase.co';
 return async(file:Readonly<File>,signal:AbortSignal)=>{
  if(!(signal instanceof AbortSignal)||!file||![file.attachmentID,file.homeID,file.homeInstanceID].every(uuid)
   ||file.bucket!=='ouchi-product-attachments'||!Object.hasOwn(formats,file.mime)||!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<1||file.sizeBytes>5242880
   ||file.objectPath!==`households/${file.homeInstanceID}/${file.attachmentID}.${formats[file.mime]}`)throw Error('Exact reviewed Storage object required');
  signal.throwIfAborted();const endpoint=origin+'/storage/v1/object/'+file.bucket+'/'+file.objectPath;
  const client=createClient(origin,secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
   const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
   const method=init?.method??(input instanceof Request?input.method:'GET');
   if(url!==endpoint||method!=='GET'||init?.body!=null||(input instanceof Request&&input.body!==null))throw Error('Exact private Storage read required');
   return createAttachmentFetch(signal,5000,file.sizeBytes)(input,{...init,cache:'no-store'});
  }}});
  const {data,error}=await client.storage.from(file.bucket).download(file.objectPath,{}, {signal,cache:'no-store'});
  signal.throwIfAborted();if(error||!(data instanceof Blob))throw Error('Private Storage read unconfirmed');
  return data;
 };
}
