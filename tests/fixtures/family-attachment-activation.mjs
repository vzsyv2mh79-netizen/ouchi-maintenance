import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {seedHomeHandoffFullSchemaFixture} from './home-handoff-full-schema.mjs';
import {owner,recipient,home,product,oe,re,rs} from './home-handoff-identifiers.mjs';
import {createHouseholdHandoffPort,snapshotDigest} from './handoff-controller-compatibility/handoff-port.mjs';
import {createHandoffConsentIssuer,handoffPlanDigest} from './handoff-controller-compatibility/handoff-consent.mjs';
import {createFamilyAttachmentJournal} from '../../lib/family-attachment-journal.mjs';
import {createFamilyAttachmentActivation} from '../../lib/family-attachment-activation.mjs';
import {handoffFamilyAttachments} from '../../lib/family-attachment-handoff.mjs';
import {runWithTransactionCommitChecks} from '../../lib/transaction-commit-checks.mjs';

export async function familyAttachmentActivationFixture({prepared=true,reserve=true,postAuthority=true,inventoryAuthorize=async()=>true,activationAuthorize=null,memberOnly=false,omitReceipt=false,commitFault=null,extraControllerApps=[],schemaOptions,beforeFreeze=async()=>{},beforeInitialConsents}={}){
 const db=await seedHomeHandoffFullSchemaFixture(schemaOptions);await db.exec('reset role');
 const bytes=new Uint8Array([1,2,3,4]),sha=createHash('sha256').update(bytes).digest('hex');
 const owned=randomUUID(),member=randomUUID(),nativeRequest=randomUUID(),nativeLease=randomUUID();
 const descriptions=memberOnly?[[member,recipient,re]]:[[owned,owner,oe],[member,recipient,re]];
 for(const [id,user,epoch] of descriptions){
  await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,expected_sha256,sha256,write_tracking,captured_owner_id) values($1,$2,$3,$4,4,'image/png','stored',$5,$5,true,$6)",[id,user,epoch,product,sha,owner]);
  await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$4,$5,'settled',clock_timestamp())",[id,randomUUID(),user,owner,epoch]);
 }
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1)",[nativeRequest,owner,oe,nativeLease]);
 await beforeFreeze(db,nativeRequest);
 for(const name of ['household-fence.sql','scoped-worker.sql','handoff.sql','private-writers.sql'])await db.exec(readFileSync('tests/fixtures/handoff-controller-compatibility/'+name,'utf8'));
 for(const name of ['journal','quota','activation'])await db.exec(readFileSync('tests/fixtures/family-attachment-'+name+'.sql','utf8'));
 const controllerScope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner,leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:nativeRequest,scopeID:oe},...extraControllerApps]};
 await db.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','requested')",[owner,controllerScope,nativeLease]);
 await db.query('select maintenance_private.freeze_household_scope($1,$2)',[controllerScope,nativeLease]);
 const saved=(await db.query('select maintenance_private.household_family_snapshot($1) as value',[home])).rows[0].value;
 const consentPlan={protocolVersion:2,requestID:controllerScope.requestID,userID:owner,inventoryDigest:controllerScope.inventoryDigest,appRequestID:nativeRequest,appScopeID:oe,householdID:home,successorID:recipient,memberIDs:[owner,recipient],familyRecordIDs:[product],familySnapshotDigest:snapshotDigest(saved)};
 await db.query('insert into maintenance_private.household_handoff_plans values($1,$2,$3,$4,$5,$6,$7)',[home,owner,recipient,controllerScope,consentPlan,handoffPlanDigest(controllerScope,consentPlan),saved]);
 await db.query('insert into maintenance_private.household_family_holds values($1,$2,$3)',[home,owner,controllerScope]);
 const scope={requestID:controllerScope.requestID,homeID:home,userID:owner,ownerEpoch:oe,nativeRequestID:nativeRequest,nativeLease,controllerScope};
 const plan={requestID:scope.requestID,homeID:home,ownerID:owner,ownerEpoch:oe,recipientID:recipient,recipientEpoch:re,snapshotDigest:consentPlan.familySnapshotDigest,files:descriptions.map(([id,userID,epoch])=>({id,size:4,mime:'image/png',sha256:sha,source:{userID,epoch,path:`${userID}/${epoch}/${id}.png`}}))};
 const key=randomBytes(32);
 let initialProviders=null,accessTokenForActor=null;
 if(beforeInitialConsents!==undefined){
  if(typeof beforeInitialConsents!=='function')throw Error('Explicit original-identity intake required');
  const intake=await beforeInitialConsents({db,controllerScope,consentPlan,scope,plan,saved,householdKey:key});
  if(!intake||typeof intake.providers?.issueHousehold!=='function'||typeof intake.providers?.createInventoryConsent!=='function'||typeof intake.accessTokenForActor!=='function')throw Error('Actual initial consent providers required');
  initialProviders=intake.providers;accessTokenForActor=intake.accessTokenForActor;
  for(const actor of [owner,recipient]){
   const bearer=await accessTokenForActor(actor);
   if(typeof bearer!=='string'||bearer===actor)throw Error('Real bearer required for initial family consent');
   assert.equal((await initialProviders.issueHousehold(bearer,new AbortController().signal)).status,'accepted');
  }
 }else{
 const adapter=tx=>({signal:tx.signal,beforeCommit:tx.beforeCommit,query:async(sql,args)=>{const r=await tx.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length};}});
  const issuer=createHandoffConsentIssuer({key,verifyIdentity:async actor=>({userID:actor,authVerifiedAt:Date.now()}),store:{
  transaction:cb=>db.transaction(tx=>cb(adapter(tx))),target:async()=>({scope:controllerScope,plan:consentPlan}),
  existing:async(tx,s,p,actor)=>{const r=(await tx.query('select * from maintenance_private.household_handoff_consents where home_id=$1 and actor_id=$2 for update',[home,actor])).rows[0];return r?{actorID:r.actor_id,token:r.token,revokedAt:r.revoked_at}:null;},
  record:(tx,s,p,actor,token)=>tx.query('insert into maintenance_private.household_handoff_consents values($1,$2,$3,null)',[home,actor,token])
 }});
 for(const actor of [owner,recipient])assert.equal((await issuer({requestID:controllerScope.requestID,householdID:home,accessToken:actor,confirmation:'家族データの引き継ぎに同意する'})).status,'accepted');
 }
 const adapter=tx=>({signal:tx.signal,beforeCommit:tx.beforeCommit,query:async(sql,args)=>{const r=await tx.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length};}});
 // Default path uses synthetic identity. Explicit intake bypasses it entirely;
 // inventory/freeze authorization remains independently injected. No runtime activation.
 const journal=createFamilyAttachmentJournal({transaction:cb=>db.transaction(tx=>cb(adapter(tx))),authorize:inventoryAuthorize});
 if(prepared)await journal[reserve?'reserve':'record'](scope,plan,new AbortController().signal);
 const objects=new Map(plan.files.map(f=>[f.source.path,new Blob([bytes],{type:'image/png'})]));
 let checks=0,removals=0,lateAuthWindow=null,lateAuthReceiptWritten=false,activationError=null;
 const ports={guard:async()=>true,plan:async()=>plan,prepare:async()=>{throw Error('Preparation already persisted');},
  status:async(s,p)=>({state:(await db.query('select 1 from maintenance_private.family_attachment_activation_receipts where request_id=$1',[scope.requestID])).rows.length?'activated':'prepared',planDigest:createHash('sha256').update(JSON.stringify(p)).digest('hex')}),
  inspectDestination:async(s,p,f)=>objects.get(f.destination.path)??null,
  writeDestination:async(s,p,f)=>{objects.set(f.destination.path,objects.get(f.source.path));},
  activate:async(s,p,d,proof,signal)=>{
   const activation=createFamilyAttachmentActivation({scope:s,plan,proof,signal,authorize:async(...args)=>(++checks===1||postAuthority)&&await (activationAuthorize??inventoryAuthorize)(...args)});
   try{await db.transaction(raw=>runWithTransactionCommitChecks(adapter(raw),signal,pinned=>{
    // Fault injection: a lying adapter claims the receipt was inserted. The DB
    // deferred group check must still refuse COMMIT using actual persisted rows.
    const guarded={signal:pinned.signal,
     // Deliberately faulty backend for the existing SQL-deadline witness only.
     beforeCommit:commitFault==='recentAuthenticationExpired'?()=>{}:pinned.beforeCommit,
     query:async(sql,args)=>{
     if(omitReceipt&&sql.startsWith('insert into maintenance_private.family_attachment_activation_receipts'))return {rows:[],rowCount:1};
     if(commitFault==='foreignReceiptContext'&&sql.startsWith('insert into maintenance_private.family_attachment_activation_receipts')){
      return pinned.query('insert into maintenance_private.family_attachment_activation_receipts(request_id,home_id,plan_digest,inventory_digest,expected_inventory_digest,activation_token) values($1,$2,$3,$4,$5,$6)',[...args,randomUUID()]);
     }

     if(commitFault&&sql.startsWith('insert into maintenance_private.household_handoff_receipts')){
      if(commitFault==='inventorySessionLost')await pinned.query('delete from auth.sessions where id=$1',[rs]);
      if(commitFault==='recentAuthenticationExpired'){
       const row=(await pinned.query('select extract(epoch from(expires_at-clock_timestamp()))*1000 as remaining from maintenance_private.family_attachment_inventory_approvals where transaction_id=txid_current()')).rows[0];
       lateAuthWindow=Number(row?.remaining);
       await pinned.query('select pg_sleep(3.2)');
      }
      if(commitFault==='missingRoute')await pinned.query("delete from maintenance_private.household_write_routes where kind='products' and object_id=$1",[product]);
      if(commitFault==='expiredBinding')await pinned.query("update maintenance_private.household_stop_bindings set lease_until=clock_timestamp()-interval '1 second' where user_id=$1",[owner]);
      if(commitFault==='revokedInventoryConsent')await pinned.query('update maintenance_private.family_attachment_inventory_consents set revoked_at=clock_timestamp() where request_id=$1 and home_id=$2 and actor_id=$3',[scope.requestID,home,recipient]);
      if(commitFault==='revokedConsent')await pinned.query('update maintenance_private.household_handoff_consents set revoked_at=clock_timestamp() where home_id=$1 and actor_id=$2',[home,recipient]);
     }
     const result=await pinned.query(sql,args);
     if(['recentAuthenticationExpired','inventorySessionLost'].includes(commitFault)&&sql.startsWith('insert into maintenance_private.household_handoff_receipts'))lateAuthReceiptWritten=true;
     return result;
    }};
    return createHouseholdHandoffPort(key,activation)(controllerScope,nativeLease,home,guarded);
   }));}catch(error){activationError=error;throw error;}
  },
  removeSource:async()=>{removals++;throw Error('Cleanup intentionally not implemented in this activation fixture');},
  sourceAbsent:async()=>false,finish:async()=>{throw Error('Activation is not whole-account completion');}
 };
 return {db,scope,plan,ports,objects,owned,member,key,saved,journal,initialProviders,accessTokenForActor,get removals(){return removals;},get lateAuthWindow(){return lateAuthWindow;},get lateAuthReceiptWritten(){return lateAuthReceiptWritten;},get activationError(){return activationError;},run:()=>handoffFamilyAttachments(scope,ports,new AbortController().signal)};
}

