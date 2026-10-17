import {closureReadCustodyDeployment} from '@/lib/closure-read-custody-deployment';
import {createClosureReadCustodyRuntime} from '@/lib/closure-read-custody-runtime';
import type {ClosureReadAction} from '@/lib/closure-read-custody';
export const runtime='nodejs';
async function handle(request:Request,context:{params:Promise<{operation:string}>}){
 const {operation}=await context.params;
 const action:ClosureReadAction|undefined=operation==='window'?'describe':operation==='register'?'register':operation==='status'?'status':undefined;
 const reply=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 if(!action)return reply('Read operation unavailable',404);
 const config=closureReadCustodyDeployment(process.env,action);
 if(!config)return reply('Read custody unavailable',503);
 return createClosureReadCustodyRuntime(config)(request);
}
export const POST=handle;
export const GET=handle;
