import {createHash} from 'node:crypto';

const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const hash=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const proofs=new WeakMap();
async function bounded(promise,signal){
 signal.throwIfAborted();let stop;
 const interrupted=new Promise((resolve,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
 try{return await Promise.race([promise,interrupted]);}finally{signal.removeEventListener('abort',stop);}
}

export function normalizeFamilyAttachmentPlan(input) {
 if(!exact(input,'files,homeID,ownerEpoch,ownerID,recipientEpoch,recipientID,requestID,snapshotDigest')||![input.requestID,input.homeID,input.ownerID,input.ownerEpoch,input.recipientID,input.recipientEpoch].every(uuid)||input.ownerID===input.recipientID||!hash(input.snapshotDigest)||!Array.isArray(input.files))throw Error('Invalid family attachment plan');
 const files=input.files.map(file=>{
  if(!exact(file,'id,mime,sha256,size,source')||!uuid(file.id)||!hash(file.sha256)||!Number.isSafeInteger(file.size)||file.size<1||file.size>5242880||!['image/jpeg','image/png','application/pdf'].includes(file.mime)||!exact(file.source,'epoch,path,userID')||![file.source.userID,file.source.epoch].every(uuid))throw Error('Invalid family attachment');
  const ext={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'}[file.mime];
  if(file.source.path!==`${file.source.userID}/${file.source.epoch}/${file.id}.${ext}`)throw Error('Unbound family attachment source');
  const source={userID:file.source.userID,epoch:file.source.epoch,path:file.source.path};
  const destination=source.userID===input.ownerID?{userID:input.recipientID,epoch:input.recipientEpoch,path:`${input.recipientID}/${input.recipientEpoch}/${file.id}.${ext}`}:{...source};
  return {id:file.id,mime:file.mime,size:file.size,sha256:file.sha256,source,destination};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 if(new Set(files.map(file=>file.id)).size!==files.length)throw Error('Duplicate family attachment');
 // The existing quota belongs to each uploader across all homes/epochs, not to
 // an entire shared home. Database reservation still checks the receiver's
 // other homes and concurrent pending reservations before any transfer.
 const usage=new Map();
 for(const file of files){const used=usage.get(file.source.userID)??{bytes:0,files:0};used.bytes+=file.size;used.files++;if(used.files>100||used.bytes>104857600)throw Error('Source attachment quota exceeded');usage.set(file.source.userID,used);}
 return freeze({requestID:input.requestID,homeID:input.homeID,ownerID:input.ownerID,ownerEpoch:input.ownerEpoch,recipientID:input.recipientID,recipientEpoch:input.recipientEpoch,snapshotDigest:input.snapshotDigest,files});
}

/** Backend only. A read must be bounded/authenticated and Blob content verified;
 * this opaque proof cannot be constructed by JSON or a paid/client flag.
 */
async function inspectedProof(scope,plan,ports,signal) {
 const started=Date.now();
 for(const file of plan.files){
  await authority(scope,ports,signal);
  const blob=await ports.inspectDestination(scope,plan,file,signal);
  await authority(scope,ports,signal);
  if(!(blob instanceof Blob)||blob.size!==file.size||blob.type!==file.mime)throw Error('Family copy unavailable');
  const bytes=await bounded(blob.arrayBuffer(),signal);await authority(scope,ports,signal);
  if(bytes.byteLength!==file.size||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==file.sha256)throw Error('Family copy mismatch');
 }
 if(Date.now()-started>=30000)throw Error('Family copy inspection expired');
 const proof=Object.freeze({});proofs.set(proof,{scope:digest(scope),plan:digest(plan),signal,expires:started+30000});return proof;
}
export function requireFamilyAttachmentProof(proof,scope,plan) {
 const record=proofs.get(proof);
 if(!record||record.signal.aborted||record.expires<=Date.now()||record.scope!==digest(scope)||record.plan!==digest(plan))throw Error('Current measured family copies required');
}
export function familyAttachmentProofDeadline(proof,scope,plan){
 requireFamilyAttachmentProof(proof,scope,plan);return new Date(proofs.get(proof).expires);
}
async function authority(scope,ports,signal) {
 signal.throwIfAborted();if(await ports.guard(scope,signal)!==true)throw Error('Family handoff authority unavailable');signal.throwIfAborted();
}

/** Prepared backend orchestration, no route/provider or production activation.
 * prepare reserves ALL receiver bytes/files and immutable dual-consented plan
 * before any owner switch. inspect null means definitive object absence only.
 * activate must verify the opaque proof and commit home owner, write route,
 * every file's custody/epoch/path and captured-owner metadata atomically with a
 * durable receipt under the same signed controller context and locks. It must
 * retain member-owned files/paths and reject unsettled writes/changed manifests.
 * status is authoritative receipt readback, not an in-memory/client state flag.
 * cleanup may remove original owner paths only after activation and fresh copy
 * inspection; finish requires definitive original absence. Quota cannot release
 * on a timeout. Whole-account Auth erasure must await this completed stage.
 */
export async function handoffFamilyAttachments(input,ports,signal) {
 const required=['guard','plan','prepare','status','inspectDestination','writeDestination','activate','removeSource','sourceAbsent','finish'];
 if(!(signal instanceof AbortSignal)||!ports||required.some(key=>typeof ports[key]!=='function'))return {state:'pending'};
 let plan;
 signal=AbortSignal.any([signal,AbortSignal.timeout(35000)]);
 const original=ports;ports=Object.fromEntries(required.map(name=>[name,(...args)=>bounded(Promise.resolve().then(()=>original[name](...args)),signal)]));
 try {
  const scope=freeze(structuredClone(input));
  if(!scope||![scope.requestID,scope.homeID,scope.userID,scope.ownerEpoch,scope.nativeLease].every(uuid))throw Error('Bound family operation scope required');
  await authority(scope,ports,signal);plan=normalizeFamilyAttachmentPlan(await ports.plan(scope,signal));await authority(scope,ports,signal);
  if(plan.requestID!==scope.requestID||plan.homeID!==scope.homeID||plan.ownerID!==scope.userID||plan.ownerEpoch!==scope.ownerEpoch)throw Error('Foreign family plan');
  const planDigest=digest(plan);
  const state=async()=>{
   await authority(scope,ports,signal);const receipt=await ports.status(scope,plan,signal);await authority(scope,ports,signal);
   if(!exact(receipt,'planDigest,state')||receipt.planDigest!==planDigest||!['absent','prepared','activated','complete'].includes(receipt.state))throw Error('Family receipt unconfirmed');return receipt.state;
  };
  let current=await state();
  if(current==='absent'){
   // Neither owner switch nor a handoff receipt is a preparation prerequisite.
   try{await ports.prepare(scope,plan,planDigest,signal);}catch{}
   current=await state();if(current==='absent')return {state:'pending'};
  }
  if(current==='complete')return {state:'complete',homeID:plan.homeID};
  if(current==='prepared'){
   for(const file of plan.files){
    await authority(scope,ports,signal);let found=await ports.inspectDestination(scope,plan,file,signal);await authority(scope,ports,signal);
    if(found===null&&file.source.path!==file.destination.path){
     // Create-only copy. An uncertain response is reconciled by a measured read;
     // do not blindly repeat, overwrite, change metadata or delete the source.
     try{await ports.writeDestination(scope,plan,file,signal);}catch{}
     await authority(scope,ports,signal);found=await ports.inspectDestination(scope,plan,file,signal);await authority(scope,ports,signal);
    }
    if(!(found instanceof Blob))return {state:'pending'};
   }
   const proof=await inspectedProof(scope,plan,ports,signal);await authority(scope,ports,signal);
   try{await ports.activate(scope,plan,planDigest,proof,signal);}catch{}
   current=await state();if(current==='prepared')return {state:'pending'};
  }
  if(current==='complete')return {state:'complete',homeID:plan.homeID};
  if(current!=='activated')throw Error('Family activation unconfirmed');
  // A durable activation receipt does not prove that copied bytes still exist.
  await inspectedProof(scope,plan,ports,signal);
  for(const file of plan.files.filter(file=>file.source.path!==file.destination.path)){
   await authority(scope,ports,signal);
   const missing=await ports.sourceAbsent(scope,plan,file,signal);await authority(scope,ports,signal);
   // Reconcile each original before another mutation: repeated interruptions
   // must advance beyond already-cleaned prefixes, preserving the same journal.
   if(missing===true)continue;
   if(missing!==false)throw Error('Family source presence unconfirmed');
   // Reinspect ALL copies immediately before each irreversible source removal.
   const proof=await inspectedProof(scope,plan,ports,signal);await authority(scope,ports,signal);
   try{await ports.removeSource(scope,plan,file,proof,signal);}catch{}
   await authority(scope,ports,signal);if(await ports.sourceAbsent(scope,plan,file,signal)!==true)return {state:'pending'};await authority(scope,ports,signal);
  }
  try{await ports.finish(scope,plan,planDigest,signal);}catch{}
  return await state()==='complete'?{state:'complete',homeID:plan.homeID}:{state:'pending'};
 }catch{return {state:'pending'};}
}
