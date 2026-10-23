import 'server-only';
type Environment=Readonly<Record<string,string|undefined>>;
/** Inert parser: never reuse generic DB/service credentials or enable a policy.
 * A separate reviewed role/identity-query contract must be provisioned first.
 */
export function ownerlessHomeManagementDeployment(env:Environment){
 if(env.OUCHI_HOME_MANAGEMENT_ENABLED!=='true'||env.OUCHI_HOME_MANAGEMENT_DEPLOYMENT_APPROVED!=='true')return null;
 const projectID=env.OUCHI_HOME_MANAGEMENT_PROJECT_REF,publishableKey=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,accessToken=env.OUCHI_HOME_MANAGEMENT_AUTH_CONFIG_READ_TOKEN;
 if(!projectID||!/^[a-z]{20}$/.test(projectID)||!publishableKey||!/^sb_publishable_[A-Za-z0-9_-]{1,2000}$/.test(publishableKey)||!accessToken||accessToken.length>20000||/\s/.test(accessToken))return null;
 const authURL='https://'+projectID+'.supabase.co';
 if(env.NEXT_PUBLIC_SUPABASE_URL!==authURL&&env.NEXT_PUBLIC_SUPABASE_URL!==authURL+'/')return null;
 try{
  const originURL=new URL(env.OUCHI_HOME_MANAGEMENT_ORIGIN??'https://ouchi-maintenance.vercel.app');
  if(originURL.protocol!=='https:'||originURL.username||originURL.password||originURL.port||originURL.search||originURL.hash||originURL.pathname!=='/'
   ||!/^ouchi-maintenance(?:-[a-z0-9-]+)?\.vercel\.app$/.test(originURL.hostname))return null;
  const url=new URL(env.OUCHI_HOME_MANAGEMENT_DATABASE_URL??'');
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash||url.pathname!=='/postgres'||(url.port&&url.port!=='5432'))return null;
  const user=decodeURIComponent(url.username),password=decodeURIComponent(url.password),role='ouchi_home_management_runtime';
  const direct=url.hostname==='db.'+projectID+'.supabase.co'&&user===role;
  const pooled=/^aws-\d+-[a-z]+-[a-z]+-\d+\.pooler\.supabase\.com$/.test(url.hostname)&&user===role+'.'+projectID;
  if((!direct&&!pooled)||!password||password.length>2000)return null;
  const ca=env.OUCHI_HOME_MANAGEMENT_DATABASE_CA;
  if(ca!==undefined&&(ca.length>65536||!ca.startsWith('-----BEGIN CERTIFICATE-----')||!ca.trimEnd().endsWith('-----END CERTIFICATE-----')))return null;
  return Object.freeze({projectID,authURL,publishableKey,accessToken,role,origin:originURL.origin,
   database:Object.freeze({host:url.hostname,port:5432,database:'postgres',user,password,
    ssl:Object.freeze({rejectUnauthorized:true as const,...(ca?{ca}:{})}),application_name:'ouchi-home-management'})});
 }catch{return null;}
}
