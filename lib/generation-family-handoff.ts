import {createGenerationFamilyOriginals} from './generation-family-originals';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
type Base=Parameters<typeof createGenerationFamilyOriginals>[0];
type Options=Base&{verifyHandoffAdmission:(scope:unknown,tx:Tx,signal:AbortSignal,phase:'before'|'after')=>Promise<boolean>};
type Tx=Parameters<ReturnType<typeof createGenerationFamilyOriginals>['verifyProcessingOriginal']>[1];
export const GENERATION_HANDOFF_EXEC_SQL='select maintenance_private.execute_generation_family_handoff($1::uuid,$2::jsonb,$3::uuid,$4::jsonb) as ok';
export const GENERATION_HANDOFF_VERIFY_SQL='select * from maintenance_private.verify_generation_family_handoff($1::uuid,$2::jsonb,$3::uuid,$4::jsonb)';
/** Local empty-file fixed generation handoff/capture port. Instantiates the
 * strict new-domain original verifier, never an injected boolean verifier.
 * No legacy resigning, client approval, result capability or full erasure. */
export function createGenerationFamilyHandoff(options:Options){
 const fixed={...options},scope=normalizeSharedDeletionScope(fixed.scope),text=JSON.stringify(scope);
 if(typeof fixed.verifyHandoffAdmission!=='function')throw Error('Independent stage-specific handoff admission required');
 const phases=new WeakMap<Tx,'before'|'after'>();
 const admission=async(s:unknown,tx:Tx,signal:AbortSignal)=>{const phase=phases.get(tx);if(!phase)throw Error('Bound handoff phase required');return (phase!=='before'||await fixed.verifyNoDispatch(s,tx,signal)===true)&&await fixed.verifyHandoffAdmission(s,tx,signal,phase)===true;};
 const originals=createGenerationFamilyOriginals({...fixed,verifyNoDispatch:admission});
 const homes=fixed.homes.map(h=>Object.freeze({...h})).sort((a,b)=>a.homeID.localeCompare(b.homeID));
 const args=[fixed.generationID,text,fixed.nativeLease,JSON.stringify(homes)];
 const states=new WeakMap<Tx,{valid:boolean;pin:{pid:number;xid:string}|null;fingerprint:string|null}>();
 const matches=(v:unknown)=>{try{return JSON.stringify(normalizeSharedDeletionScope(v))===text;}catch{return false;}};
 const checked=(tx:Tx)=>{if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')throw Error('Checked generation handoff transaction required');tx.signal.throwIfAborted();};
 const same=(a:{pid:number;xid:string}|null,b:{pid:number;xid:string}|null)=>!!a&&!!b&&a.pid===b.pid&&a.xid===b.xid;
 async function pin(tx:Tx){const rows=(await tx.query(GENERATION_HANDOFF_VERIFY_SQL,args)).rows;tx.signal.throwIfAborted();const r=rows[0];if(rows.length!==1||Object.keys(r).sort().join(',')!=='backend_pid,ok,transaction_id'||r.ok!==true||!Number.isSafeInteger(r.backend_pid)||Number(r.backend_pid)<=0||typeof r.transaction_id!=='string'||!/^[1-9][0-9]*$/.test(r.transaction_id))return null;return {pid:Number(r.backend_pid),xid:r.transaction_id};}
 async function fingerprint(tx:Tx){const out=[];for(const h of homes)for(const actor of [scope.userID,h.successorID]){const p=await originals.readOriginal(h.homeID,actor,tx);if(!p)return null;out.push([h.homeID,actor,p.signature,p.payload]);}return JSON.stringify(out);}
 async function verify(tx:Tx,expected?:{pin:{pid:number;xid:string}|null;fingerprint:string|null}){checked(tx);const p=await pin(tx);if(!p||expected&&!same(expected.pin,p))return false;phases.set(tx,'after');if(await admission(scope,tx,tx.signal)!==true||await originals.verifyProcessingOriginal(scope,tx)!==true)return false;const f=await fingerprint(tx);return f!==null&&(!expected||f===expected.fingerprint)&&same(p,await pin(tx))&&await admission(scope,tx,tx.signal)===true;}
 return Object.freeze({
  async execute(value:unknown,tx:Tx){checked(tx);if(!matches(value))throw Error('Foreign generation handoff scope');const prior=states.get(tx);if(prior){prior.valid=false;throw Error('Generation handoff operation already used');}
   const state={valid:false,pin:null as {pid:number;xid:string}|null,fingerprint:null as string|null};states.set(tx,state);
   tx.beforeCommit('generation-family-handoff:'+fixed.generationID,async()=>{if(!state.valid)return false;try{return await verify(tx,state);}catch{return false;}});
   phases.set(tx,await pin(tx)?'after':'before');
   if(await admission(scope,tx,tx.signal)!==true||await originals.verifyProcessingOriginal(scope,tx)!==true)throw Error('Current same-generation originals/dispatch admission required');
   state.fingerprint=await fingerprint(tx);if(state.fingerprint===null)throw Error('Complete original set required');
   const rows=(await tx.query(GENERATION_HANDOFF_EXEC_SQL,args)).rows;if(rows.length!==1||rows[0].ok!==true)throw Error('Generation handoff/canonical capture unconfirmed');
   state.pin=await pin(tx);if(!state.pin||!await verify(tx,state))throw Error('Same original set and lawful post-handoff state required');state.valid=true;return true;
  },
  async verifyAfter(value:unknown,tx:Tx){if(!matches(value))return false;return verify(tx);}
 });
}
