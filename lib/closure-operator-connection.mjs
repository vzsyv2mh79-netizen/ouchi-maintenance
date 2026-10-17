import {createDedicatedPostgresConnection} from './dedicated-postgres-connection.mjs';

const purposes=Object.freeze({inspection:Object.freeze({principal:'ouchi_closure_inspection_runtime',role:'ouchi_closure_inspector'}),decision:Object.freeze({principal:'ouchi_closure_decision_runtime',role:'ouchi_closure_operator'}),'file-cleanup':Object.freeze({principal:'ouchi_retirement_file_runtime',role:'ouchi_retirement_file_executor'})});
export function privateOperatorConfig(raw,expectedProject,purpose){
 try{
  if(!Object.hasOwn(purposes,purpose))return null;
  const {principal,role}=purposes[purpose];
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!/^[a-z]{20}$/.test(expectedProject)
   ||Object.keys(raw).some(key=>!['projectRef','databaseURL','ca'].includes(key))||raw.projectRef!==expectedProject||typeof raw.databaseURL!=='string')return null;
  const url=new URL(raw.databaseURL);
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash||url.pathname!=='/postgres'||(url.port&&url.port!=='5432'))return null;
  const user=decodeURIComponent(url.username),password=decodeURIComponent(url.password);
  const direct=url.hostname==='db.'+expectedProject+'.supabase.co'&&user===principal;
  const pooled=/^aws-\d+-[a-z]+-[a-z]+-\d+\.pooler\.supabase\.com$/.test(url.hostname)&&user===principal+'.'+expectedProject;
  if((!direct&&!pooled)||!password||password.length>2000)return null;
  if(raw.ca!==undefined&&(typeof raw.ca!=='string'||raw.ca.length>65536||!raw.ca.startsWith('-----BEGIN CERTIFICATE-----')||!raw.ca.trimEnd().endsWith('-----END CERTIFICATE-----')))return null;
  return Object.freeze({principal,role,database:Object.freeze({host:url.hostname,port:5432,user,password,database:'postgres',
   ssl:Object.freeze({rejectUnauthorized:true,...(raw.ca?{ca:raw.ca}:{})}),application_name:'ouchi-operator-'+purpose})});
 }catch{return null;}
}

/** Never discover an admin/service credential or relax certificate validation. */
export function createPrivateOperatorConnection({rawConfig,expectedProject,createClient,purpose}){
 const config=privateOperatorConfig(rawConfig,expectedProject,purpose);
 if(!config||typeof createClient!=='function')throw Error('Private operator configuration required');
 const acquire=createDedicatedPostgresConnection({createClient:bounds=>createClient({...config.database,...bounds})});
 return async options=>{
  const connection=await acquire(options);
  try{
   const result=await connection.query('select session_user::text as principal,current_database()::text as database');
   if(result?.rows?.length!==1||result.rows[0].principal!==config.principal||result.rows[0].database!=='postgres')throw Error('Private operator principal unavailable');
   return Object.freeze({...connection,query:async(sql,args)=>{
    const result=await connection.query(sql,args);
    if(sql==='BEGIN'||sql==='BEGIN READ ONLY')await connection.query('SET LOCAL ROLE '+config.role);
    return result;
   }});
  }catch(error){await connection.close();throw error;}
 };
}

