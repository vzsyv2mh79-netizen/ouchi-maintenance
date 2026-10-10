// App-access cleanup workflow; not a complete shared-identity deletion feature.
type Identity={id:string;email:string};
export type ClosureDependencies={
 verify:(token:string)=>Promise<Identity|null>;
 reauthenticate:(email:string,password:string)=>Promise<string|null>;
 close:(verifiedID:string)=>Promise<boolean>;
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
  if(!user||!user.email||!/^[0-9a-f-]{36}$/i.test(user.id))return reply({error:'Authentication required'},401);
  const verifiedID=await dependencies.reauthenticate(user.email,password);
  if(verifiedID!==user.id)return reply({error:'Reauthentication required'},403);
  const changed=await dependencies.close(user.id);
  if(typeof changed!=='boolean')throw new Error();
  return reply({appAccessClosed:true,cleanupApplied:changed,sharedIdentityPreserved:true},200);
 }catch{return reply({error:'Cleanup not confirmed. Check status before retrying.'},503);}
}
