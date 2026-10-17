import type {SupabaseClient} from '@supabase/supabase-js';
import {readProductAttachment} from './product-attachment';
import {sessionAfterAuthVerification} from './verified-app-session';
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const formats:Record<string,string>={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'};
function metadata(value:unknown,id:string){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Household file unavailable');
 const f=Object.freeze({...value}) as Record<string,unknown>;
 if(Object.keys(f).sort().join(',')!=='homeID,homeInstanceID,id,mime,objectPath,productID,sha256,size'||f.id!==id||![f.homeID,f.homeInstanceID,f.productID].every(uuid)
  ||typeof f.mime!=='string'||!Object.hasOwn(formats,f.mime)||!Number.isSafeInteger(f.size)||Number(f.size)<1||Number(f.size)>5242880
  ||typeof f.sha256!=='string'||!/^[0-9a-f]{64}$/.test(f.sha256)||f.objectPath!==`households/${f.homeInstanceID}/${id}.${formats[f.mime]}`)throw Error('Household file metadata invalid');
 return f as Readonly<{id:string;homeID:string;homeInstanceID:string;productID:string;size:number;mime:string;sha256:string;objectPath:string}>;
}
/** Retained household files have no uploader account in their path. Read-only;
 * configured server SDK must bound requests/bodies and refuse redirects. SQL
 * verifies current session, app epoch, home incarnation and family membership.
 * No subscription check: existing files remain readable after expiry.
 */
export async function readHouseholdAttachmentResponse(request:Request,db:SupabaseClient){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},query=new URL(request.url).searchParams;
 const attachment=query.get('attachmentId'),product=query.get('productId'),after=query.get('after');
 if(request.method!=='GET'||query.get('scope')!=='household'||[...query.keys()].some(k=>!['scope','attachmentId','productId','after','page'].includes(k)||query.getAll(k).length!==1)
  ||(query.has('page')&&query.get('page')!=='true')||((attachment===null)===(product===null))||(attachment!==null&&!uuid(attachment))||(product!==null&&!uuid(product))
  ||(after!==null&&(!product||!uuid(after)))||(attachment&&query.has('page')))return Response.json({error:'添付を確認してください。'},{status:400,headers});
 try{
  const bearer=request.headers.get('authorization');if(!bearer||!/^Bearer [^\s,]{1,16384}$/.test(bearer))return Response.json({error:'ログインしてください。'},{status:401,headers});
  const token=bearer.slice(7),verified=await db.auth.getUser(token),user=verified.data.user?.id;
  if(verified.error||!user)return Response.json({error:'ログインを確認できません。'},{status:401,headers});
  const session=sessionAfterAuthVerification(token,user);if(!session)return Response.json({error:'登録を確認できません。'},{status:401,headers});
  const binding=await db.rpc('read_maintenance_explicit_enrollment',{target_user:user,verified_session:session.sessionID});
  if(binding.error||!uuid(binding.data))return Response.json({error:'登録を確認できません。'},{status:401,headers});
  const scope={target_user:user,verified_session:session.sessionID,expected_epoch:binding.data};
  if(product){
   const result=await db.rpc('page_maintenance_household_attachments',{...scope,target_product:product,after_attachment:after});
   const rows=result.data?.items,next=result.data?.next;
   if(result.error||!Array.isArray(rows)||rows.length>25||!(next===null||(uuid(next)&&rows.length===25&&next===rows.at(-1)?.id)))throw Error('Household file list unavailable');
   let prior=after;const items=rows.map((f:{id:string;size:number;mime:string;createdAt:string})=>{
    if(!f||Object.keys(f).sort().join(',')!=='createdAt,id,mime,size'||!uuid(f.id)||(prior!==null&&f.id<=prior)||!Number.isSafeInteger(f.size)||f.size<1||f.size>5242880||!Object.hasOwn(formats,f.mime)||typeof f.createdAt!=='string'||!Number.isFinite(Date.parse(f.createdAt)))throw Error('Household file list invalid');
    prior=f.id;return {...f,scope:'household'};
   });
   request.signal.throwIfAborted();return Response.json({items,next},{headers});
  }
  const args={...scope,target_attachment:attachment!},result=await db.rpc('read_maintenance_household_attachment',args);
  if(result.error)throw Error('Household metadata unavailable');if(result.data===null)return Response.json({error:'添付を確認できません。'},{status:404,headers});
  const f=metadata(result.data,attachment!),stored=await db.storage.from('ouchi-product-attachments').download(f.objectPath,{}, {signal:request.signal,cache:'no-store'});
  if(stored.error||!(stored.data instanceof Blob)||stored.data.size!==f.size)throw Error('Household file unavailable');
  const actual=await readProductAttachment(new Request('http://127.0.0.1/attachment',{method:'POST',signal:request.signal,headers:{'content-type':stored.data.type,'content-length':String(stored.data.size)},body:await stored.data.arrayBuffer()}));
  if(actual.sha256!==f.sha256||actual.mime!==f.mime)throw Error('Household content mismatch');
  const authenticated=await db.auth.getUser(token);if(authenticated.error||authenticated.data.user?.id!==user)throw Error('Household identity changed');
  const current=await db.rpc('read_maintenance_household_attachment',args);if(current.error||current.data===null)return Response.json({error:'添付を確認できません。'},{status:404,headers});
  const latest=metadata(current.data,attachment!);if((Object.keys(f) as (keyof typeof f)[]).some(key=>latest[key]!==f[key]))throw Error('Household scope changed');request.signal.throwIfAborted();
  return new Response(new Uint8Array(actual.bytes),{headers:{...headers,'Content-Type':actual.mime,'Content-Disposition':`attachment; filename="ouchi-attachment-${f.id}.${formats[f.mime]}"`}});
 }catch{return Response.json({error:'添付を取得できませんでした。'},{status:503,headers});}
}
