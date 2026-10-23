import assert from 'node:assert/strict';
import {Client} from 'pg';
/** Compile-time fixture alias only, never imported by the shipping application.
 * Actual restricted PostgreSQL driver, with a disposable local endpoint instead
 * of production TLS. This does not prove live TLS or deployed role provisioning.
 */
export function createPostgresClient(config){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');
 assert.equal(config.host,'db.abcdefghijklmnopqrst.supabase.co');
 assert.equal(config.database,'postgres');assert.equal(config.user,'ouchi_closure_review_runtime');assert.equal(config.password,'synthetic-runtime-only');
 assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.connectionTimeoutMillis,3000);assert.equal(config.query_timeout,5000);
 return new Client({host:'127.0.0.1',port:54323,user:'ouchi_closure_review_ci_login',password:'synthetic-private-review-ci-only',database:'auth_test',application_name:'ouchi-runtime-route-ci',connectionTimeoutMillis:config.connectionTimeoutMillis,query_timeout:config.query_timeout});
}
