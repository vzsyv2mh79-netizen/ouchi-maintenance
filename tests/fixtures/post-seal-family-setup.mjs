// Isolated SQL/Storage-in-memory fixture. Auth identity and management policy are synthetic.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {createFamilyAttachmentInventoryConsent} from '../../lib/family-attachment-inventory-consent.mjs';
import {familyAttachmentInventoryDigest as digest} from '../../lib/family-attachment-journal.mjs';
import {familyAttachmentActivationFixture as fixture} from './family-attachment-activation.mjs';
import {owner,recipient,oe,re,os,rs} from './home-handoff-identifiers.mjs';
import {StorageApiError} from '@supabase/supabase-js';
import {createFamilyAttachmentCompletion} from '../../lib/family-attachment-completion.mjs';
import {createFamilyAttachmentStoragePorts} from '../../lib/family-attachment-storage.mjs';
import {normalizeFamilyAttachmentPlan} from '../../lib/family-attachment-handoff.mjs';
import {createCommittedHouseholdConsentVerifier} from '../../lib/home-handoff-consent.mjs';
import {runWithTransactionCommitChecks} from '../../lib/transaction-commit-checks.mjs';

const confirmation='写真・保証書の一覧と受取先を確認して引き継ぎに同意する';
async function setup({activation=false,commitFault=null,memberOnly=false,alignFamilyAuth=false,includeKakei=false,schemaOptions,beforeFreeze}={}){
 let provider;const f=await fixture({prepared:false,commitFault,memberOnly,schemaOptions,beforeFreeze,extraControllerApps:includeKakei?[{app:'kakei',requestID:randomUUID(),scopeID:randomUUID()}]:[],inventoryAuthorize:(...args)=>provider.authorize(...args),activationAuthorize:activation?(...args)=>provider.authorizeActivation(...args):null});
 await f.db.exec(readFileSync('tests/fixtures/family-attachment-inventory-consent.sql','utf8'));
 let offset=0,live=true,onAuthority=async()=>true,transform=rows=>rows,identityTransform=x=>x;
 const key=randomBytes(32);
 const adapt=tx=>({query:async(sql,args)=>{
  const result=await tx.query(sql,args);
  if(sql.includes('as consent_now'))return {rows:[{consent_now:Number(result.rows[0].consent_now)+offset}]};
  return result;
 }});
 const transaction=(cb,signal=AbortSignal.timeout(10000))=>f.db.transaction(tx=>runWithTransactionCommitChecks(adapt(tx),signal,cb));
 async function inventory(tx){
  const members=(await tx.query('select user_id from public.home_members where "homeId"=$1 order by user_id for update',[f.scope.homeID])).rows;
  const products=(await tx.query('select id from public.products where "homeId"=$1 order by id for update',[f.scope.homeID])).rows;
  const files=(await tx.query('select f.* from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p."homeId"=$1 order by f.id for update of f',[f.scope.homeID])).rows;
  const writes=(await tx.query('select a.* from maintenance_private.attachment_write_attempts a join maintenance_private.product_attachments f on f.id=a.attachment_id join public.products p on p.id=f.product_id where p."homeId"=$1 order by a.attachment_id for update of a',[f.scope.homeID])).rows;
  return JSON.parse(JSON.stringify({members,products,files,writes}));
 }
 const store={transaction,target:async tx=>{
  for(const id of [...new Set([owner,recipient,...f.plan.files.map(file=>file.source.userID)])].sort())await tx.query('select pg_advisory_xact_lock(hashtext($1))',[id]);
  return {scope:f.scope,plan:f.plan,inventory:await inventory(tx)};
 },
  records:async(tx,s)=>transform((await tx.query('select actor_id as "actorID",token,revoked_at as "revokedAt" from maintenance_private.family_attachment_inventory_consents where request_id=$1 and home_id=$2 order by actor_id for update',[s.requestID,s.homeID])).rows),
  record:(tx,s,p,r)=>tx.query('insert into maintenance_private.family_attachment_inventory_consents values($1,$2,$3,$4,null)',[s.requestID,s.homeID,r.actorID,r.token])
 };
 const options={key,store,identifyActor:async actor=>[owner,recipient].includes(actor)?actor:null,verifyIdentity:async(actor,tx)=>{
  if(![owner,recipient].includes(actor))return null;
  const clock=Number((await tx.query('select floor(extract(epoch from clock_timestamp())*1000)::bigint as consent_now')).rows[0].consent_now);
  // New household-composition cases share one synthetic verified auth time;
  // actual GoTrue fixture separately verifies and pins signed TOTP AMR.
  const family=alignFamilyAuth?(await tx.query('select token from maintenance_private.household_handoff_consents where actor_id=$1',[actor])).rows[0]:null;
  const authenticatedAt=family?JSON.parse(Buffer.from(family.token.split('.')[0],'base64url').toString('utf8')).authVerifiedAt:clock-10000;
  return identityTransform({userID:actor,epochID:actor===owner?oe:re,sessionID:actor===owner?os:rs,aal:'aal1',authStateDigest:'a'.repeat(64),authenticatedAt,checkedAt:clock});
 },verifyActor:async(tx,c)=>{
  // Synthetic Auth table/session fixture; current MFA policy remains injected.
  const row=(await tx.query('select user_id from auth.sessions where id=$1 for update',[c.sessionID])).rows[0];
  return live&&row?.user_id===c.actorID;
 },currentAuthority:async(tx,s,p,i,d,signal,original)=>{
  signal.throwIfAborted();assert.equal(d,digest(i));assert.equal(original.requestID,f.scope.requestID);
  const row=(await tx.query("select exists(select 1 from maintenance_private.account_deletion_requests where id=$1 and user_id=$2 and app_epoch_id=$3 and lease_token=$4 and state='running' and lease_until>clock_timestamp()) as current",[s.nativeRequestID,s.userID,s.ownerEpoch,s.nativeLease])).rows[0];
  return row.current===true&&await onAuthority(tx);
 }};
 provider=createFamilyAttachmentInventoryConsent(options);
 const issue=actor=>provider.issue({requestID:f.scope.requestID,homeID:f.scope.homeID,accessToken:actor,confirmation,signal:new AbortController().signal});
 const original=await transaction(inventory);
 const authorize=(p=f.plan,i=original,s=f.scope,which=provider)=>transaction(tx=>which.authorize(tx,s,p,i,digest(i),new AbortController().signal,f.scope));
 return {f,options,provider,transaction,original,issue,authorize,
  set offset(v){offset=v;},set live(v){live=v;},set authority(v){onAuthority=v;},set transform(v){transform=v;},set identityTransform(v){identityTransform=v;}};
}

