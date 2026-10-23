import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/billing-notification-inbox.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {normalizedVerifiedNotification:normalize,persistVerifiedNotification:persist}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const event={notificationUUID:'11111111-1111-4111-8111-111111111111',notificationType:'SUBSCRIBED',signedDate:100,data:{environment:'Sandbox'}};
test('verified notification metadata preserves reconciliation work without granting rights',()=>{
 assert.equal(normalize(event,'Sandbox',true).disposition,'transaction_applied');
 assert.equal(normalize(event,'Sandbox',false).disposition,'needs_reconciliation');
 assert.equal(normalize({...event,data:{...event.data,signedRenewalInfo:'synthetic'}},'Sandbox',true).disposition,'needs_reconciliation');
 assert.equal(normalize({...event,notificationType:'TEST'},'Sandbox',false).disposition,'test');
 for(const invalid of [{...event,notificationUUID:'bad'},{...event,notificationUUID:'00000000-0000-0000-0000-000000000000'},{...event,signedDate:1.5},{...event,signedDate:0},{...event,signedDate:Number.MAX_SAFE_INTEGER+1},{...event,subtype:5},{...event,notificationType:'x'.repeat(81)},{...event,data:{environment:'Production'}}])assert.throws(()=>normalize(invalid,'Sandbox',true));
});
test('inbox requires durable strict acknowledgement and hashes exact proof without storing JWS',async()=>{
 const record=normalize(event,'Sandbox',true);let written;
 for(const acknowledgement of ['inserted','duplicate'])await persist('synthetic-notification',record,async(name,args)=>{assert.equal(name,'record_maintenance_verified_notification');written=args;return {data:acknowledgement,error:null};});
 assert.deepEqual(written.payload,record);assert.equal(written.proof_sha256,createHash('sha256').update('synthetic-notification').digest('hex'));assert.equal(JSON.stringify(written).includes('synthetic-notification'),false);
 for(const data of [null,false,[],['inserted'],'saved'])await assert.rejects(()=>persist('synthetic',record,async()=>({data,error:null})));
 await assert.rejects(()=>persist('synthetic',record,async()=>({data:'inserted',error:Error('outage')})));
 await assert.rejects(()=>persist('',record,async()=>{throw Error('must not write');}));
});

test('verified transaction scope is normalized and retirement is acknowledged only for scoped notifications',async()=>{
 const scope={accountToken:'22222222-2222-4222-8222-222222222222',originalTransactionId:'10'};
 const scoped=normalize(event,'Sandbox',true,scope);assert.equal(scoped.accountToken,scope.accountToken);assert.equal(scoped.originalTransactionId,'10');
 await persist('synthetic',scoped,async()=>({data:'retired',error:null}));
 await assert.rejects(()=>persist('synthetic',normalize(event,'Sandbox',false),async()=>({data:'retired',error:null})));
 for(const invalid of [{...scope,accountToken:'bad'},{...scope,originalTransactionId:'unknown'},{...scope,accountToken:'00000000-0000-0000-0000-000000000000'}])assert.throws(()=>normalize(event,'Sandbox',true,invalid));
});
