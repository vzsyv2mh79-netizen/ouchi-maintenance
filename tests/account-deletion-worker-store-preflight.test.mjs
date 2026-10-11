import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/account-deletion-worker-store.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import \{ eraseAccountDeletionObjects \} from [^;]+;/,"const eraseAccountDeletionObjects=()=>{throw Error('must not erase');};");
const {storedDeletionDependencies}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('stored adapter rejects missing finalization before database access',()=>{
 let calls=0;const db={rpc:()=>{calls++;throw Error('must not query');}};
 for(const missing of ['eraseNativeDevices','finalizeIdentityAndRetention','markComplete']){
  const tail={eraseNativeDevices:async()=>true,finalizeIdentityAndRetention:async()=>true,markComplete:async()=>true};delete tail[missing];
  assert.throws(()=>storedDeletionDependencies(db,tail),/not configured/);
 }
 assert.throws(()=>storedDeletionDependencies(db,null),/not configured/);
 assert.equal(calls,0);
});
