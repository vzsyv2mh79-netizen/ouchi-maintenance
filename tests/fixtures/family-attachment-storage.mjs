import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createClient,StorageApiError} from '@supabase/supabase-js';
import {handoffFamilyAttachments,requireFamilyAttachmentProof} from '../../lib/family-attachment-handoff.mjs';
import {createFamilyAttachmentStoragePorts} from '../../lib/family-attachment-storage.mjs';

// Actual disposable Storage bytes; authority/journal/activation are injected.
// This does not prove signed-controller DB activation, quota or retirement.
export async function verifyDisposableFamilyAttachmentStorage({account,admin,origin,service,options,bytes,createAttachmentFetch}) {
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 const owner=await account(),recipient=await account();
 const ownFile=randomUUID(),memberFile=randomUUID(),homeID=randomUUID(),requestID=randomUUID();
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const input={requestID,homeID,ownerID:owner.user,ownerEpoch:owner.epoch,recipientID:recipient.user,recipientEpoch:recipient.epoch,snapshotDigest:'a'.repeat(64),files:[
  {id:ownFile,mime:'image/png',size:bytes.length,sha256,source:{userID:owner.user,epoch:owner.epoch,path:`${owner.user}/${owner.epoch}/${ownFile}.png`}},
  {id:memberFile,mime:'image/png',size:bytes.length,sha256,source:{userID:recipient.user,epoch:recipient.epoch,path:`${recipient.user}/${recipient.epoch}/${memberFile}.png`}}
 ]};
 const scope={requestID,homeID,userID:owner.user,ownerEpoch:owner.epoch,nativeLease:randomUUID()};
 for(const file of input.files){const uploaded=await admin.storage.from('ouchi-product-attachments').upload(file.source.path,bytes,{contentType:'image/png',upsert:false});assert.equal(uploaded.error,null);}
 let state='absent',activated=0;
 const storage=createFamilyAttachmentStoragePorts({clientForSignal:signal=>createClient(origin,service,{...options,global:{fetch:createAttachmentFetch(signal)}}),guard:async(s,p,f,operation)=>s.requestID===requestID&&p.snapshotDigest===input.snapshotDigest&&p.files.some(file=>file.id===f.id)&&(['inspect'].includes(operation)||operation==='copy'&&state==='prepared'||operation==='cleanup'&&state==='activated')});
 const ports={...storage,guard:async()=>true,plan:async()=>input,
  prepare:async()=>{state='prepared';},
  status:async(s,p)=>({state,planDigest:createHash('sha256').update(JSON.stringify(p)).digest('hex')}),
  activate:async(s,p,d,proof)=>{
   requireFamilyAttachmentProof(proof,s,p);assert.equal(state,'prepared');
   // Before the injected atomic DB boundary, all originals remain readable.
   for(const file of p.files)assert.equal((await admin.storage.from('ouchi-product-attachments').download(file.source.path)).error,null);
   activated++;state='activated';
  },finish:async()=>{state='complete';}
 };
 assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'complete',homeID});assert.equal(activated,1);
 const bucket=admin.storage.from('ouchi-product-attachments');
 const missing=await bucket.download(input.files[0].source.path);assert.ok(missing.error instanceof StorageApiError);assert.equal(missing.error.code,'NoSuchKey');
 const copy=await bucket.download(`${recipient.user}/${recipient.epoch}/${ownFile}.png`);assert.equal(copy.error,null);assert.deepEqual(Buffer.from(await copy.data.arrayBuffer()),bytes);
 const retained=await bucket.download(input.files[1].source.path);assert.equal(retained.error,null);assert.deepEqual(Buffer.from(await retained.data.arrayBuffer()),bytes);
}