export async function completionSetup({includeKakei=false,schemaOptions,beforeFreeze,beforeFamilyActivation}={}){
 const s=await setup({activation:true,alignFamilyAuth:true,includeKakei,schemaOptions,beforeFreeze});
 await s.f.db.exec(readFileSync('tests/fixtures/family-attachment-completion.sql','utf8'));
 for(const actor of [owner,recipient])await s.issue(actor);
 if(beforeFamilyActivation!==undefined){
  if(typeof beforeFamilyActivation!=='function')throw Error('Explicit fixture intake hook required');
  // Integration fixture only: root preparation/original issuance/formal claim
  // happen BEFORE reserve/ownership/file activation. A callback boolean never
  // authorizes transfer: reread the actual committed root scope/lease instead.
  await beforeFamilyActivation({s});
  const scope=s.f.scope.controllerScope,{leaseToken,...fixed}=scope;
  const root=(await s.f.db.query('select scope,status,lease_token,lease_until>clock_timestamp() live from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0];
  if(!root||root.status!=='processing'||root.lease_token!==leaseToken||root.live!==true||digest(root.scope)!==digest(fixed))throw Error('Committed exact claim required before fixture family activation');
 }
 await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal);await s.f.run();
 const plan=normalizeFamilyAttachmentPlan(s.f.plan),signal=()=>new AbortController().signal;
 let absenceError=new StorageApiError('missing',404,'404','storage','NoSuchKey'),storageAllowed=true,inspections=0;
 const storage=createFamilyAttachmentStoragePorts({guard:async()=>storageAllowed,clientForSignal:()=>({storage:{from:()=>({download:async path=>{inspections++;return s.f.objects.has(path)?{data:s.f.objects.get(path),error:null}:{data:null,error:absenceError};}})}})});
 const consent=createCommittedHouseholdConsentVerifier({key:s.f.key,verifyCommittedInventory:s.provider.authorizeCommittedActivation});
 const options={transaction:s.transaction,verifyCommittedConsent:consent,verifyReadAuthority:async()=>true,
  verifyWriteAuthority:(tx,scope,p,sig)=>s.options.currentAuthority(tx,scope,p,s.original,digest(s.original),sig,s.f.scope),storage};
 const fresh=extra=>createFamilyAttachmentCompletion({...options,...extra});
 const finish=port=>{const c=port??fresh();return c.finish(s.f.scope,plan,createHashDigest(plan),signal());};
 const status=port=>(port??fresh()).status(s.f.scope,plan,signal());
 const clean=()=>{for(const file of plan.files.filter(f=>f.source.path!==f.destination.path))s.f.objects.delete(file.source.path);};
 return {s,plan,options,fresh,finish,status,clean,signal,get inspections(){return inspections;},set absenceError(v){absenceError=v;},set storageAllowed(v){storageAllowed=v;}};
}
const createHashDigest=plan=>createHash('sha256').update(JSON.stringify(plan)).digest('hex');

