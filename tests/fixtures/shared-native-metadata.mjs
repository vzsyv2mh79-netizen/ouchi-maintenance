import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Disposable operator fixtures only: real SQL/enrollment/challenge guards stay
// enabled. Auth/session rows and Apple material here are synthetic, not proof.
const loadChallenge=async name=>{
 const code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
};
const registration=await loadChallenge('billing-app-attest-registration-challenge');
const restoration=await loadChallenge('billing-restore-client-data');

export const metadataTables=['reconciliation_jobs','reminder_schedules','notification_channels','enrollment_consents',
 'attest_registration_challenges','restore_attested_keys','restore_challenges','restore_cancelled_requests',
 'restore_transfer_jobs','verified_notifications','verified_renewals','verified_transactions','transaction_ownership'];
export async function seedSharedNativeMetadata(db,actors){
 const originalEpochs=(await db.query('select user_id,epoch_id,enabled from maintenance_private.app_epochs where user_id=any($1::uuid[])',[actors.map(([user])=>user)])).rows;
 // Actual schema constraints, synthetic data only; never fabricated completion
 // or a post-freeze writer bypass. Include retained old epochs and a bystander.
 for(const [user,epoch] of actors){
  const original=String(BigInt('0x'+randomBytes(12).toString('hex'))+1n),session=randomUUID(),point=Buffer.concat([Buffer.from([4]),randomBytes(64)]);
  const key=createHash('sha256').update(point).digest('base64'),hash='a'.repeat(64),app='AAAAAAAAAA.dev.ouchi.synthetic';
  await db.query('update maintenance_private.app_epochs set epoch_id=$2,enabled=true where user_id=$1',[user,epoch]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);
  await db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[session,user,epoch]);
  assert.equal((await db.query('select public.read_maintenance_explicit_enrollment($1,$2) epoch',[user,session])).rows[0].epoch,epoch);
  await db.query("insert into maintenance_private.reconciliation_jobs(user_id,app_epoch_id,environment,transaction_id) values($1,$2,'Sandbox',$3)",[user,epoch,original]);
  await db.query("insert into maintenance_private.reminder_schedules values($1,$2,'Sandbox',540,array[1,2,3,4,5,6,7]::smallint[],0,true,1)",[user,epoch]);
  await db.query("insert into maintenance_private.notification_channels values($1,$2,'Sandbox','both',1)",[user,epoch]);
  await db.query("insert into maintenance_private.enrollment_consents values($1,$2,$3,$4,$5,clock_timestamp()+interval '5 minutes')",[randomUUID(),user,session,randomUUID(),epoch]);
  await db.query("insert into maintenance_private.transaction_ownership values('Sandbox',$1,$2,$3)",[original,user,epoch]);
  await db.query("insert into maintenance_private.verified_transactions(environment,transaction_id,original_transaction_id,user_id,app_epoch_id,product_id,signed_at,purchased_at,expires_at,proof_sha256) values('Sandbox',$1,$1,$2,$3,'ouchi.premium.monthly',1,1,100,$4)",[original,user,epoch,hash]);
  await db.query("insert into maintenance_private.verified_renewals(environment,original_transaction_id,user_id,app_epoch_id,product_id,signed_at,renewal_date,auto_renew_status,is_in_retry,proof_sha256) values('Sandbox',$1,$2,$3,'ouchi.premium.monthly',1,100,1,false,$4)",[original,user,epoch,hash]);
  await db.query("insert into maintenance_private.verified_notifications(environment,notification_id,notification_type,signed_at,proof_sha256,disposition,user_id,app_epoch_id,original_transaction_id) values('Sandbox',$1,'SUBSCRIBED',1,$2,'transaction_applied',$3,$4,$5)",[randomUUID(),hash,user,epoch,original]);
  await db.query("insert into maintenance_private.restore_transfer_jobs(id,user_id,session_id,app_epoch_id,environment,original_transaction_id,app_transaction_id,previous_account_token,bundle_id,lease_token,authorized_at,expected_counter,verified_counter,client_hash,assertion_hash,pair_hash) values($1,$2,$3,$4,'Sandbox',$5,$5,$6,'dev.ouchi.synthetic',$7,clock_timestamp(),0,1,$8,$8,$8)",[randomUUID(),user,session,epoch,original,randomUUID(),randomUUID(),hash]);
  await db.query("insert into maintenance_private.restore_attested_keys(key_id,user_id,app_epoch_id,registration_session,app_id,attest_environment,public_key_x962,attestation_sha256,verified_receipt) values($1,$2,$3,$4,$5,'development',$6,$7,$8)",[key,user,epoch,session,app,point,hash,Buffer.from([1])]);
  const scope={userID:user,sessionID:session,epochID:epoch,requestID:randomUUID(),keyID:key,appID:app,attestEnvironment:'development'};
  // Use the authoritative disposable database clock, rather than assuming the
  // Mac and Linux VM clocks are identical to the millisecond. SQL expiry and
  // future-issuance guards remain fully enabled.
  const issued=Number((await db.query('select floor(extract(epoch from clock_timestamp())*1000)::text issued')).rows[0].issued);
  assert.ok(Number.isSafeInteger(issued)&&issued>0);
  const restore=restoration.createRestoreChallenge({...scope,purchaseEnvironment:'Sandbox',proofSHA256:hash},issued);
  const restoreHash=createHash('sha256').update(restoration.restoreAssertionClientData(restore,issued)).digest('hex');
  await db.query("insert into maintenance_private.restore_challenges(request_id,user_id,session_id,app_epoch_id,key_id,challenge,nonce,client_data_sha256,issued_at,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9::numeric/1000),to_timestamp($10::numeric/1000))",[restore.requestID,user,session,epoch,key,restore,restore.nonce,restoreHash,restore.issuedAt,restore.expiresAt]);
  await db.query("insert into maintenance_private.restore_cancelled_requests(request_id,user_id,session_id,app_epoch_id,key_id,app_id,attest_environment,pair_hash,assertion_hash) values($1,$2,$3,$4,$5,$6,'development',$7,$7)",[randomUUID(),user,session,epoch,key,app,hash]);
  const register=registration.createRegistrationChallenge({...scope,requestID:randomUUID()},issued);
  await db.query("insert into maintenance_private.attest_registration_challenges(request_id,user_id,session_id,app_epoch_id,key_id,app_id,attest_environment,challenge,nonce,client_data_sha256,issued_at,expires_at) values($1,$2,$3,$4,$5,$6,'development',$7,$8,$9,to_timestamp($10::numeric/1000),to_timestamp($11::numeric/1000))",[register.requestID,user,session,epoch,key,app,register,register.nonce,registration.registrationClientDataHash(register,issued).toString('hex'),register.issuedAt,register.expiresAt]);
 }
 for(const row of originalEpochs)await db.query('update maintenance_private.app_epochs set epoch_id=$2,enabled=$3 where user_id=$1',[row.user_id,row.epoch_id,row.enabled]);
}
export async function metadataRows(db,user){
 const result={};for(const table of metadataTables)result[table]=(await db.query(`select to_jsonb(r) row from maintenance_private.${table} r where user_id=$1 order by to_jsonb(r)::text`,[user])).rows;
 return result;
}

