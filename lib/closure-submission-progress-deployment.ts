import 'server-only';
type Environment=Readonly<Record<string,string|undefined>>;
/** Explicit server-only deployment input. Reading this never opens a socket,
 * creates credentials/grants or activates the disabled native entry point.
 * No generic service-role/database credential fallback is permitted.
 */
export function closureSubmissionProgressDeployment(env:Environment){
 if(env.OUCHI_CLOSURE_PROGRESS_ENABLED!=='true'||env.OUCHI_CLOSURE_PROGRESS_DEPLOYMENT_APPROVED!=='true')return null;
 const projectID=env.OUCHI_CLOSURE_PROGRESS_PROJECT_REF,publishableKey=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!projectID||!/^[a-z]{20}$/.test(projectID)||!publishableKey||!/^sb_publishable_[A-Za-z0-9_-]{1,2000}$/.test(publishableKey))return null;
 const authURL='https://'+projectID+'.supabase.co';
 if(env.NEXT_PUBLIC_SUPABASE_URL!==authURL&&env.NEXT_PUBLIC_SUPABASE_URL!==authURL+'/')return null;
 try{
  const url=new URL(env.OUCHI_CLOSURE_PROGRESS_DATABASE_URL??'');
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash||url.pathname!=='/postgres'||(url.port&&url.port!=='5432'))return null;
  const user=decodeURIComponent(url.username),password=decodeURIComponent(url.password),role='ouchi_closure_progress_runtime';
  const direct=url.hostname==='db.'+projectID+'.supabase.co'&&user===role;
  const pooled=/^aws-\d+-[a-z]+-[a-z]+-\d+\.pooler\.supabase\.com$/.test(url.hostname)&&user===role+'.'+projectID;
  if((!direct&&!pooled)||!password||password.length>2000)return null;
  const ca=env.OUCHI_CLOSURE_PROGRESS_DATABASE_CA;
  if(ca!==undefined&&(ca.length>65536||!ca.startsWith('-----BEGIN CERTIFICATE-----')||!ca.trimEnd().endsWith('-----END CERTIFICATE-----')))return null;
  return Object.freeze({projectID,authURL,publishableKey,role,
   database:Object.freeze({host:url.hostname,port:5432,database:'postgres',user,password,
    ssl:Object.freeze({rejectUnauthorized:true as const,...(ca?{ca}:{})}),application_name:'ouchi-closure-progress'})});
 }catch{return null;}
}
