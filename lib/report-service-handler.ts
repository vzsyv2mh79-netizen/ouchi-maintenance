import type {SupabaseClient} from '@supabase/supabase-js';
import type {BillingEnvironment} from './billing';
import {attachmentDeployment} from './attachment-service-handler';
import {attachmentEpochMatches,validAttachmentEpoch} from './attachment-epoch';
import {sessionAfterAuthVerification} from './verified-app-session';
import {purchaseAccountAfterAuthVerification} from './billing-account';
import {readVerifiedLedgerEntitlement} from './billing-ledger-entitlement';
import {validateData} from './backup';
import {maintenanceReport} from './maintenance-report';
type BillingDeployment={url:string;key:string;environment:BillingEnvironment;storage:string};
export type ReportDeployment=BillingDeployment&{publishableKey:string};
export function reportDeployment(config:BillingDeployment|null,enabled:string|undefined,publishableKey:string|undefined):ReportDeployment|null{
 const valid=attachmentDeployment(config,enabled);
 if(!valid||!publishableKey?.startsWith('sb_publishable_')||publishableKey.length>16384||/\s/.test(publishableKey))return null;
 return {...valid,publishableKey};
}
/** Prepared formal handler. Household reads always use the caller JWT and RLS. */
export async function reportServiceResponse(request:Request,config:ReportDeployment|null,factories:{service:(config:ReportDeployment,signal:AbortSignal)=>SupabaseClient;caller:(config:ReportDeployment,token:string,signal:AbortSignal)=>SupabaseClient}){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(!config)return Response.json({error:'レポートは準備中です。'},{status:503,headers});
 if(request.method!=='GET')return Response.json({error:'Unsupported method'},{status:405,headers:{...headers,Allow:'GET'}});
 const query=new URL(request.url).searchParams,home=query.get('homeId');
 if([...query.keys()].some(key=>key!=='homeId')||query.getAll('homeId').length!==1||!home||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(home)||home==='00000000-0000-0000-0000-000000000000')return Response.json({error:'住まいを選択してください。'},{status:400,headers});
 const expected=request.headers.get('X-Ouchi-App-Epoch');
 if(!validAttachmentEpoch(expected))return Response.json({error:'登録状態を確認し直してください。'},{status:400,headers});
 const header=request.headers.get('authorization'),token=header?.startsWith('Bearer ')?header.slice(7):'';
 if(!token||token.length>16384||/\s/.test(token))return Response.json({error:'ログインしてください。'},{status:401,headers});
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);
 try{
  signal.throwIfAborted();const db=factories.service(config,signal);
  const verified=await db.auth.getUser(token);signal.throwIfAborted();
  if(verified.error||!verified.data.user)return Response.json({error:'ログインを確認できません。'},{status:401,headers});
  const user=verified.data.user.id,session=sessionAfterAuthVerification(token,user);
  if(!session)return Response.json({error:'現在のログインを確認できません。'},{status:401,headers});
  const binding=()=>purchaseAccountAfterAuthVerification(token,user,async(target_user,verified_session)=>{
   const result=await db.rpc('current_maintenance_purchase_account',{target_user,verified_session});signal.throwIfAborted();if(result.error)throw Error('Binding unavailable');return result.data;
  });
  const epoch=await binding();signal.throwIfAborted();
  if(!epoch||!attachmentEpochMatches(expected,epoch))return Response.json({error:'現在の登録を確認できません。'},{status:403,headers});
  const premium=async()=>{const rights=await readVerifiedLedgerEntitlement(async(name,args)=>await db.rpc(name,args),{target_user:user,verified_session:session.sessionID,target_epoch:epoch,target_environment:config.environment});signal.throwIfAborted();return rights.plan==='premium';};
  if(!await premium())return Response.json({error:'有料プランの利用権が必要です。'},{status:403,headers});
  const scoped=factories.caller(config,token,signal),loaded=await scoped.rpc('load_household');signal.throwIfAborted();
  if(loaded.error)throw Error('Household unavailable');
  const data=validateData(loaded.data),selected=data.homes.find(value=>value.id.toLowerCase()===home.toLowerCase());
  if(!selected)return Response.json({error:'住まいを確認できません。'},{status:404,headers});
  // Recheck Auth, enrollment, RLS membership and expiry after loading private data.
  const current=await db.auth.getUser(token);signal.throwIfAborted();
  if(current.error||current.data.user?.id!==user||await binding()!==epoch)return Response.json({error:'ログイン状態が変わりました。'},{status:403,headers});
  const access=await scoped.from('homes').select('id').eq('id',selected.id).maybeSingle();signal.throwIfAborted();
  if(access.error)throw Error('Membership unavailable');
  if(access.data?.id!==selected.id)return Response.json({error:'住まいを確認できません。'},{status:404,headers});
  if(!await premium())return Response.json({error:'有料プランの利用権を確認できません。'},{status:403,headers});
  signal.throwIfAborted();
  const body=JSON.stringify({environment:config.environment,purchaseAccountToken:epoch,report:maintenanceReport(data,selected.id,Date.now())});
  if(Buffer.byteLength(body)>2_000_000)throw Error('Report too large');
  return new Response(body,{headers:{...headers,'Content-Type':'application/json'}});
 }catch{return Response.json({error:'レポートを作成できません。時間をおいてお試しください。'},{status:503,headers});}
}
