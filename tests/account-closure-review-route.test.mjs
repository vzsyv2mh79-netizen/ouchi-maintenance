import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const dataURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const configURL=dataURL(compile('lib/account-closure-review-deployment.ts').replace("import 'server-only';",''));
let acquisitions=0,received;
globalThis.__ouchiReviewRouteFactory=config=>{acquisitions++;assert.equal(config.database.ssl.rejectUnauthorized,true);return async(request,action)=>{received={request,action};return Response.json({state:'synthetic-only'},{headers:{'Cache-Control':'no-store'}});};};
let code=compile('app/api/account/closure-review/[action]/route.ts');
code=code.replace("'@/lib/account-closure-review-deployment'",JSON.stringify(configURL)).replace(/import \{ createAccountClosureReviewRuntime \} from [^;]+;/,'const createAccountClosureReviewRuntime=config=>globalThis.__ouchiReviewRouteFactory(config);');
const {POST}=await import(dataURL(code));
const keys=['OUCHI_ACCOUNT_REVIEW_ENABLED','OUCHI_ACCOUNT_REVIEW_DEPLOYMENT_APPROVED','OUCHI_ACCOUNT_REVIEW_PROJECT_REF','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','OUCHI_ACCOUNT_REVIEW_AUTH_CONFIG_READ_TOKEN','OUCHI_ACCOUNT_REVIEW_DATABASE_URL'];
async function environment(values,work){const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));try{for(const key of keys)if(values[key]===undefined)delete process.env[key];else process.env[key]=values[key];return await work();}finally{for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
const project='abcdefghijklmnopqrst',env={OUCHI_ACCOUNT_REVIEW_ENABLED:'true',OUCHI_ACCOUNT_REVIEW_DEPLOYMENT_APPROVED:'true',OUCHI_ACCOUNT_REVIEW_PROJECT_REF:project,NEXT_PUBLIC_SUPABASE_URL:'https://'+project+'.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',OUCHI_ACCOUNT_REVIEW_AUTH_CONFIG_READ_TOKEN:'synthetic',OUCHI_ACCOUNT_REVIEW_DATABASE_URL:'postgres://ouchi_closure_review_runtime:synthetic@db.'+project+'.supabase.co/postgres'};
test('registered route refuses disabled/incomplete deployment before runtime acquisition',async()=>{
 for(const values of [{},{OUCHI_ACCOUNT_REVIEW_ENABLED:'true'}, {...env,OUCHI_ACCOUNT_REVIEW_DEPLOYMENT_APPROVED:'false'}])await environment(values,async()=>{
  const response=await POST(new Request('https://example.invalid/api/account/closure-review/request',{method:'POST'}),{params:Promise.resolve({action:'request'})});
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
 });assert.equal(acquisitions,0);
});
test('route preserves original request and action, rejects unknown actions and sanitizes setup failure',async()=>{
 await environment(env,async()=>{
  const request=new Request('https://example.invalid/api/account/closure-review/read',{method:'POST',body:'synthetic'});
  assert.equal((await POST(request,{params:Promise.resolve({action:'read'})})).status,200);assert.equal(received.request,request);assert.equal(received.action,'read');
  const before=acquisitions;assert.equal((await POST(request,{params:Promise.resolve({action:'delete'})})).status,405);assert.equal(acquisitions,before);
  globalThis.__ouchiReviewRouteFactory=()=>{throw Error('synthetic secret must never be reflected');};
  const response=await POST(request,{params:Promise.resolve({action:'request'})});assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.doesNotMatch(await response.text(),/synthetic secret/);
 });
 delete globalThis.__ouchiReviewRouteFactory;
});
