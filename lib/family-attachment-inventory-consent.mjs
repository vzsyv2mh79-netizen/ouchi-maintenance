import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {normalizeFamilyAttachmentPlan} from './family-attachment-handoff.mjs';
import {familyAttachmentInventoryDigest as digest} from './family-attachment-journal.mjs';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';

const domain='OuchiMaintenance/family-attachment-inventory/v1';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const clone=v=>JSON.parse(JSON.stringify(v));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const same=(a,b)=>digest(a)===digest(b);
const stable=s=>{const v={...s};delete v.nativeLease;return v;};
const requireTrue=value=>{if(value!==true)throw Error('Current inventory consent authority required');};
function binding(scope,raw,inventory){
 const controller=normalizeSharedDeletionScope(scope?.controllerScope);
 if(![scope.requestID,scope.homeID,scope.userID,scope.ownerEpoch,scope.nativeRequestID,scope.nativeLease].every(uuid)
  ||!same(controller,scope.controllerScope)||controller.requestID!==scope.requestID||controller.userID!==scope.userID
  ||!controller.apps.some(a=>a.app==='ouchi-maintenance'&&a.requestID===scope.nativeRequestID&&a.scopeID===scope.ownerEpoch))throw Error('Bound consent scope required');
 const normalized=raw?.files?.some(f=>Object.hasOwn(f,'destination'));
 const plan=normalizeFamilyAttachmentPlan(normalized?{...raw,files:raw.files.map(f=>{const v={...f};delete v.destination;return v;})}:raw);
 if(normalized&&!same(raw,plan))throw Error('Foreign consent destination');
 if(scope.requestID!==plan.requestID||scope.homeID!==plan.homeID||scope.userID!==plan.ownerID||scope.ownerEpoch!==plan.ownerEpoch)throw Error('Foreign inventory consent');
 const original=clone(inventory);
 if(!original||Object.keys(original).sort().join(',')!=='files,members,products,writes'
  ||!['files','members','products','writes'].every(k=>Array.isArray(original[k]))
  ||original.files.length!==plan.files.length||original.writes.length!==plan.files.length
  ||original.members.some(m=>!uuid(m.user_id))||original.products.some(p=>!uuid(p.id))
  ||new Set(original.members.map(m=>m.user_id)).size!==original.members.length
  ||new Set(original.products.map(p=>p.id)).size!==original.products.length
  ||!original.members.some(m=>m.user_id===plan.recipientID))throw Error('Complete original consent inventory required');
 for(const file of plan.files){
  const rows=original.files.filter(f=>f.id===file.id),writes=original.writes.filter(w=>w.attachment_id===file.id);
  const row=rows[0],write=writes[0];
  if(rows.length!==1||writes.length!==1||!original.products.some(p=>p.id===row.product_id)
   ||row.user_id!==file.source.userID||row.app_epoch_id!==file.source.epoch||row.object_path!==file.source.path
   ||Number(row.size_bytes)!==file.size||row.mime!==file.mime||row.sha256!==file.sha256||row.state!=='stored'||row.write_tracking!==true
   ||row.captured_owner_id!==plan.ownerID||write.state!=='settled'||!write.settled_at
   ||write.uploader_id!==row.user_id||write.app_epoch_id!==row.app_epoch_id||write.owner_id!==plan.ownerID)throw Error('Original signed file inventory required');
 }
 const inventoryDigest=digest(original);
 const bindingDigest=createHash('sha256').update(domain+'\n'+JSON.stringify({scopeDigest:digest(scope),planDigest:digest(plan),inventoryDigest})).digest('hex');
 return {scope:freeze(clone(scope)),plan,inventory:freeze(original),inventoryDigest,bindingDigest};
}
async function now(tx,signal){
 signal.throwIfAborted();
 const row=(await tx.query('select floor(extract(epoch from clock_timestamp())*1000)::bigint as consent_now')).rows[0];
 signal.throwIfAborted();const value=Number(row?.consent_now);
 if(!Number.isSafeInteger(value)||value<=0)throw Error('Database consent clock required');return value;
}
function decode(token,key){
 if(typeof token!=='string'||token.length>8192)throw Error('Bound consent proof required');
 const parts=token.split('.');if(parts.length!==2||parts.some(p=>!/^[A-Za-z0-9_-]+$/.test(p)))throw Error('Invalid consent encoding');
 const bytes=parts.map(p=>Buffer.from(p,'base64url'));if(bytes.some((b,i)=>b.toString('base64url')!==parts[i]))throw Error('Noncanonical consent encoding');
 const expected=createHmac('sha256',key).update(domain+'\n'+parts[0]).digest();
 if(bytes[1].length!==expected.length||!timingSafeEqual(bytes[1],expected))throw Error('Invalid inventory consent signature');
 const c=JSON.parse(bytes[0].toString('utf8'));
 if(!c||Object.keys(c).sort().join(',')!=='aal,acceptedAt,actorID,authenticatedAt,bindingDigest,checkedAt,epochID,expiresAt,purpose,role,sessionID')throw Error('Invalid inventory consent claims');return c;
}
function valid(c,record,b,time,allowExpired=false){
 return record?.actorID===c.actorID&&c.purpose===domain&&c.bindingDigest===b.bindingDigest
  &&['owner','recipient'].includes(c.role)&&c.actorID===(c.role==='owner'?b.plan.ownerID:b.plan.recipientID)
  &&c.epochID===(c.role==='owner'?b.plan.ownerEpoch:b.plan.recipientEpoch)&&uuid(c.sessionID)&&['aal1','aal2'].includes(c.aal)
  &&[c.acceptedAt,c.authenticatedAt,c.checkedAt,c.expiresAt].every(v=>Number.isSafeInteger(v)&&v>0)
  &&c.acceptedAt<=time&&c.authenticatedAt<=c.acceptedAt&&c.checkedAt<=c.acceptedAt
  &&c.authenticatedAt>=c.acceptedAt-600000&&c.checkedAt>=c.acceptedAt-60000
  &&c.expiresAt===c.acceptedAt+900000&&(allowExpired||c.expiresAt>time);
}

