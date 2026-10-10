import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';import {StorageApiError} from '@supabase/supabase-js';
const code=ts.transpileModule(readFileSync('lib/account-deletion-objects.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));
const {eraseAccountDeletionObjects:erase}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const scope={requestID:'11111111-1111-4111-8111-111111111111',userID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333',leaseToken:'44444444-4444-4444-8444-444444444444'};
const id='55555555-5555-4555-8555-555555555555',path=`${scope.userID}/${scope.epochID}/${id}.png`,item={id,uploaderID:scope.userID,uploaderEpoch:scope.epochID,bucket:'ouchi-product-attachments',path};
test('object erasure only acknowledges explicit SDK absence and exact scoped durable completion',async()=>{
 for(const failure of ['none','remove','access','present','ack','lease','path']){
  let pending=true,removes=0,acknowledgements=0,guards=0;
  const db={rpc:async(name,args)=>{assert.equal(args.target_request,scope.requestID);assert.equal(args.target_epoch,scope.epochID);if(name==='maintenance_deletion_lease_is_current')return {data:!(failure==='lease'&&++guards>2),error:null};if(name==='read_maintenance_deletion_objects')return {data:pending?[{...item,path:failure==='path'?'../../other':path}]:[],error:null};assert.equal(name,'confirm_maintenance_deletion_object_absence');assert.equal(args.target_attachment,id);acknowledgements++;if(failure==='ack')return {data:false,error:null};pending=false;return {data:true,error:null};},storage:{from:bucket=>{assert.equal(bucket,'ouchi-product-attachments');return {remove:async paths=>{assert.deepEqual(paths,[path]);removes++;return {error:failure==='remove'?Error('outage'):null};},download:async()=>({data:failure==='present'?new Blob(['present']):null,error:new StorageApiError('synthetic',404,'404','storage',failure==='access'?'AccessDenied':'NoSuchKey')})};}}};
  if(failure==='none'){assert.deepEqual(await erase(db,scope),{completed:1,allObjectsConfirmed:true});assert.equal(acknowledgements,1);}else{await assert.rejects(()=>erase(db,scope));assert.equal(acknowledgements,failure==='ack'?1:0);}
  if(failure==='path')assert.equal(removes,0);
 }
});
