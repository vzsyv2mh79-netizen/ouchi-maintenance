import {sessionAfterAuthVerification} from './verified-app-session';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Caller MUST first authenticate this exact bearer with Auth.getUser. */
export async function purchaseAccountAfterAuthVerification(token:string,verifiedUser:string,readBinding:(user:string,session:string)=>Promise<unknown>):Promise<string|null>{
 const identity=sessionAfterAuthVerification(token,verifiedUser);if(!identity)return null;
 const binding=await readBinding(identity.userID,identity.sessionID);
 if(typeof binding!=='string'||!uuid.test(binding)||binding==='00000000-0000-0000-0000-000000000000'||binding.toLowerCase()===identity.userID)return null;
 return binding.toLowerCase();
}
