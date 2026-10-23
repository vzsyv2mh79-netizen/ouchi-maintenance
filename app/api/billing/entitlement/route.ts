import {billingConfiguration,billingDatabase} from '@/lib/billing-server';
import {entitlementFromTransactions,type VerifiedTransaction} from '@/lib/billing';
export const runtime='nodejs';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'},config=billingConfiguration();if(!config)return Response.json({plan:'free',salesEnabled:false},{headers});
 const token=request.headers.get('authorization');if(!token?.startsWith('Bearer ')||token.length>16384)return Response.json({error:'ログインしてください。'},{status:401,headers});
 const db=billingDatabase(config),{data:{user},error}=await db.auth.getUser(token.slice(7));if(error||!user)return Response.json({error:'ログインを確認できません。'},{status:401,headers});
 const result=await db.from('ouchi_sandbox_transactions').select('payload').eq('user_id',user.id);
 if(result.error)return Response.json({error:'契約状態を確認できません。'},{status:503,headers});
 return Response.json({...entitlementFromTransactions((result.data??[]).map(v=>v.payload as VerifiedTransaction),Date.now()),salesEnabled:false,environment:'Sandbox'},{headers});
}
