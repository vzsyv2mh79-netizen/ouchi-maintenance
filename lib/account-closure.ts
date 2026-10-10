// App-access cleanup workflow; not a complete shared-identity deletion feature.
type Identity={id:string;email:string;sessionID:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function identityID(value:unknown):string|null {
 return typeof value==='string'&&uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000'?value.toLowerCase():null;
}
export type ClosureDependencies={
 verify:(token:string)=>Promise<Identity|null>;
 reauthenticate:(email:string,password:string)=>Promise<string|null>;
 close:(verifiedID:string,verifiedSessionID:string)=>Promise<boolean>;
};
export async function handleTestAccountClosure(request:Request, dependencies:ClosureDependencies) {
 const headers={'Cache-Control':'no-store'};
 const reply=(body:object,status:number)=>Response.json(body,{status,headers});
 const token=request.headers.get('authorization');
 if(!token||token.length>16384||!/^Bearer [^\s]+$/.test(token))return reply({error:'Authentication required'},401);
 let password:string;
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error();
  const chunks:Uint8Array[]=[];let count=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>4096)throw new Error();chunks.push(value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(count);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!body||Array.isArray(body)||Object.keys(body).sort().join(',')!=='confirmation,password'||body.confirmation!=='DELETE_OUCHI_MAINTENANCE'||typeof body.password!=='string'||body.password.length<1||body.password.length>1024)throw new Error();
  password=body.password;
 }catch{return reply({error:'Explicit confirmation and password required'},400);}
 try{
  const user=await dependencies.verify(token.slice(7));
  const target=identityID(user?.id);
  const sessionID=identityID(user?.sessionID);
  if(!user||!target||!sessionID||typeof user.email!=='string'||!user.email||user.email.length>320)return reply({error:'Authentication required'},401);
  const verifiedID=await dependencies.reauthenticate(user.email,password);
  if(identityID(verifiedID)!==target)return reply({error:'Reauthentication required'},403);
  const changed=await dependencies.close(target,sessionID);
  if(typeof changed!=='boolean')throw new Error();
  return reply({appAccessClosed:true,cleanupApplied:changed,sharedIdentityPreserved:true},200);
 }catch{return reply({error:'Cleanup not confirmed. Check status before retrying.'},503);}
}
