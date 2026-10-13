import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {createHandoffConsentStore} from './lib/handoff-consent-store.mjs';
import {createHandoffConsentIssuer,createSignedHandoffConsentVerifier} from './lib/handoff-consent.mjs';
import {createKakeiFamilyTransfer} from './lib/kakei-family-transfer.mjs';
import {createKakeiFamilyCompletion} from './lib/kakei-family-completion.mjs';
import {createKakeiWriteFence} from './lib/kakei-write-fence.mjs';
import {captureKakeiFamilySnapshot,kakeiFamilyPlanDigests} from './lib/kakei-family-snapshot.mjs';
import {bindKakeiCommittedFamilyVerifier} from '../../../lib/kakei-retained-family-verifier.mjs';
import {familyAttachmentInventoryDigest as digest} from '../../../lib/family-attachment-journal.mjs';
const sql=path=>readFileSync('tests/fixtures/kakei-completion/'+path,'utf8');
/** Actual disposable DB/common GoTrue identities. Dedicated transactions only;
 * six reviewed Kakei table fences do NOT imply full shipping writer coverage.
 */
export async function prepareActualKakeiFamily({db,transaction,root,owner,receiver,identity,totpTimes}){
 const app=root.apps.find(a=>a.app==='kakei');assert.ok(app);
 await db.query(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
 const fixed={...root};delete fixed.leaseToken;
 await db.query("insert into private.kb_shared_deletion_journal(request_id,user_id,scope,status,lease_token,lease_until) values($1,$2,$3,'requested',null,null)",[root.requestID,root.userID,fixed]);
 await db.query(sql('tests/fixtures/handoff-consent-store.sql'));
 await db.query(`create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table private.kb_deletion_context(user_id uuid,transaction_id bigint);
 create table public.kb_households(id uuid primary key,owner_id uuid,name text,invite_token uuid,created_at timestamptz default now(),updated_at timestamptz);
 create table public.kb_household_members(household_id uuid,user_id uuid,role text,display_name text,joined_at timestamptz default now(),primary key(household_id,user_id));
 create table public.kb_transactions(id uuid primary key,household_id uuid,created_by uuid,amount int);
 create table public.kb_join_requests(id uuid,user_id uuid,invite_token uuid);
 create table public.kb_premium_preferences(user_id uuid);create table public.kb_store_transactions(user_id uuid);
 alter table public.kb_households enable row level security;alter table public.kb_household_members enable row level security;alter table public.kb_transactions enable row level security;
 alter table public.kb_join_requests enable row level security;alter table public.kb_premium_preferences enable row level security;alter table public.kb_store_transactions enable row level security;
 revoke all on public.kb_households,public.kb_household_members,public.kb_transactions,public.kb_join_requests,public.kb_premium_preferences,public.kb_store_transactions from public,anon,authenticated,service_role;
 `);
 await db.query(sql('tests/fixtures/kakei-family-transfer.sql'));
 await db.query('create trigger kb_touch_household before update on public.kb_households for each row execute function private.kb_touch_household();create trigger kb_touch_member before update on public.kb_household_members for each row execute function private.kb_touch_member();');
 await db.query(sql('review/kakei-family-completion.sql'));
 const household=randomUUID(),record=randomUUID();
 await db.query('insert into public.kb_households(id,owner_id,name,invite_token) values($1,$2,$3,$4)',[household,owner.user,'Synthetic joint family',randomUUID()]);
 for(const [user,role] of [[owner.user,'owner'],[receiver.user,'member']])await db.query('insert into public.kb_household_members(household_id,user_id,role,display_name) values($1,$2,$3,$4)',[household,user,role,'Synthetic '+role]);
 await db.query('insert into public.kb_transactions values($1,$2,$3,200)',[record,household,receiver.user]);
 const plan={protocolVersion:2,requestID:root.requestID,userID:root.userID,inventoryDigest:root.inventoryDigest,appRequestID:app.requestID,appScopeID:app.scopeID,householdID:household,successorID:receiver.user,memberIDs:[owner.user,receiver.user],familyRecordIDs:[record]};
 Object.assign(plan,kakeiFamilyPlanDigests(await captureKakeiFamilySnapshot(root,household,db),root,plan));
 await db.query('insert into private.kb_shared_handoff_plans values($1,$2,$3)',[root.requestID,household,plan]);
 const key=randomBytes(32),store=createHandoffConsentStore({transaction});
 const issuer=createHandoffConsentIssuer({key,store,verifyIdentity:async(token,tx)=>{
  for(const id of [owner.user,receiver.user].sort())await tx.query('select pg_advisory_xact_lock(hashtext($1))',[id]);
  await tx.query('select request_id from private.kb_shared_deletion_journal where request_id=$1 for update',[root.requestID]);
  await tx.query('select household_id from private.kb_shared_handoff_plans where request_id=$1 order by household_id for update',[root.requestID]);
  await captureKakeiFamilySnapshot(root,household,tx);
  const verified=await identity(token,{signal:AbortSignal.timeout(10000),query:(sql,args)=>tx.query(sql,args)});
  assert.equal(verified.aal,'aal2');assert.equal(verified.authenticatedAt,totpTimes.get(verified.userID));
  return {userID:verified.userID,authVerifiedAt:verified.authenticatedAt};
 }});
 for(const actor of [owner,receiver]){const s=await actor.client.auth.getSession();assert.equal(s.error,null);assert.equal((await issuer({requestID:root.requestID,householdID:household,accessToken:s.data.session.access_token,confirmation:'家族データの引き継ぎに同意する'})).status,'accepted');}
 for(const r of (await db.query('select actor_id,token from private.kb_shared_handoff_proofs')).rows){const c=JSON.parse(Buffer.from(r.token.split('.')[0],'base64url'));assert.equal(c.authVerifiedAt,totpTimes.get(r.actor_id));}
 for(const file of ['kakei-write-fence.sql','kakei-write-table-guards.sql','kakei-fenced-handoff.sql'])await db.query(sql('tests/fixtures/'+file));
 await db.query("update private.kb_shared_deletion_journal set status='processing',lease_token=$2,lease_until=clock_timestamp()+interval '2 minutes' where request_id=$1",[root.requestID,root.leaseToken]);
 const fence=createKakeiWriteFence({loadHouseholds:async(s,tx)=>(await tx.query('select distinct household_id from public.kb_household_members where user_id=$1',[s.userID])).rows.map(r=>r.household_id)});
 await transaction(async tx=>{assert.equal(await fence.prepare(root,tx),true);await tx.query('update private.kb_shared_deletion_journal set receipts=$2 where request_id=$1',[root.requestID,{prepare:{durable:true,stage:'prepare',...fixed}}]);});
 const signed=createSignedHandoffConsentVerifier({key,loadRecords:store.loadRecords}),transfer=createKakeiFamilyTransfer({verifyConsents:signed,writeFences:fence.current});
 const completed=createKakeiFamilyCompletion({key,transfer,loadRecords:store.loadRecords,verifyReadAuthority:(s,tx)=>fence.current(s,tx),writeFences:fence.current});
 const verify=bindKakeiCommittedFamilyVerifier({completion:completed,verifyWriteFences:(tx,s)=>fence.current(s,tx),verifyFrozenCoverage:async(tx,s,plans)=>{
  const rows=(await tx.query('select plan from private.kb_shared_handoff_plans where request_id=$1 order by household_id for update',[s.requestID])).rows;
  return plans.length===1&&rows.length===1&&digest(plans[0])===digest(plan)&&digest(rows[0].plan)===digest(plan);
 }});
 return {plan,verify,completed,async finish(){const signal=AbortSignal.timeout(15000);return transaction(tx=>completed.complete(root,plan,tx),signal);},async read(){const signal=AbortSignal.timeout(10000);return transaction(tx=>completed.read(root,plan,tx),signal);}};
}
