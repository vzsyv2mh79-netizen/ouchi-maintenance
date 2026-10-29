import {HOME_HANDOFF_SESSION_POLICY_SQL,HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,HOME_HANDOFF_AUTH_USER_PIN_SQL,HOME_HANDOFF_AUTH_SESSION_PIN_SQL,HOME_HANDOFF_AUTH_FACTOR_PIN_SQL,HOME_HANDOFF_ENROLLMENT_PIN_SQL,HOME_HANDOFF_AUTH_STATE_SQL} from './home-handoff-identity';
type Result={rows:Record<string,unknown>[]};
type Connection={query:(sql:string,args?:unknown[])=>Promise<Result>;abort:()=>void;close:()=>Promise<void>};
type Connect=(options:{signal:AbortSignal})=>Promise<Connection>;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
type Mapping={sql:string;length:number;actor:number|null;session:number|null;epoch?:number};
const mapped=new Map<string,Mapping>([
 [HOME_HANDOFF_SESSION_POLICY_SQL,{sql:'select * from maintenance_private.home_management_session($1::uuid,$2::uuid,$3::bigint,$4::bigint)',length:4,actor:1,session:0}],
 [HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,{sql:'select * from maintenance_private.home_management_pin_constraints()',length:0,actor:null,session:null}],
 [HOME_HANDOFF_AUTH_USER_PIN_SQL,{sql:'select * from maintenance_private.home_management_pin_user($1::uuid)',length:1,actor:0,session:null}],
 [HOME_HANDOFF_AUTH_SESSION_PIN_SQL,{sql:'select * from maintenance_private.home_management_pin_session($1::uuid,$2::uuid)',length:2,actor:1,session:0}],
 [HOME_HANDOFF_AUTH_FACTOR_PIN_SQL,{sql:'select * from maintenance_private.home_management_pin_factors($1::uuid)',length:1,actor:0,session:null}],
 [HOME_HANDOFF_ENROLLMENT_PIN_SQL,{sql:'select * from maintenance_private.home_management_pin_enrollment($1::uuid,$2::uuid)',length:2,actor:0,session:1}],
 [HOME_HANDOFF_AUTH_STATE_SQL,{sql:'select * from maintenance_private.home_management_auth_snapshot($1::uuid,$2::uuid)',length:2,actor:0,session:1}],
 ['select maintenance_private.read_ownerless_home_status($1::uuid,$2::uuid,$3::uuid,$4::uuid) as receipt',
  {sql:"select * from maintenance_private.home_management_execute('status',$2::uuid,$3::uuid,$4::uuid,$1::uuid,null,null)",length:4,actor:1,session:2,epoch:3}],
 ['select maintenance_private.read_ownerless_home_claim($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid) as receipt',
  {sql:"select * from maintenance_private.home_management_execute('read',$4::uuid,$5::uuid,$6::uuid,$2::uuid,$1::uuid,$3::uuid)",length:6,actor:3,session:4,epoch:5}],
 ['select maintenance_private.claim_ownerless_home($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid) as receipt',
  {sql:"select * from maintenance_private.home_management_execute('claim',$4::uuid,$5::uuid,$6::uuid,$2::uuid,$1::uuid,$3::uuid)",length:6,actor:3,session:4,epoch:5}],
]);
const bounds=new Set(["SET LOCAL statement_timeout = '4500ms'","SET LOCAL lock_timeout = '1000ms'"]);
/** Dedicated transport only. Identity verifier authenticates the exact bearer
 * before its FIRST session query; only that query may initialize DB context.
 * Reject raw SQL, cross-actor/session/epoch reuse and operations before identity.
 * No Auth/table SELECT or write grants are needed by the separate executor.
 */
export function createHomeManagementPrivateConnection({connect}:{connect:Connect}):Connect{
 if(typeof connect!=='function')throw Error('Dedicated management connection required');
 return async options=>{
  const raw=await connect(options);
  if(!raw||typeof raw.query!=='function'||typeof raw.abort!=='function'||typeof raw.close!=='function')return raw;
  let begun=false,ended=false,actor:string|null=null,session:string|null=null,epoch:string|null=null;
  return {abort:()=>raw.abort(),close:()=>raw.close(),query:async(sql,args)=>{
   if(sql==='BEGIN'){
    if(begun||ended)throw Error('One management transaction required');
    await raw.query(sql,args);begun=true;
    return raw.query('SET LOCAL ROLE ouchi_home_management_executor');
   }
   if(!begun||ended)throw Error('Current management transaction required');
   if(bounds.has(sql))return raw.query(sql,args);
   if(sql==='COMMIT'||sql==='ROLLBACK'){
    const value=await raw.query(sql,args);ended=true;return value;
   }
   const target=mapped.get(sql);
   if(!target||!Array.isArray(args)||args.length!==target.length)throw Error('Unsupported private management SQL');
   const first=actor===null;
   if(first&&sql!==HOME_HANDOFF_SESSION_POLICY_SQL)throw Error('Verified management session must initialize context');
   const currentActor=target.actor===null?actor:args[target.actor],currentSession=target.session===null?session:args[target.session];
   if(!uuid(currentActor)||!uuid(currentSession)||(actor!==null&&actor!==currentActor)||(session!==null&&session!==currentSession))throw Error('Bound management actor and session required');
   if(!first&&!uuid(epoch))throw Error('Bound management enrollment required');
   if(target.epoch!==undefined&&args[target.epoch]!==epoch)throw Error('Bound management enrollment required');
   if(first){
    actor=currentActor;session=currentSession;
    await raw.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:actor,session_id:session}),actor]);
   }
   const result=await raw.query(target.sql,[...args]);
   if(sql===HOME_HANDOFF_SESSION_POLICY_SQL){
    const currentEpoch=result?.rows?.length===1?result.rows[0].epoch_id:null;
    if(!uuid(currentEpoch)||(epoch!==null&&epoch!==currentEpoch))throw Error('Bound management enrollment required');
    epoch=currentEpoch;
   }
   return result;
  }};
 };
}
