import 'server-only';
import type {ClosureReadAction} from './closure-read-custody';
/** Reads explicit preparation only. No provisioning, role membership changes,
 * credential fallback, retention approval or endpoint activation is inferred.
 */
export function closureReadCustodyDeployment(env:Readonly<Record<string,string|undefined>>,action:ClosureReadAction){
 if(!['describe','register','status'].includes(action)||env.OUCHI_CLOSURE_READ_CUSTODY_ENABLED!=='true'||env.OUCHI_CLOSURE_READ_CUSTODY_DEPLOYMENT_APPROVED!=='true')return null;
 const projectID=env.OUCHI_CLOSURE_READ_CUSTODY_PROJECT_REF,publishableKey=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!projectID||!/^[a-z]{20}$/.test(projectID)||!publishableKey||!/^sb_publishable_[A-Za-z0-9_-]{1,2000}$/.test(publishableKey))return null;
 const authURL='https://'+projectID+'.supabase.co';
 if(env.NEXT_PUBLIC_SUPABASE_URL!==authURL&&env.NEXT_PUBLIC_SUPABASE_URL!==authURL+'/')return null;
 const role=action==='status'?'ouchi_closure_receipt_read_runtime':'ouchi_closure_receipt_register_runtime';
 try{
  const url=new URL(action==='status'?env.OUCHI_CLOSURE_READ_CUSTODY_READ_DATABASE_URL??'':env.OUCHI_CLOSURE_READ_CUSTODY_REGISTER_DATABASE_URL??'');
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash||url.pathname!=='/postgres'||(url.port&&url.port!=='5432'))return null;
  const user=decodeURIComponent(url.username),password=decodeURIComponent(url.password);
  const direct=url.hostname==='db.'+projectID+'.supabase.co'&&user===role;
  const pooled=/^aws-\d+-[a-z]+-[a-z]+-\d+\.pooler\.supabase\.com$/.test(url.hostname)&&user===role+'.'+projectID;
  if((!direct&&!pooled)||!password||password.length>2000)return null;
  const ca=env.OUCHI_CLOSURE_READ_CUSTODY_DATABASE_CA;
  if(ca!==undefined&&(ca.length>65536||!ca.startsWith('-----BEGIN CERTIFICATE-----')||!ca.trimEnd().endsWith('-----END CERTIFICATE-----')))return null;
  return Object.freeze({projectID,authURL,publishableKey,action,role,
   database:Object.freeze({host:url.hostname,port:5432,database:'postgres',user,password,ssl:Object.freeze({rejectUnauthorized:true as const,...(ca?{ca}:{})}),application_name:'ouchi-closure-read-'+action})});
 }catch{return null;}
}
