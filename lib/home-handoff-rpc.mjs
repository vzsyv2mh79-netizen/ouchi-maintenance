import {HomeHandoffRefusal} from './home-handoff-handler.mjs';
const validID=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
// Prepared adapter, not a deployment factory. Supply a dedicated server client
// with bounded fetch/body handling and an independently verified current-MFA
// identity port. Never construct this from client-supplied credentials/flags.
export function homeHandoffRPCDependencies({client,origin,verifyCurrent}){
 if(!client||typeof client.rpc!=='function'||typeof verifyCurrent!=='function'||typeof origin!=='string')throw Error('Handoff provider unavailable');
 async function rpc(name,scope,signal,extra={}){
  signal.throwIfAborted();
  for(const key of ['requestID','userID','sessionID','epochID'])if(!validID(scope[key]))throw Error('Invalid verified handoff scope');
  const args={target_request:scope.requestID,target_user:scope.userID,verified_session:scope.sessionID,expected_epoch:scope.epochID,...extra};
  const query=client.rpc(name,args);
  if(typeof query.abortSignal!=='function'||typeof query.retry!=='function')throw Error('Bounded handoff provider required');
  const result=await query.retry(false).abortSignal(signal);signal.throwIfAborted();
  if(result.error){
   if(name==='decide_maintenance_home_handoff'&&result.error.code==='P0001'&&result.error.message==='Attachment handoff required')throw new HomeHandoffRefusal('attachment_handoff_required');
   throw Error('Handoff result unconfirmed');
  }
  if(result.data===null&&name!=='read_maintenance_home_handoff')throw Error('Handoff result unconfirmed');
  return result.data;
 }
 return{origin,verifyCurrent,
  read:(scope,signal)=>rpc('read_maintenance_home_handoff',scope,signal),
  create:(scope,signal)=>{
   if(!validID(scope.homeID)||!validID(scope.recipientID)||scope.recipientID===scope.userID)throw Error('Invalid handoff request');
   return rpc('request_maintenance_home_handoff',scope,signal,{target_home:scope.homeID,target_recipient:scope.recipientID});
  },
  decide:(scope,signal)=>{
   if(typeof scope.accept!=='boolean')throw Error('Invalid handoff decision');
   return rpc('decide_maintenance_home_handoff',scope,signal,{accept:scope.accept});
  },
 };
}
