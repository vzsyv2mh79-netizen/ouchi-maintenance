import {ownerlessHomeManagementDeployment} from '@/lib/ownerless-home-management-deployment';
import {createOwnerlessHomeManagementRuntime} from '@/lib/ownerless-home-management-runtime';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request:Request){
 const headers={'Cache-Control':'no-store'};
 const config=ownerlessHomeManagementDeployment(process.env);
 if(!config)return Response.json({error:'Management is not available'},{status:503,headers});
 try{return await createOwnerlessHomeManagementRuntime(config)(request);}
 catch{return Response.json({error:'Management result unconfirmed'},{status:503,headers});}
}
export const GET=handle;
export const POST=handle;
