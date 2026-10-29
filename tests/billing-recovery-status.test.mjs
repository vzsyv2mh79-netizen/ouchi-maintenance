import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/billing-recovery-status.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {normalizeRecoveryStatus:normalize}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('status is scoped progress without purchase rights or sensitive extra fields',()=>{
 for(const state of ['none','queued','running','complete','failed','cancelled'])assert.deepEqual(normalize({state,environment:'Sandbox',leaseToken:'private',plan:'premium'},'Sandbox'),{state,environment:'Sandbox'});
 for(const value of [null,{},[],{state:'premium',environment:'Sandbox'},{state:'complete',environment:'Production'}])assert.throws(()=>normalize(value,'Sandbox'));
});
