import {createHash} from 'node:crypto';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
import {createHouseholdCopy} from './household-copy.mjs';
export const GENERATION_FILE_CALL_SQL='select maintenance_private.generation_file_copy_call($1::uuid,$2::jsonb,$3::uuid,$4::jsonb,$5::text,$6::jsonb) as value';
export const GENERATION_FILE_FRAME_SQL='select * from maintenance_private.generation_file_copy_frame($1::uuid,$2::jsonb,$3::uuid,$4::uuid,$5::boolean)';
const definitions=[
 ['prepare_household_copy','uuid,uuid,uuid,uuid,uuid,uuid,uuid','manifest','prepare'],
 ['lock_household_copy_intent','uuid,uuid,uuid,uuid','manifest','lock'],
 ['read_household_copy_status','uuid,uuid,uuid,uuid','receipt','status'],
 ['issue_household_copy_write','uuid,uuid,uuid,uuid,uuid,uuid','receipt','issue'],
 ['lock_household_copy_write','uuid,uuid,uuid,uuid,uuid,uuid','manifest','write'],
 ['record_household_copy_write_fact','uuid,uuid,uuid,uuid,uuid,uuid,text','recorded','fact'],
 ['confirm_household_copy_bytes','uuid,uuid,uuid,uuid,text,bigint','manifest','confirm']
];
const routes=new Map(definitions.map(([name,types,alias,action])=>['select maintenance_private.'+name+'('+types.split(',').map((t,i)=>'$'+(i+1)+'::'+t).join(',')+') '+alias,{action,alias,count:types.split(',').length}]));
const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x);
const hash=x=>createHash('sha256').update(stable(x)).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000';
const pin=r=>r&&Number.isSafeInteger(r.backend_pid)&&r.backend_pid>0&&typeof r.transaction_id==='string'&&/^[1-9][0-9]*$/.test(r.transaction_id)?r.backend_pid+':'+r.transaction_id:null;
/** Preparatory copy-only route. It is NOT the file-capable native generation,
 * household activation, erasure, cancellation, release, quota release or consent.
 * Old copy nonce/unknown-write machinery and all measured byte checks stay intact.
 * This adds immutable planned-generation binding and same-tx root/profile/current
 * independent finite namespace/review admission, never a client approval flag. */
export function createGenerationFileCopy(options){
 const fixed={...options},scope=normalizeSharedDeletionScope(fixed.scope),generationID=fixed.generationID,nativeLease=fixed.nativeLease,reviewRequestID=fixed.reviewRequestID,app=scope.apps.find(a=>a.app==='ouchi-maintenance'),clock=fixed.clock??Date.now;
 if(![generationID,nativeLease,reviewRequestID].every(uuid)||nativeLease===scope.leaseToken||!app||typeof fixed.connect!=='function'||typeof fixed.readAdmission!=='function')throw Error('Independent generation file-copy provider required');
 const frameArgs=[generationID,JSON.stringify(scope),nativeLease,reviewRequestID],scopeDigest=hash(scope);
 const connect=async bounds=>{
  const c=await fixed.connect(bounds);if(!c||typeof c.query!=='function')return c;const signal=bounds.signal;let physical=null,stamp=null,used=false,needsAdmission=false,failed=false;
  const tx=Object.freeze({signal,query:(...args)=>c.query(...args)});
  async function frame(factual){const rows=(await c.query(GENERATION_FILE_FRAME_SQL,[...frameArgs,factual])).rows;signal.throwIfAborted();if(rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='backend_pid,ok,transaction_id'||rows[0].ok!==true||!pin(rows[0])||(physical!==null&&physical!==pin(rows[0])))throw Error('Exact physical generation file root required');physical=pin(rows[0]);}
  async function admission(){const p=await fixed.readAdmission(scope,generationID,nativeLease,reviewRequestID,tx,signal);signal.throwIfAborted();if(!p||Object.keys(p).sort().join(',')!=='confirmedUntil,domain,generationID,namespaceWriterDigest,nativeLease,reviewEvidenceDigest,reviewRequestID,scopeDigest'||p.domain!=='OuchiMaintenance/generation-file-preparation-admission/v1'||p.scopeDigest!==scopeDigest||p.generationID!==generationID||p.nativeLease!==nativeLease||p.reviewRequestID!==reviewRequestID||![p.namespaceWriterDigest,p.reviewEvidenceDigest].every(hex)||typeof p.confirmedUntil!=='string'||!Number.isFinite(Date.parse(p.confirmedUntil))||new Date(p.confirmedUntil).toISOString()!==p.confirmedUntil||Date.parse(p.confirmedUntil)<=clock())throw Error('Independent finite file review/namespace writer admission required');const h=hash(p);if(stamp!==null&&stamp!==h)throw Error('File admission changed in owning transaction');stamp=h;}
  const lifecycle=new Set(['BEGIN','BEGIN READ ONLY',"SET LOCAL statement_timeout = '4500ms'","SET LOCAL lock_timeout = '1000ms'",'ROLLBACK']);
  return Object.freeze({...c,query:async(sql,args)=>{
   if(lifecycle.has(sql))return c.query(sql,args);
   if(sql==='COMMIT'){if(failed)throw Error('Generation file transaction poisoned');if(used){if(needsAdmission)await admission();await frame(!needsAdmission);}return c.query(sql,args);}
   const r=routes.get(sql);if(!r){failed=true;throw Error('Unexpected generation file SQL');}
   try{
    if(!Array.isArray(args)||args.length!==r.count)throw Error('Exact copy arguments required');
    const prepare=r.action==='prepare',input=prepare?{intentID:args[0],decisionID:args[1],reviewRequestID:args[2],userID:args[3],epochID:args[4],fileID:args[5],destinationID:args[6]}:{intentID:args[0],reviewRequestID:args[1],userID:args[2],epochID:args[3]},extra=prepare?[]:args.slice(4),factual=['status','fact'].includes(r.action);
    if(input.reviewRequestID!==reviewRequestID||input.userID!==scope.userID||input.epochID!==app.scopeID)throw Error('Foreign generation file scope');
    await frame(factual);used=true;if(!factual){needsAdmission=true;await admission();await frame(false);}
    const result=(await c.query(GENERATION_FILE_CALL_SQL,[generationID,JSON.stringify(scope),nativeLease,JSON.stringify(input),r.action,JSON.stringify(extra)])).rows;signal.throwIfAborted();
    if(result.length!==1||Object.keys(result[0]).join(',')!=='value')throw Error('Bound generation copy result required');await frame(factual);return {rows:[{[r.alias]:result[0].value}]};
   }catch(e){failed=true;throw e;}
  }});
 };
 const copy=createHouseholdCopy({connect,storage:fixed.storage});return Object.freeze({prepare:copy.prepare,status:copy.status,copy:copy.copy});
}
export const generationFileScopeDigest=hash;
