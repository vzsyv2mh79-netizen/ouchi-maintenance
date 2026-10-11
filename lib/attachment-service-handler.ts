import type {SupabaseClient} from '@supabase/supabase-js';
import type {BillingEnvironment} from './billing';
import {readAttachmentResponse} from './attachment-read-handler';
import {uploadProductAttachment} from './attachment-upload';
import {storedAttachmentUploadServices} from './attachment-upload-store';
import {removeProductAttachment} from './attachment-removal';
import {storedAttachmentRemovalServices} from './attachment-removal-store';

type Deployment={url:string;key:string;environment:BillingEnvironment;storage:string};
/** Explicit opt-in only; live uploads must use the verified ledger, never a client flag or legacy grant. */
export function attachmentDeployment(config:Deployment|null,enabled:string|undefined):Deployment|null{
 if(enabled!=='true'||!config||config.storage!=='verified-ledger'||!config.key||!['Sandbox','Production'].includes(config.environment))return null;
 try{
  const url=new URL(config.url);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.hostname==='.supabase.co'||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/')return null;
 }catch{return null;}
 return config;
}

/** Factories run only after deployment, method and query checks; do not connect a disabled route. */
export async function attachmentServiceResponse(request:Request,config:Deployment|null,createDatabase:(config:Deployment,signal:AbortSignal)=>SupabaseClient){
 const headers={'Cache-Control':'no-store'};
 if(!config)return Response.json({error:'写真・保証書の保存は準備中です。'},{status:503,headers});
 if(!['GET','POST','DELETE'].includes(request.method))return Response.json({error:'Unsupported method'},{status:405,headers:{...headers,Allow:'GET, POST, DELETE'}});
 const query=new URL(request.url).searchParams;
 const allowed=request.method==='GET'?['binding','usage','productId','attachmentId','page','after']:request.method==='POST'?['productId','attachmentId']:['attachmentId'];
 if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))return Response.json({error:'保存先を確認してください。'},{status:400,headers});
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);
 try{
  signal.throwIfAborted();
  const db=createDatabase(config,signal);
  if(request.method==='GET')return await readAttachmentResponse(request,db);
  if(request.method==='POST')return await uploadProductAttachment(request,query.get('productId')??'',query.get('attachmentId')??'',storedAttachmentUploadServices(db,config.environment,signal));
  return await removeProductAttachment(request,query.get('attachmentId')??'',storedAttachmentRemovalServices(db,signal));
 }catch{return Response.json({error:'保存状態を確認できませんでした。'},{status:503,headers});}
}
