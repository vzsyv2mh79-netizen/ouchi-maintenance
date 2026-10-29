import {StorageApiError,type SupabaseClient} from '@supabase/supabase-js';
import {sessionAfterAuthVerification} from './verified-app-session';
import {attachmentEpochMatches} from './attachment-epoch';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
type Receipt={phase:'removed';id:string;homeID:string;homeInstanceID:string;productID:string};
type Pending={phase:'pending';id:string;homeID:string;homeInstanceID:string;productID:string;size:number;mime:string;sha256:string;objectPath:string};
function checked(value:unknown,id:string):Receipt|Pending|null{
 if(value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Household removal unavailable');
 const v=Object.freeze({...value}) as Record<string,unknown>;
 if(v.id!==id||![v.homeID,v.homeInstanceID,v.productID].every(uuid))throw Error('Household removal scope invalid');
 if(v.phase==='removed'&&Object.keys(v).sort().join(',')==='homeID,homeInstanceID,id,phase,productID')return v as Receipt;
 const formats:Record<string,string>={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'};
 if(v.phase!=='pending'||Object.keys(v).sort().join(',')!=='homeID,homeInstanceID,id,mime,objectPath,phase,productID,sha256,size'
  ||typeof v.mime!=='string'||!Object.hasOwn(formats,v.mime)||!Number.isSafeInteger(v.size)||Number(v.size)<1||Number(v.size)>5242880
  ||typeof v.sha256!=='string'||!/^[0-9a-f]{64}$/.test(v.sha256)||v.objectPath!==`households/${v.homeInstanceID}/${id}.${formats[v.mime]}`)throw Error('Household removal metadata invalid');
 return v as Pending;
}
function same(a:Receipt|Pending,b:Receipt|Pending){return ['id','homeID','homeInstanceID','productID'].every(k=>a[k as keyof Receipt]===b[k as keyof Receipt])&&(a.phase==='removed'||b.phase==='removed'||['objectPath','size','mime','sha256'].every(k=>a[k as keyof Pending]===b[k as keyof Pending]));}
/** One authenticated household operation. The server derives the immutable path;
 * accepted pending state and product-scoped receipts survive lost replies.
 * No paid plan, background worker or physical capacity release is introduced.
 */
export async function removeHouseholdAttachmentResponse(request:Request,id:string,db:SupabaseClient){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(request.method!=='DELETE'||!uuid(id))return Response.json({error:'削除するファイルを確認してください。'},{status:400,headers});
 const success=()=>Response.json({removed:true,attachmentId:id,scope:'household'},{headers});
 try{
  request.signal.throwIfAborted();const bearer=request.headers.get('authorization');
  if(!bearer||!/^Bearer [^\s,]{1,16384}$/.test(bearer))return Response.json({error:'ログインしてください。'},{status:401,headers});
  const token=bearer.slice(7),verified=await db.auth.getUser(token);request.signal.throwIfAborted();
  if(verified.error||!verified.data.user)return Response.json({error:'ログインを確認できません。'},{status:401,headers});
  const session=sessionAfterAuthVerification(token,verified.data.user.id);if(!session)return Response.json({error:'登録を確認してください。'},{status:401,headers});
  const enrollment=await db.rpc('read_maintenance_explicit_enrollment',{target_user:session.userID,verified_session:session.sessionID});request.signal.throwIfAborted();
  if(enrollment.error||!uuid(enrollment.data)||!attachmentEpochMatches(request.headers.get('X-Ouchi-App-Epoch'),enrollment.data))return Response.json({error:'登録状態を確認し直してください。'},{status:401,headers});
  const args=Object.freeze({target_user:session.userID,verified_session:session.sessionID,expected_epoch:enrollment.data,target_attachment:id});
  const begin=async()=>{request.signal.throwIfAborted();const r=await db.rpc('begin_maintenance_household_attachment_removal',args);request.signal.throwIfAborted();if(r.error)throw Error('Household fence unavailable');return checked(r.data,id);};
  const scope=await begin();if(!scope)return Response.json({error:'添付を確認できません。'},{status:404,headers});if(scope.phase==='removed')return success();
  const current=async()=>{const next=await begin();if(!next||!same(scope,next))throw Error('Household removal scope changed');return next.phase==='removed';};
  if(await current())return success();
  const bucket=db.storage.from('ouchi-product-attachments');
  try{await bucket.remove([scope.objectPath]);}catch{/* Reconcile the same accepted path. */}
  request.signal.throwIfAborted();if(await current())return success();
  const missing=await bucket.download(scope.objectPath);request.signal.throwIfAborted();const error=missing.error;
  const absent=error instanceof StorageApiError&&error.code==='NoSuchKey'&&((error.status===404&&(error.statusCode===undefined||error.statusCode==='404'))||(error.status===400&&error.statusCode==='404'));
  if(missing.data||!absent)throw Error('Household object absence unconfirmed');
  if(await current())return success();
  let acknowledged=false;
  try{const result=await db.rpc('complete_maintenance_household_attachment_removal',{...args,expected_home_instance:scope.homeInstanceID,confirmed_path:scope.objectPath});acknowledged=!result.error&&result.data===true;}catch{/* A committed receipt can survive a lost acknowledgement. */}
  request.signal.throwIfAborted();if(acknowledged||await current())return success();throw Error('Household removal acknowledgement unavailable');
 }catch{return Response.json({error:'家族共有ファイルの削除完了を確認できませんでした。「削除確認待ち」から同じファイルを再確認してください。'},{status:503,headers});}
}
