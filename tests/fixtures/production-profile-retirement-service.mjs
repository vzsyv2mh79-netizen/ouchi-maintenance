/** Disposable full-chain PG/GoTrue/PostgREST validation with the observed
 * Supabase public default grants. Never provisions or connects to production. */
import assert from 'node:assert/strict';
import {Client} from 'pg';
import {verifyRetirementRpcHTTPServices} from './retirement-rpc-http-services.mjs';
assert.equal(process.env.OUCHI_PRODUCTION_PROFILE_SERVICE_TEST,'true');
const dbPort=Number(process.env.OUCHI_TEST_DB_PORT),authPort=Number(process.env.OUCHI_TEST_AUTH_PORT);
assert.ok([dbPort,authPort].every(p=>Number.isInteger(p)&&p>1024&&p<65536));
const config={host:'127.0.0.1',port:dbPort,user:'postgres',password:'synthetic-ci-only',database:'auth_test',query_timeout:5000};
const db=new Client(config);await db.connect();
try{
 await db.query("update maintenance_private.enrollment_policy set require_explicit=true;update maintenance_private.account_closure_review_policy set enabled=true;update maintenance_private.reviewed_retirement_policy set enabled=true,writer_coverage_verified=true,attachments_enabled=true");
 const role='ouchi_production_profile_ci',password='synthetic-profile-only';
 await db.query(`create role ${role} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${password}';grant ouchi_closure_operator to ${role}`);
 await db.query('insert into maintenance_private.closure_operator_principals values($1,true)',[role]);
 const connect=async()=>{
  const c=new Client({...config,user:role,password});await c.connect();
  return {query:async(sql,args)=>{const result=await c.query(sql,args);if(sql==='BEGIN')await c.query('set local role ouchi_closure_operator');return result;},abort(){void c.cancel?.();},close(){return c.end();}};
 };
 const result=await verifyRetirementRpcHTTPServices({db,connect,authPort,fetcher:fetch,privilegeProfile:'observed-production-20261017',accountContentReview:true});
 assert.equal(result.accountContentReviewVersion,1);
 assert.equal(result.directTableAudit.closedUnchanged,30);assert.equal(result.directTableAudit.activeChanged,26);assert.equal(result.directTableAudit.activePermissionRefused,3);assert.equal(result.directTableAudit.activeRlsNoop,1);
 console.log(JSON.stringify({status:'passed',...result,syntheticWriterPolicyAndReviewClassifications:true,fullCandidateSchemaPreloaded:true}));
}finally{await db.end();}
