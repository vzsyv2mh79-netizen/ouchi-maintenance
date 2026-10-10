import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';
const source=ts.transpileModule(readFileSync('lib/verified-app-session.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {sessionAfterAuthVerification}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const user='abcdef01-abcd-4abc-8abc-abcdefabcdef',session='22222222-2222-4222-8222-222222222222',now=new Date('2026-10-10T00:00:00Z');
// Intentionally unsigned synthetic fixtures. These tests cover extraction AFTER
// a mocked server verification boundary, not JWT signature/authentication validity.
const token=claims=>'e30.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.c3ludGhldGlj';
const good={sub:user,session_id:session,exp:now.getTime()/1000+60};
test('verified subject and signed top-level session are mandatory',()=>{
 assert.deepEqual(sessionAfterAuthVerification(token(good),user.toUpperCase(),now),{userID:user,sessionID:session});
 for(const claims of [{...good,sub:session},{...good,session_id:null},{...good,session_id:'00000000-0000-0000-0000-000000000000'},{...good,session_id:'malformed'},{sub:user,exp:good.exp,user_metadata:{session_id:session}},[],null,{...good,exp:String(good.exp)},{...good,exp:now.getTime()/1000}])assert.equal(sessionAfterAuthVerification(token(claims),user,now),null);
});
test('malformed, oversized and noncanonical payloads fail closed',()=>{
 for(const value of ['',token(good)+'.extra','x'.repeat(16385),'e30.____.signature','e30.Ww.signature','e30.e30=.signature'])assert.equal(sessionAfterAuthVerification(value,user,now),null);
 assert.equal(sessionAfterAuthVerification(token(good),user,new Date('invalid')),null);
 assert.equal(sessionAfterAuthVerification(token(good),'a'.repeat(36),now),null);
});
