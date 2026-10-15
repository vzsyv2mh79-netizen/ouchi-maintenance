import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {withSharedMaintenanceClosureMetadata as boundary} from '../../lib/shared-maintenance-closure-metadata.mjs';
import {runWithTransactionCommitChecks} from '../../lib/transaction-commit-checks.mjs';
import {seedSharedNativeMetadata,metadataRows} from './shared-native-metadata.mjs';
/** Actual local GoTrue/PG/Storage; shared receipts/enrollment/retention are
 * privileged SYNTHETIC fixtures. Not live coverage, role, SLA or Auth-erasure proof.
 */
export async function verifyDisposableSharedClosureMetadata({db,account,admin,origin,options,createAttachmentFetch,bytes,retainedPath}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 const {Client}=await import('pg');
 await db.query(readFileSync('tests/fixtures/shared-maintenance-native-stage.sql','utf8'));
 for(const approved of [false,true]){
 const actor=await account(),marker=randomUUID(),agent='OuchiMaintenance/closure-reauth/v1/'+marker;
 const session=await actor.client.auth.getSession();assert.equal(session.error,null);assert.ok(session.data.session);
 const claims=JSON.parse(Buffer.from(session.data.session.access_token.split('.')[1],'base64url'));
 assert.equal(claims.sub,actor.user);assert.equal(claims.session_id,actor.session);
 const verified=await actor.client.auth.getUser(session.data.session.access_token);
 assert.equal(verified.error,null);assert.equal(verified.data.user.id,actor.user);
 const context=async()=>(await db.query("select nullif(current_setting('request.jwt.claims',true),'') as claims,nullif(current_setting('request.jwt.claim.sub',true),'') as subject")).rows[0];
 const originalContext=await context();
 // The preceding Kakei fixture installs auth.uid() backed by the legacy sub
 // GUC. Bind BOTH GUC formats to this actual getUser-verified actor, locally
 // on this connection; COMMIT/ROLLBACK restores the previous context.
 assert.match((await db.query("select pg_get_functiondef('auth.uid()'::regprocedure) definition")).rows[0].definition,/request\.jwt\.claim\.sub/);
 await db.query('begin');try{
  await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify(claims),actor.user]);
  assert.equal((await db.query('select auth.uid()::text as actor')).rows[0].actor,actor.user);
  assert.equal((await db.query('select maintenance_private.closure_reauth_register($1,$2,$3,$4) registered',[actor.user,actor.session,actor.epoch,marker])).rows[0].registered,true);
  await db.query('commit');
 }catch(error){await db.query('rollback');throw error;}
 assert.deepEqual(await context(),originalContext);
 const temporary=createClient(origin,'synthetic-public-key',{...options,global:{headers:{'User-Agent':agent},fetch:createAttachmentFetch(AbortSignal.timeout(10000),5000,65536)}});
 assert.equal((await temporary.auth.signInWithPassword({email:actor.email,password:actor.password})).error,null);
 const native=Object.freeze({requestID:randomUUID(),userID:actor.user,epochID:actor.epoch,leaseToken:randomUUID()});
 // Fresh actor has only the Ouchi enrollment. Existing two-app family fixtures
 // stay separate and are not relabelled as this actor's verified inventory.
 const shared={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:actor.user,leaseToken:randomUUID(),inventoryDigest:'c'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:native.requestID,scopeID:native.epochID}]};
 const fixed={...shared};delete fixed.leaseToken;
 const receipts=Object.fromEntries(['prepare','handoff-family','verify-family-before','verify-sessions-before'].map(stage=>[stage,{durable:true,stage,...fixed}]));
 await db.query("insert into private.kb_shared_deletion_journal(request_id,user_id,scope,status,lease_token,lease_until,receipts) values($1,$2,$3,'processing',$4,clock_timestamp()+interval '5 minutes',$5)",[shared.requestID,actor.user,fixed,shared.leaseToken,receipts]);
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,inventory_captured) values($1,$2,$3,'running',$4,clock_timestamp()+interval '5 minutes',true)",[native.requestID,actor.user,actor.epoch,native.leaseToken]);
 await db.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','requested')",[actor.user,shared,native.leaseToken]);
 for(const epoch of [actor.epoch,randomUUID()])await db.query('insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values($1,$2,$3)',[actor.user,epoch,randomUUID()]);
 const bystander=await account();
 await seedSharedNativeMetadata(db,[[actor.user,actor.epoch],[actor.user,randomUUID()],[bystander.user,bystander.epoch]]);
 const keptMetadata=await metadataRows(db,bystander.user);
 assert.ok(Object.values(await metadataRows(db,actor.user)).every(rows=>rows.length===2));
 assert.ok(Object.values(keptMetadata).every(rows=>rows.length===1));
 await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[actor.user]);
 await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[actor.user]);
 // Verify the canonical delivery-history correction before the household
 // freeze. This is NOT evidence of a shared frozen device-stage adapter.
 for(const [user,epoch] of [[actor.user,actor.epoch],[actor.user,randomUUID()],[bystander.user,bystander.epoch]])await db.query("insert into maintenance_private.native_delivery_identities values($1,current_date,$2,$3,$4,$5,clock_timestamp()+interval '1 day')",[randomBytes(32).toString('hex'),user,epoch,randomUUID(),randomUUID()]);
 const deliveryRows=user=>db.query('select to_jsonb(r) row from maintenance_private.native_delivery_identities r where user_id=$1 order by destination_hash',[user]).then(r=>r.rows);
 const keptDeliveries=await deliveryRows(bystander.user);assert.equal((await deliveryRows(actor.user)).length,2);
 assert.equal((await db.query('select public.erase_maintenance_deletion_native_delivery_identities($1,$2,$3,$4) erased',[native.requestID,actor.user,actor.epoch,native.leaseToken])).rows[0].erased,true);
 assert.deepEqual(await deliveryRows(actor.user),[]);assert.deepEqual(await deliveryRows(bystander.user),keptDeliveries);
 if(approved)await db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-shared-boundary-test',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[native.requestID]);
 await db.query('select maintenance_private.freeze_household_scope($1,$2)',[shared,native.leaseToken]);
 const args=[native.requestID,actor.user,actor.epoch,native.leaseToken];
 const stage=async(tx,phase)=>(await tx.query('select maintenance_private.run_shared_native_stage($1,$2,$3) value',[shared,native.leaseToken,phase])).rows[0].value;
 const count=async()=>Number((await db.query('select count(*) n from maintenance_private.account_closure_reviews where user_id=$1',[actor.user])).rows[0].n);
 const foreign=async()=>(await db.query('select to_jsonb(r) row from maintenance_private.account_closure_reviews r where user_id<>$1 order by submission_id',[actor.user])).rows;
 const savedForeign=await foreign();
 const transaction=async callback=>{
  await db.query('begin');try{
   await db.query("set local statement_timeout='4500ms';set local lock_timeout='1000ms'");
   const result=await runWithTransactionCommitChecks(db,AbortSignal.timeout(10000),callback);await db.query('commit');return result;
  }catch(error){await db.query('rollback');throw error;}
 };
 // Current read-only provider for this fresh, empty Ouchi actor only. It is NOT
 // the production complete writer registry or a Kakei family/session verifier.
 const gates=async(tx,s,n)=>{
  assert.equal(s.apps.length,1);assert.equal(n.userID,actor.user);
  return (await tx.query(`select not exists(select 1 from public.homes where owner_id=$1)
   and not exists(select 1 from public.home_members where user_id=$1)
   and not exists(select 1 from maintenance_private.account_access where user_id=$1 and enabled)
   and exists(select 1 from auth.sessions where user_id=$1 and id=$2 and (not_after is null or not_after>clock_timestamp())) as allowed`,[actor.user,actor.session])).rows[0].allowed===true;
 };
 const records=tx=>stage(tx,'eraseRecords');
 for(const table of ['private.kb_shared_deletion_journal','maintenance_private.household_stop_bindings']){
  await assert.rejects(transaction(async tx=>{
   assert.equal(await boundary(tx,shared,native,'eraseRecords',records,gates),true);assert.equal(await count(),0);
   await tx.query(`update ${table} set lease_until=clock_timestamp()-interval '1 second' where ${table.startsWith('private.')?'request_id':'user_id'}=$1`,[table.startsWith('private.')?shared.requestID:actor.user]);
  }),/Current/);
  assert.equal(await count(),2);assert.equal(Number((await db.query('select count(*) n from auth.sessions where user_id=$1 and user_agent=$2',[actor.user,agent])).rows[0].n),1);
 }
 // A network/RPC-style second connection cannot be substituted for the stage's
 // pinned native SQL connection: its scope locks wait and time out.
 await assert.rejects(transaction(tx=>boundary(tx,shared,native,'eraseRecords',async()=>{
  const outside=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:1000,query_timeout:2000});
  await outside.connect();try{
   await outside.query("set lock_timeout='150ms'");
   await outside.query('select public.erase_maintenance_deletion_closure_metadata($1,$2,$3,$4)',args);
  }finally{await outside.end();}
 },gates)),error=>error.code==='55P03');
 assert.equal(await count(),2);
 assert.equal(Number((await db.query('select count(*) n from auth.sessions where user_id=$1 and user_agent=$2',[actor.user,agent])).rows[0].n),1);
 assert.equal(await transaction(tx=>boundary(tx,shared,native,'eraseRecords',records,gates)),true);
 assert.equal(await count(),0);assert.deepEqual(await foreign(),savedForeign);
 assert.equal(Number((await db.query('select count(*) n from auth.sessions where user_id=$1 and user_agent=$2',[actor.user,agent])).rows[0].n),0);
 assert.equal((await actor.client.auth.getUser()).error,null,'original real Auth remains current');
 for(const phase of ['captureReceiptSessions','eraseIdentity'])assert.equal(await transaction(tx=>boundary(tx,shared,native,phase,tx=>stage(tx,phase),gates)),true);
 assert.ok(Object.values(await metadataRows(db,actor.user)).every(rows=>rows.length===0));
 assert.deepEqual(await metadataRows(db,bystander.user),keptMetadata);
 assert.equal((await bystander.client.auth.getUser()).error,null);
 await db.query('insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values($1,$2,$3)',[actor.user,randomUUID(),randomUUID()]);
 const complete=tx=>stage(tx,'markComplete');
 if(!approved){
  await assert.rejects(transaction(tx=>boundary(tx,shared,native,'markComplete',complete,gates)),/stage unconfirmed/);assert.equal(await count(),1);
  assert.equal((await actor.client.auth.getUser()).error,null);assert.deepEqual(await foreign(),savedForeign);continue;
 }
 assert.equal(await transaction(tx=>boundary(tx,shared,native,'markComplete',complete,gates)),true);
 const sealed=(await db.query('select completion_lease,receipt_expires_at from maintenance_private.account_deletion_requests where id=$1',[native.requestID])).rows;
 assert.equal(await transaction(tx=>boundary(tx,shared,native,'markComplete',async()=>{throw Error('must only read exact completion');},gates)),true);
 assert.deepEqual((await db.query('select completion_lease,receipt_expires_at from maintenance_private.account_deletion_requests where id=$1',[native.requestID])).rows,sealed);
 assert.equal(await count(),0);assert.deepEqual(await foreign(),savedForeign);
 const kept=await admin.storage.from('ouchi-product-attachments').download(retainedPath);assert.equal(kept.error,null);assert.deepEqual(Buffer.from(await kept.data.arrayBuffer()),bytes);
 assert.equal((await actor.client.auth.getUser()).error,null);
 }
 console.log('shared/native closure metadata actual PostgreSQL/Auth/Storage: prior-epoch native delivery identities purged before freeze with bystander rows retained, not a frozen device-stage adapter; shared/binding expiry faults roll back, second-connection RPC refuses pinned boundary, scoped metadata/core SQL and resumed sealed native completion share one connection through final checks; thirteen Ouchi metadata categories across current/prior epochs erased, bystander metadata and real Auth retained; exact lost-ack receipt unchanged, foreign reviews/private bytes/original Auth retained; synthetic enrollment/Apple material/shared receipts/coverage/retention, no shared Auth erasure or live role/SLA proof');
}
