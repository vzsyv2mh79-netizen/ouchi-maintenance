import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const dataURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const deploymentURL=dataURL(compile('lib/ownerless-home-management-deployment.ts').replace("import 'server-only';",''));
const {ownerlessHomeManagementDeployment}=await import(deploymentURL);
const project='abcdefghijklmnopqrst';
const env={OUCHI_HOME_MANAGEMENT_ENABLED:'true',OUCHI_HOME_MANAGEMENT_DEPLOYMENT_APPROVED:'true',OUCHI_HOME_MANAGEMENT_PROJECT_REF:project,NEXT_PUBLIC_SUPABASE_URL:'https://'+project+'.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_only',OUCHI_HOME_MANAGEMENT_AUTH_CONFIG_READ_TOKEN:'synthetic',OUCHI_HOME_MANAGEMENT_DATABASE_URL:'postgres://ouchi_home_management_runtime:synthetic@db.'+project+'.supabase.co/postgres'};
test('incomplete deployment refuses without falling back to shared privileged credentials',()=>{
 assert.equal(ownerlessHomeManagementDeployment({}),null);
 for(const key of Object.keys(env)){const values={...env};delete values[key];assert.equal(ownerlessHomeManagementDeployment(values),null,key);}
 assert.equal(ownerlessHomeManagementDeployment({...env,OUCHI_HOME_MANAGEMENT_DATABASE_URL:undefined,DATABASE_URL:env.OUCHI_HOME_MANAGEMENT_DATABASE_URL,SUPABASE_SERVICE_ROLE_KEY:'synthetic'}),null);
 for(const flag of ['OUCHI_HOME_MANAGEMENT_ENABLED','OUCHI_HOME_MANAGEMENT_DEPLOYMENT_APPROVED'])assert.equal(ownerlessHomeManagementDeployment({...env,[flag]:'TRUE'}),null);
});
test('dedicated project-bound identity uses TLS and refuses privileged users, foreign origins and URL options',()=>{
 const result=ownerlessHomeManagementDeployment(env);assert.ok(result);assert.equal(result.database.ssl.rejectUnauthorized,true);assert.equal(result.database.user,'ouchi_home_management_runtime');assert.equal(Object.isFrozen(result.database),true);
 for(const url of [env.OUCHI_HOME_MANAGEMENT_DATABASE_URL.replace('ouchi_home_management_runtime','postgres'),env.OUCHI_HOME_MANAGEMENT_DATABASE_URL+'?sslmode=disable',env.OUCHI_HOME_MANAGEMENT_DATABASE_URL.replace(project,'zzzzzzzzzzzzzzzzzzzz'),env.OUCHI_HOME_MANAGEMENT_DATABASE_URL.replace('supabase.co/postgres','supabase.co:6543/postgres')])assert.equal(ownerlessHomeManagementDeployment({...env,OUCHI_HOME_MANAGEMENT_DATABASE_URL:url}),null);
 for(const url of ['https://example.invalid','http://ouchi-maintenance.vercel.app','https://ouchi-maintenance.vercel.app?debug=true','https://user:pass@ouchi-maintenance.vercel.app'])assert.equal(ownerlessHomeManagementDeployment({...env,OUCHI_HOME_MANAGEMENT_ORIGIN:url}),null);
});
test('actual route entry points return private unavailable response before acquiring runtime when disabled',async()=>{
 let code=compile('app/api/family/management/[homeID]/route.ts');
 code=code.replace("'@/lib/ownerless-home-management-deployment'",JSON.stringify(deploymentURL)).replace(/import \{ createOwnerlessHomeManagementRuntime \} from [^;]+;/,"const createOwnerlessHomeManagementRuntime=()=>{throw Error('Runtime must not be created');};");
 const {GET,POST}=await import(dataURL(code));
 const saved=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
 try{
  for(const key of Object.keys(env))delete process.env[key];
  for(const [method,handler] of [['GET',GET],['POST',POST]]){
   const result=await handler(new Request('https://ouchi-maintenance.vercel.app/api/family/management/44444444-4444-4444-8444-444444444444',{method}));
   assert.equal(result.status,503);assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual(await result.json(),{error:'Management is not available'});
  }
 }finally{for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