/** Disabled backend provider, no endpoint/key/table/credential provisioning.
 * store.target must lock/read the COMPLETE frozen initial inventory on tx;
 * records/record must use a private immutable scope-bound store on that SAME tx.
 * verifyIdentity must supply real current session/MFA, authenticatedAt (recent
 * authentication, not getUser time), checkedAt, exact epoch/session/AAL.
 * verifyActor must pin/check each signed session/factor/current policy at worker
 * time. currentAuthority binds current and original controller/native leases,
 * exact inventory, receiver enrollment and retained freeze. No default verifier
 * or client-provided consent arrays can authorize a transfer.
 */
export function createFamilyAttachmentInventoryConsent({key,store,verifyIdentity,verifyActor,currentAuthority}){
 if(!(key instanceof Uint8Array)||key.length<32||key.length>64||!store
  ||['transaction','target','records','record'].some(k=>typeof store[k]!=='function')
  ||[verifyIdentity,verifyActor,currentAuthority].some(f=>typeof f!=='function'))throw Error('Trusted signed inventory provider required');
 const secret=Buffer.from(key);
 const authority=async(tx,scope,b,signal)=>{signal.throwIfAborted();requireTrue(await currentAuthority(tx,scope,b.plan,b.inventory,b.inventoryDigest,signal,b.scope));signal.throwIfAborted();};
 const issue=async({requestID,homeID,accessToken,confirmation,signal})=>{
  if(!(signal instanceof AbortSignal)||confirmation!=='写真・保証書の一覧と受取先を確認して引き継ぎに同意する')return {status:'unconfirmed'};
  try{return await store.transaction(async tx=>{
   signal.throwIfAborted();const identity=await verifyIdentity(accessToken,tx,signal);signal.throwIfAborted();
   if(!identity||![identity.userID,identity.epochID,identity.sessionID].every(uuid)||!['aal1','aal2'].includes(identity.aal))throw Error('Verified actor required');
   const target=await store.target(tx,requestID,homeID,identity.userID,signal);signal.throwIfAborted();
   const b=binding(target.scope,target.plan,target.inventory);if(requestID!==b.scope.requestID||homeID!==b.scope.homeID)throw Error('Foreign consent request');
   const role=identity.userID===b.plan.ownerID?'owner':identity.userID===b.plan.recipientID?'recipient':null;
   if(!role||identity.epochID!==(role==='owner'?b.plan.ownerEpoch:b.plan.recipientEpoch))throw Error('Foreign consent actor');
   await authority(tx,b.scope,b,signal);const time=await now(tx,signal);
   const c={purpose:domain,bindingDigest:b.bindingDigest,actorID:identity.userID,role,epochID:identity.epochID,sessionID:identity.sessionID,aal:identity.aal,
    authenticatedAt:identity.authenticatedAt,checkedAt:identity.checkedAt,acceptedAt:time,expiresAt:time+900000};
   if(!valid(c,{actorID:identity.userID},b,time))throw Error('Recent authentication required');
   const records=freeze(clone(await store.records(tx,b.scope,b.plan,signal)));signal.throwIfAborted();
   if(!Array.isArray(records)||records.length>2||new Set(records.map(r=>r.actorID)).size!==records.length)throw Error('Private consent records required');
   const old=records.find(r=>r.actorID===identity.userID);
   if(old){
    const saved=decode(old.token,secret);if(!valid(saved,old,b,await now(tx,signal),true))throw Error('Stored consent mismatch');
    await authority(tx,b.scope,b,signal);
    if(old.revokedAt!==null)return {status:'revoked'};
    if(saved.expiresAt<=await now(tx,signal))return {status:'expired',expiresAt:saved.expiresAt};
    requireTrue(await verifyActor(tx,freeze(saved),signal));await authority(tx,b.scope,b,signal);
    const final=await store.records(tx,b.scope,b.plan,signal);signal.throwIfAborted();
    if(!Array.isArray(final)||!final.some(r=>r.actorID===old.actorID&&r.token===old.token&&r.revokedAt===null))throw Error('Stored consent changed');
    if(!valid(saved,old,b,await now(tx,signal)))throw Error('Stored consent expired');
    return {status:'accepted',expiresAt:saved.expiresAt};
   }
   const body=Buffer.from(JSON.stringify(c)).toString('base64url');const token=body+'.'+createHmac('sha256',secret).update(domain+'\n'+body).digest('base64url');
   await store.record(tx,b.scope,b.plan,freeze({actorID:c.actorID,token,revokedAt:null}),signal);
   await authority(tx,b.scope,b,signal);requireTrue(await verifyActor(tx,freeze(c),signal));
   const saved=await store.records(tx,b.scope,b.plan,signal);signal.throwIfAborted();
   if(!Array.isArray(saved)||saved.filter(r=>r.actorID===c.actorID&&r.token===token&&r.revokedAt===null).length!==1
    ||!valid(c,{actorID:c.actorID},b,await now(tx,signal)))throw Error('Durable signed consent unconfirmed');
   return {status:'accepted',expiresAt:c.expiresAt};
  },signal);}catch{return {status:'unconfirmed'};}
 };
 const authorize=async(tx,scope,raw,inventory,inventoryDigest,signal,originalScope=scope)=>{
  try{
   if(!(signal instanceof AbortSignal)||!same(stable(scope),stable(originalScope)))return false;
   const b=binding(originalScope,raw,inventory);if(b.inventoryDigest!==inventoryDigest)return false;
   await authority(tx,scope,b,signal);
   const records=freeze(clone(await store.records(tx,b.scope,b.plan,signal)));signal.throwIfAborted();
   if(!Array.isArray(records)||records.length!==2)return false;
   const roles=new Set(),claims=[];
   for(const record of records){
    const c=decode(record.token,secret);
    if(record.revokedAt!==null||!valid(c,record,b,await now(tx,signal))||roles.has(c.role))return false;
    roles.add(c.role);claims.push(c);requireTrue(await verifyActor(tx,freeze(c),signal));await authority(tx,scope,b,signal);
   }
   await authority(tx,scope,b,signal);
   const saved=await store.records(tx,b.scope,b.plan,signal);signal.throwIfAborted();
   if(!same(saved,records))return false;
   const time=await now(tx,signal);if(claims.some((c,i)=>!valid(c,records[i],b,time)))return false;
   signal.throwIfAborted();return roles.size===2;
  }catch{return false;}
 };
 return Object.freeze({issue,authorize});
}
