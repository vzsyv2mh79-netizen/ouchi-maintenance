import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {seedClosureReauthenticationDatabase} from './closure-reauth-database.mjs';
import {owner as fixtureOwner,recipient as fixtureRecipient,oe as fixtureEpoch,re as fixtureRecipientEpoch} from './home-handoff-identifiers.mjs';
import {seedSharedNativeMetadata,metadataRows} from './shared-native-metadata.mjs';
import {seedSharedNativeDevices,deviceRows} from './shared-native-devices.mjs';
import {composeSharedMaintenanceHandlers} from './shared-maintenance-adapter-module.mjs';
import {createDeletionJournal} from './kakei-completion/lib/shared-deletion-journal.mjs';
import {runSharedDeletion} from '../../lib/shared-deletion-protocol.mjs';
import {runWithTransactionCommitChecks} from '../../lib/transaction-commit-checks.mjs';
import {withSharedMaintenanceClosureMetadata as boundary} from '../../lib/shared-maintenance-closure-metadata.mjs';

// Full controller sequencing with actual app worker/canonical SQL. Defaults to
// PGlite Auth; optional guarded disposable services use managed Auth hooks.
// Inventory/retention are synthetic and there are no files/other-app accounts.
// Never production intake, managed deployment or full writer-coverage proof.
export async function seedSharedMaintenanceComposition({lostStage=null,postAuthFailure=false,unknownSend=false,receiptIndependent=true,services=null}={}){
 if(services){assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(services.origin,'http://127.0.0.1:54321');}
 const owner=services?.actor.user??fixtureOwner,oe=services?.actor.epoch??fixtureEpoch,recipient=services?.bystander.user??fixtureRecipient,re=services?.bystander.epoch??fixtureRecipientEpoch;
 const db=services?.db??await seedClosureReauthenticationDatabase();if(!services)await db.exec('reset role;delete from public.home_members');
 if(receiptIndependent&&!services)await db.exec(readFileSync('supabase/migrations/20261015052134_ouchi_deletion_receipt_auth_independence.sql','utf8'));
 const native={requestID:randomUUID(),userID:owner,epochID:oe,leaseToken:randomUUID()};
 const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner,leaseToken:randomUUID(),inventoryDigest:'e'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:native.requestID,scopeID:oe}]};
 const inventory={...scope};delete inventory.leaseToken;
 await seedSharedNativeMetadata(db,[[owner,oe],[owner,randomUUID()],[recipient,re]]);
 await seedSharedNativeDevices(db,[[owner,oe],[owner,randomUUID()],[recipient,re]]);
 if(unknownSend)await db.query("update public.maintenance_push_subscriptions set claim_token=$2,claimed_until=clock_timestamp()-interval '1 hour' where user_id=$1",[owner,randomUUID()]);
 if(!services){
 for(const file of ['household-fence.sql','scoped-worker.sql','handoff.sql','private-writers.sql'])await db.exec(readFileSync('tests/fixtures/handoff-controller-compatibility/'+file,'utf8'));
 await db.exec(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
 await db.exec(readFileSync('tests/fixtures/shared-maintenance-native-stage.sql','utf8'));
 }
 const keptMetadata=await metadataRows(db,recipient),keptDevices=await deviceRows(db,recipient);
 await db.exec('create table if not exists private.composition_fixture_inventory(user_id uuid,app text,request_id uuid,scope_id uuid,primary key(user_id,app));alter table private.composition_fixture_inventory enable row level security;revoke all on private.composition_fixture_inventory from public,anon,authenticated,service_role');
 await db.query('insert into private.composition_fixture_inventory values($1,$2,$3,$4)',[owner,'ouchi-maintenance',native.requestID,oe]);
 const controller=new AbortController(),calls=[],args=[native.requestID,owner,oe,native.leaseToken];
 const transaction=async work=>{await db.exec('begin');try{const value=await runWithTransactionCommitChecks(db,controller.signal,work);await db.exec('commit');return value;}catch(error){await db.exec('rollback');throw error;}};
 const coverage=async tx=>{
  const rows=(await tx.query('select app,request_id,scope_id from private.composition_fixture_inventory where user_id=$1 order by app',[owner])).rows;
  return JSON.stringify(rows)===JSON.stringify([{app:'ouchi-maintenance',request_id:native.requestID,scope_id:oe}]);
 };
 const family=async tx=>(await tx.query(`select not exists(select 1 from public.home_members m join public.homes h on h.id=m."homeId" where h.owner_id=$1 and m.user_id<>$1)
  and not exists(select 1 from public.home_members m join public.homes h on h.id=m."homeId" where m.user_id=$1 and h.owner_id<>$1) allowed`,[owner])).rows[0].allowed===true;
 const sessions=async tx=>(await tx.query('select exists(select 1 from auth.sessions where user_id=$1 and (not_after is null or not_after>clock_timestamp())) allowed',[owner])).rows[0].allowed===true;
 const gates=async tx=>await coverage(tx)&&await family(tx)&&await sessions(tx);
 const absent=async tx=>(await tx.query('select not exists(select 1 from auth.users where id=$1) and not exists(select 1 from auth.sessions where user_id=$1) absent',[owner])).rows[0].absent===true;
 const confirmed=async tx=>(await tx.query('select public.maintenance_deletion_completion_is_confirmed($1,$2,$3,$4) value',args)).rows[0].value===true;
 const stopped=async tx=>(await tx.query("select exists(select 1 from maintenance_private.household_stop_bindings b join maintenance_private.household_principal_fences f on f.user_id=b.user_id where b.user_id=$1 and b.scope=$2::jsonb and b.native_lease=$3 and b.state='processing' and b.lease_until>clock_timestamp() and f.stopped) value",[owner,scope,native.leaseToken])).rows[0].value===true;
 const current=async tx=>(await tx.query("select scope=$2::jsonb and status='processing' and lease_token=$3 and lease_until>clock_timestamp() value from private.kb_shared_deletion_journal where request_id=$1",[scope.requestID,inventory,scope.leaseToken])).rows[0]?.value===true&&await stopped(tx)&&await gates(tx);
 const afterAuth=async tx=>!postAuthFailure&&await coverage(tx)&&await family(tx)&&await absent(tx)&&await stopped(tx)&&await confirmed(tx);
 const peerCheck=name=>async(s,tx)=>{assert.deepEqual(s,scope);calls.push('peer:'+name);return await coverage(tx)&&!s.apps.some(app=>app.app==='kakei')&&(name.endsWith('AfterAuth')?await afterAuth(tx):await gates(tx));};
 const peer={handoffFamily:peerCheck('handoffFamily'),verifyFamily:peerCheck('verifyFamily'),verifySessions:peerCheck('verifySessions'),verifyFamilyAfterAuth:peerCheck('verifyFamilyAfterAuth'),verifySessionsAfterAuth:peerCheck('verifySessionsAfterAuth'),erase:async()=>{throw Error('No Kakei erasure fixture supplied');},verify:async()=>{throw Error('No Kakei account in this fixture');}};
 const makePorts=(s,tx)=>{
  assert.deepEqual(s,scope);
  return {
   resolve:async()=>{
    const row=(await tx.query("select n.id,n.user_id,n.app_epoch_id,coalesce(n.lease_token,n.completion_lease) lease from maintenance_private.account_deletion_requests n join maintenance_private.household_stop_bindings b on b.user_id=n.user_id and b.native_lease=coalesce(n.lease_token,n.completion_lease) where n.id=$1 and b.scope=$2::jsonb and b.state='processing'",[native.requestID,scope])).rows[0];
    return row?{requestID:row.id,userID:row.user_id,epochID:row.app_epoch_id,leaseToken:row.lease}:null;
   },
   atomic:async(mapping,n,phase)=>{
    assert.deepEqual(mapping.shared,scope);assert.deepEqual(n,native);calls.push('native:'+phase);
    if(!await current(tx))return false;
    if(phase==='completionAlreadyConfirmed')return confirmed(tx);
    if(phase==='leaseCurrent')return (await tx.query('select public.maintenance_deletion_lease_is_current($1,$2,$3,$4) value',args)).rows[0].value===true;
    if(phase==='revokeAndCaptureInventory')return (await tx.query('select inventory_captured from maintenance_private.account_deletion_requests where id=$1',[native.requestID])).rows[0]?.inventory_captured===true;
    // No physical file fixture: refuse rather than substitute metadata absence
    // for a Storage acknowledgement or invent a remote side-effect adapter.
    if(phase==='eraseAttachments')return (await tx.query('select not exists(select 1 from maintenance_private.account_deletion_objects where request_id=$1) value',[native.requestID])).rows[0].value===true;
    const stage=name=>boundary(tx,scope,native,name,async inner=>(await inner.query('select maintenance_private.run_shared_native_stage($1,$2,$3) value',[scope,native.leaseToken,name])).rows[0].value,gates);
    if(phase==='finalizeIdentityAndRetention')return await stage('captureReceiptSessions')&&await stage('eraseIdentity');
    return stage(phase);
   },
   verify:async()=>{calls.push('native:verify');return await current(tx)&&await confirmed(tx);},
   handoff:async()=>{calls.push('native:handoff');return gates(tx);},
   family:async()=>{calls.push('native:family');return gates(tx);},
   sessions:async()=>{calls.push('native:sessions');return gates(tx);},
   familyAfterAuth:async()=>{calls.push('native:familyAfterAuth');return afterAuth(tx);},
   sessionsAfterAuth:async()=>{calls.push('native:sessionsAfterAuth');return afterAuth(tx);},
  };
 };
 const composed=composeSharedMaintenanceHandlers(makePorts,peer,controller.signal);
 const handlers={...composed,
  'verify-coverage':async(s,tx)=>{assert.deepEqual(s,scope);return coverage(tx);},
  prepare:async(s,tx)=>{
   assert.deepEqual(s,scope);if(!await gates(tx))return false;
   await tx.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,clock_timestamp()+interval '5 minutes')",args);
   if((await tx.query('select public.capture_maintenance_deletion_objects($1,$2,$3,$4) value',args)).rows[0].value!==true)return false;
   await tx.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-composition-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[native.requestID]);
   await tx.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','requested')",[owner,scope,native.leaseToken]);
   await tx.query('select maintenance_private.freeze_household_scope($1,$2)',[scope,native.leaseToken]);return true;
  },
  'erase-auth':async(s,tx)=>{
   assert.deepEqual(s,scope);if(!await gates(tx)||!await confirmed(tx))return false;calls.push('auth:erase');
   if(services)return await services.eraseAuth(s,tx)===true&&await absent(tx);
   // Local-only synthetic Auth rows. The separate actual-service hook must use
   // managed Auth plus an independently committed fixed dispatch reservation.
   await tx.query('delete from auth.sessions where user_id=$1',[owner]);await tx.query('delete from auth.users where id=$1',[owner]);return absent(tx);
  },
  'verify-auth':async(s,tx)=>{assert.deepEqual(s,scope);calls.push('auth:verify');return (!services||await services.verifyAuth(s,tx)===true)&&await absent(tx);},
  complete:async(s,tx)=>{assert.deepEqual(s,scope);return afterAuth(tx);},
 };
 const journal=createDeletionJournal({query:(...args)=>db.query(...args),transaction},handlers);
 await journal.create(scope);assert.equal(await journal.claim(scope),true);
 assert.deepEqual((await db.query('select receipts from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].receipts,{},'No prior-stage receipts may be seeded');
 const errors=[];let lost=false;
 const adapters={...journal,perform:async(s,stage)=>{calls.push('global:'+stage);let receipt;try{receipt=await journal.perform(s,stage);}catch(error){errors.push({stage,message:error.message,code:error.code});throw error;}if(!lost&&stage===lostStage){lost=true;throw Error('Global committed reply lost');}return receipt;}};
 return {db,scope,native,calls,errors,controller,journal,run:()=>runSharedDeletion(scope,adapters,controller.signal),allowPostAuth:()=>{postAuthFailure=false;},keptMetadata,keptDevices};
}
