import {billingConfiguration,billingDatabase,verifiedPurchaseAccount,verifyBillingTransaction,readBillingBody} from '@/lib/billing-server';
export const runtime='nodejs';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'},config=billingConfiguration();
 if(!config)return Response.json({error:'購入機能は準備中です。請求は行われません。'},{status:503,headers});
 const token=request.headers.get('authorization');if(!token?.startsWith('Bearer ')||token.length>16384)return Response.json({error:'ログインしてください。'},{status:401,headers});
 const db=billingDatabase(config);const {data:{user},error}=await db.auth.getUser(token.slice(7));if(error||!user)return Response.json({error:'ログインを確認できません。'},{status:401,headers});
 let purchaseAccount:string|null;
 try{purchaseAccount=await verifiedPurchaseAccount(db,token.slice(7),user.id);}catch{return Response.json({error:'購入アカウントを確認できません。'},{status:503,headers});}
 if(!purchaseAccount)return Response.json({error:'現在の登録を確認できません。'},{status:403,headers});
 try{
 const body=await readBillingBody(request);if(typeof body.signedTransaction!=='string')return Response.json({error:'取引を確認できません。'},{status:400,headers});
 const transaction=await verifyBillingTransaction(body.signedTransaction,config);if(transaction.accountToken!==purchaseAccount)return Response.json({error:'購入時のアカウントでログインしてください。'},{status:403,headers});
 const result=await db.rpc('apply_ouchi_sandbox_transaction',{payload:transaction});if(result.error)return Response.json({error:'購入結果を保存できません。復元から再確認してください。'},{status:503,headers});
 return Response.json({saved:true,environment:'Sandbox'},{headers});
 }catch{return Response.json({error:'検証できない取引です。利用権は変更していません。'},{status:400,headers});}
}
