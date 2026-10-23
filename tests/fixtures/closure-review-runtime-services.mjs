import assert from 'node:assert/strict';
import {verifyDisposableClosureReviewHTTP} from './closure-review-http.mjs';
/** Registered POST -> real SDK runtime -> actual disposable GoTrue/private SQL.
 * Only Auth host/DB transport are aliased locally; Management config is an
 * explicit fixture. No production TLS, credential, policy or grant is claimed.
 */
export async function verifyDisposableClosureReviewRuntime({POST,...options}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(options.origin,'http://127.0.0.1:54321');
 const project='abcdefghijklmnopqrst',auth='https://'+project+'.supabase.co',management='https://api.supabase.com/v1/projects/'+project+'/config/auth';
 const values={OUCHI_ACCOUNT_REVIEW_ENABLED:'true',OUCHI_ACCOUNT_REVIEW_DEPLOYMENT_APPROVED:'true',OUCHI_ACCOUNT_REVIEW_PROJECT_REF:project,NEXT_PUBLIC_SUPABASE_URL:auth,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_runtime_fixture',OUCHI_ACCOUNT_REVIEW_AUTH_CONFIG_READ_TOKEN:'synthetic-config-read-only',OUCHI_ACCOUNT_REVIEW_DATABASE_URL:'postgres://ouchi_closure_review_runtime:synthetic-runtime-only@db.'+project+'.supabase.co:5432/postgres',OUCHI_ACCOUNT_REVIEW_DATABASE_CA:undefined};
 const saved=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]])),originalFetch=globalThis.fetch;
 let authReads=0,configReads=0,passwordGrants=0,markedGrants=0;
 try{
  for(const [key,value] of Object.entries(values))if(value===undefined)delete process.env[key];else process.env[key]=value;
  globalThis.fetch=async(input,init)=>{
   const target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
   if(target.href===management){
    configReads++;assert.equal(init.method,'GET');assert.equal(new Headers(init.headers).get('authorization'),'Bearer synthetic-config-read-only');assert.equal(init.redirect,'error');
    return Response.json({sessions_timebox:null,sessions_inactivity_timeout:null,sessions_single_per_user:false,mfa_totp_verify_enabled:true,mfa_phone_verify_enabled:false,mfa_web_authn_verify_enabled:false});
   }
   if(target.origin===auth){
    assert.ok(target.pathname.startsWith('/auth/v1/'));assert.equal(init.redirect,'error');
    if(target.pathname==='/auth/v1/user')authReads++;
    if(target.pathname==='/auth/v1/token'){
     passwordGrants++;assert.match(new Headers(init.headers).get('user-agent'),/^OuchiMaintenance\/closure-reauth\/v1\/[0-9a-f-]{36}$/);markedGrants++;
    }
    return originalFetch(options.origin+target.pathname+target.search,init);
   }
   // Existing loopback HTTP witness/data services only; never fall through to
   // a live external host if the runtime changes its endpoint unexpectedly.
   assert.equal(target.hostname,'127.0.0.1');assert.equal(target.protocol,'http:');
   return originalFetch(input,init);
  };
  await verifyDisposableClosureReviewHTTP({...options,handlerFactory:()=>
   (request,action)=>POST(request,{params:Promise.resolve({action})})});
  assert.ok(authReads>0);assert.ok(configReads>0);assert.ok(passwordGrants>=2);assert.equal(markedGrants,passwordGrants);
  console.log('closure-review registered POST runtime: real SDK exact-bearer reads and owned marker password grants, actual private PostgreSQL request/read/cancel, lost HTTP acknowledgement reconciliation, temporary sessions removed and original Auth retained; explicit local transport/Management fixtures, no live TLS or whole-account completion');
 }finally{
  globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
}
