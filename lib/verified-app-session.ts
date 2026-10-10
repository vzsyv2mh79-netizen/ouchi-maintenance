// This is NOT a JWT signature verifier. Call only AFTER the authentication
// server has verified this exact bearer token (getUser), with its returned ID.
// Never pass a decoded/client-supplied user ID as verifiedUserID.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nil='00000000-0000-0000-0000-000000000000';
const id=(value:unknown)=>typeof value==='string'&&uuid.test(value)&&value!==nil?value.toLowerCase():null;
export type VerifiedAppSession={userID:string;sessionID:string};
export function sessionAfterAuthVerification(token:string,verifiedUserID:string,now:Date=new Date()):VerifiedAppSession|null {
 const userID=id(verifiedUserID);
 if(!userID||typeof token!=='string'||token.length>16384)return null;
 const parts=token.split('.');
 if(parts.length!==3||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))return null;
 try{
  const bytes=Buffer.from(parts[1],'base64url');
  if(bytes.toString('base64url')!==parts[1])return null;
  const claims=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!claims||typeof claims!=='object'||Array.isArray(claims))return null;
  const sessionID=id(claims.session_id),subject=id(claims.sub),time=now.getTime()/1000;
  if(!sessionID||subject!==userID||!Number.isFinite(time)||!Number.isSafeInteger(claims.exp)||claims.exp<=time)return null;
  // Session IDs must come from signed top-level claims, never editable metadata.
  return {userID,sessionID};
 }catch{return null;}
}
