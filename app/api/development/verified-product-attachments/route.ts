import {readAttachmentResponse} from '@/lib/attachment-read-handler';
import {removeProductAttachment} from '@/lib/attachment-removal';
import {storedAttachmentRemovalServices} from '@/lib/attachment-removal-store';
import {createClient} from '@supabase/supabase-js';
import {createAttachmentFetch} from '@/lib/attachment-fetch';
import {storedAttachmentUploadServices} from '@/lib/attachment-upload-store';
import {uploadProductAttachment} from '@/lib/attachment-upload';

export const runtime='nodejs';
/** Formal ledger/attempt adapter against disposable local services only. */
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 const url=process.env.OUCHI_ATTACHMENT_TEST_URL,key=process.env.OUCHI_ATTACHMENT_TEST_SERVICE_KEY;
 if(process.env.NODE_ENV!=='development'||process.env.OUCHI_ATTACHMENT_TEST_MODE!=='true'||url!=='http://127.0.0.1:54321'||!key)return Response.json({error:'Local isolated test only'},{status:503,headers});
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal)}});
 const query=new URL(request.url).searchParams;
 return uploadProductAttachment(request,query.get('productId')??'',query.get('attachmentId')??'',storedAttachmentUploadServices(db,'Sandbox',signal));
}

// Retained reads never require a current paid subscription.
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'},url=process.env.OUCHI_ATTACHMENT_TEST_URL,key=process.env.OUCHI_ATTACHMENT_TEST_SERVICE_KEY;
 if(process.env.NODE_ENV!=='development'||process.env.OUCHI_ATTACHMENT_TEST_MODE!=='true'||url!=='http://127.0.0.1:54321'||!key)return Response.json({error:'Local isolated test only'},{status:503,headers});
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal)}});
 return readAttachmentResponse(request,db);
}

export async function DELETE(request:Request){
 const headers={'Cache-Control':'no-store'};
 const url=process.env.OUCHI_ATTACHMENT_TEST_URL,key=process.env.OUCHI_ATTACHMENT_TEST_SERVICE_KEY;
 if(process.env.NODE_ENV!=='development'||process.env.OUCHI_ATTACHMENT_TEST_MODE!=='true'||url!=='http://127.0.0.1:54321'||!key)return Response.json({error:'Local isolated test only'},{status:503,headers});
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal)}});
 return removeProductAttachment(request,new URL(request.url).searchParams.get('attachmentId')??'',storedAttachmentRemovalServices(db,signal));
}
