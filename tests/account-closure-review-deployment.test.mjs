import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/account-closure-review-deployment.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("import 'server-only';",'');
const {accountClosureReviewDeployment}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const project='abcdefghijklmnopqrst';
const env={OUCHI_ACCOUNT_REVIEW_ENABLED:'true',OUCHI_ACCOUNT_REVIEW_DEPLOYMENT_APPROVED:'true',OUCHI_ACCOUNT_REVIEW_PROJECT_REF:project,NEXT_PUBLIC_SUPABASE_URL:'https://'+project+'.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_only',OUCHI_ACCOUNT_REVIEW_AUTH_CONFIG_READ_TOKEN:'synthetic_read_token',OUCHI_ACCOUNT_REVIEW_DATABASE_URL:'postgresql://ouchi_closure_review_runtime:synthetic-password@db.'+project+'.supabase.co:5432/postgres'};
test('disabled or incomplete configuration has no credential fallback',()=>{
 assert.equal(accountClosureReviewDeployment({}),null);
 for(const key of Object.keys(env)){const input={...env};delete input[key];assert.equal(accountClosureReviewDeployment(input),null,key);}
 for(const key of ['OUCHI_ACCOUNT_REVIEW_ENABLED','OUCHI_ACCOUNT_REVIEW_DEPLOYMENT_APPROVED'])assert.equal(accountClosureReviewDeployment({...env,[key]:'TRUE'}),null);
 assert.equal(accountClosureReviewDeployment({...env,OUCHI_ACCOUNT_REVIEW_DATABASE_URL:undefined,DATABASE_URL:env.OUCHI_ACCOUNT_REVIEW_DATABASE_URL,SUPABASE_SERVICE_ROLE_KEY:'synthetic'}),null);
});
test('explicit project-bound dedicated login captures TLS fields without URL options',()=>{
 const input={...env},result=accountClosureReviewDeployment(input);assert.ok(result);
 assert.equal(result.database.host,'db.'+project+'.supabase.co');assert.equal(result.database.ssl.rejectUnauthorized,true);assert.equal(result.database.user,'ouchi_closure_review_runtime');
 input.OUCHI_ACCOUNT_REVIEW_DATABASE_URL='changed';assert.equal(result.database.password,'synthetic-password');assert.equal(Object.isFrozen(result.database),true);assert.equal(Object.isFrozen(result.database.ssl),true);
 const pool=accountClosureReviewDeployment({...env,OUCHI_ACCOUNT_REVIEW_DATABASE_URL:'postgres://ouchi_closure_review_runtime.'+project+':synthetic@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'});assert.ok(pool);assert.equal(pool.database.port,5432);
});
test('privileged roles, foreign projects, transaction pooling and TLS overrides are refused',()=>{
 const urls=[
  'postgres://postgres:synthetic@db.'+project+'.supabase.co/postgres',
  'postgres://ouchi_closure_review_runtime:synthetic@db.zzzzzzzzzzzzzzzzzzzz.supabase.co/postgres',
  env.OUCHI_ACCOUNT_REVIEW_DATABASE_URL+'?sslmode=disable',env.OUCHI_ACCOUNT_REVIEW_DATABASE_URL+'#options',
  'postgres://ouchi_closure_review_runtime.'+project+':synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',
  'postgres://ouchi_closure_review_runtime.zzzzzzzzzzzzzzzzzzzz:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  'postgres://ouchi_closure_review_runtime:synthetic@127.0.0.1:5432/postgres',
 ];
 for(const url of urls)assert.equal(accountClosureReviewDeployment({...env,OUCHI_ACCOUNT_REVIEW_DATABASE_URL:url}),null);
 assert.equal(accountClosureReviewDeployment({...env,NEXT_PUBLIC_SUPABASE_URL:'https://foreign.invalid'}),null);
 assert.equal(accountClosureReviewDeployment({...env,OUCHI_ACCOUNT_REVIEW_DATABASE_CA:'untrusted certificate'}),null);
});
