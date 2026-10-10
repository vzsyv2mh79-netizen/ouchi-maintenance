import {createClient,StorageApiError} from '@supabase/supabase-js';
type Job={id:string;user:string;epoch:string;path:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Explicit invocation only, disposable services only. No production scheduler. */
export async function eraseIsolatedAttachmentBatch(){
 const url=process.env.OUCHI_ATTACHMENT_TEST_URL,key=process.env.OUCHI_ATTACHMENT_TEST_SERVICE_KEY;
 if(process.env.NODE_ENV!=='development'||process.env.OUCHI_ATTACHMENT_TEST_MODE!=='true'||url!=='http://127.0.0.1:54321'||!key)throw new Error('Local isolated erasure only');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await db.rpc('pending_maintenance_attachment_erasures',{batch_limit:25});
 if(result.error||!Array.isArray(result.data)||result.data.length>25)throw new Error('Erasure queue unavailable');
 const jobs=result.data as Job[];
 for(const job of jobs){
  if(!job||[job.id,job.user,job.epoch].some(id=>typeof id!=='string'||!uuid.test(id)||id==='00000000-0000-0000-0000-000000000000')||typeof job.path!=='string'||!['png','jpg','pdf'].some(extension=>job.path===`${job.user}/${job.epoch}/${job.id}.${extension}`))throw new Error('Invalid erasure path');
 }
 if(new Set(jobs.map(job=>job.id)).size!==jobs.length)throw new Error('Duplicate erasure queue');
 const bucket=db.storage.from('ouchi-product-attachments-test');let completed=0,deferred=0;
 for(const job of jobs){try{
  const removed=await bucket.remove([job.path]);if(removed.error)throw new Error('Removal not confirmed');
  const missing=await bucket.download(job.path);
  if(missing.data||!(missing.error instanceof StorageApiError)||missing.error.code!=='NoSuchKey')throw new Error('Object absence not confirmed');
  const finished=await db.rpc('finish_maintenance_attachment_erasure',{target_attachment:job.id});if(finished.error||finished.data!==true)throw new Error('Erasure completion not confirmed');
  completed++;
 }catch{deferred++;}}
 return {completed,deferred};
}
