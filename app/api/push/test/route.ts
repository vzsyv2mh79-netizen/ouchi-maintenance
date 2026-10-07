import {pushConfiguration,pushDatabase,sendPush} from '@/lib/push-server';
import {isPushEndpoint} from '@/lib/push-validation';
export const runtime='nodejs';
export async function POST(request:Request) {
 const headers={'Cache-Control':'no-store'};
 const response=(error:string,status:number)=>Response.json({error},{status,headers});
 const token=request.headers.get('authorization');
 if(!token?.startsWith('Bearer ')||token.length>16384)return response('ログインしてください。',401);
 const config=pushConfiguration();if(!config)return response('通知の送信設定がまだありません。',503);
 if(Number(request.headers.get('content-length')??0)>4096)return response('送信内容が大きすぎます。',413);
 const db=pushDatabase(config);
 const {data:{user},error:authError}=await db.auth.getUser(token.slice(7));
 if(authError||!user)return response('ログインをやり直してください。',401);
 let endpoint:unknown;
 try{const body=await request.text();if(new TextEncoder().encode(body).length>4096)return response('送信内容が大きすぎます。',413);endpoint=JSON.parse(body).endpoint;}
 catch{return response('通知先を確認できません。',400);}
 if(!isPushEndpoint(endpoint))return response('この通知先は利用できません。',400);
 const {data,error}=await db.rpc('claim_maintenance_push_test',{target_user:user.id,target_endpoint:endpoint});
 if(error)return response(error.code==='P0003'?'テスト通知は1分に1回です。少し待ってください。':'この端末の通知を有効にしてください。',error.code==='P0003'?429:404);
 const subscription=data?.[0];if(!subscription)return response('通知先を確認できません。',404);
 try{
  await sendPush(config,subscription,{title:'おうちメンテ',body:'テスト通知です。この端末でお手入れ通知を受け取れます。',tag:'ouchi-maintenance-test',url:'/'});
  return Response.json({sent:true},{headers});
 }catch(cause){
  const status=(cause as {statusCode?:number})?.statusCode;
  if(status===404||status===410)return response('通知先の期限が切れています。通知を停止してから、もう一度有効にしてください。',410);
  return response('通知を送信できませんでした。しばらくしてからお試しください。',502);
 }
}
