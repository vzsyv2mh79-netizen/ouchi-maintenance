import {accountClosureReviewDeployment} from '@/lib/account-closure-review-deployment';
import {createAccountClosureReviewRuntime} from '@/lib/account-closure-review-runtime';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
 const headers={'Cache-Control':'no-store'};
 const config=accountClosureReviewDeployment(process.env);
 if(!config)return Response.json({error:'Account review is not available'},{status:503,headers});
 try{
  const {action}=await params;
  if(!['request','read','cancel'].includes(action))return Response.json({error:'Method not allowed'},{status:405,headers});
  return await createAccountClosureReviewRuntime(config)(request,action);
 }catch{return Response.json({error:'Account review result is unconfirmed'},{status:503,headers});}
}
