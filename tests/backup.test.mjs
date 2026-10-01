import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync('lib/backup.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { encodeBackup, decodeBackup } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const data = { homes:[{id:'h',name:'わが家',kind:'home'}], products:[{id:'p',homeId:'h',categoryId:'aircon',maker:'',name:'エアコン',modelNumber:''}], tasks:[{id:'t',productId:'p',name:'掃除',kind:'掃除',intervalDays:30,nextDueAt:'2026-10-01',sourceKind:'ユーザー設定'}], history:[{id:'a',taskId:'t',productId:'p',completedAt:'2026-09-01'}] };
test('backup round trip retains records and ignores extraneous fields', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(decodeBackup(encodeBackup(data)))), data);
});
test('invalid backup never becomes restore data', () => {
  const invalid = (modify) => { const copy = structuredClone(data); modify(copy); return JSON.stringify({app:'ouchi-maintenance',version:1,data:copy}); };
  assert.throws(() => decodeBackup(invalid(d => d.tasks[0].nextDueAt='2026-02-30')));
  assert.throws(() => decodeBackup(invalid(d => d.history[0].productId='other')));
  assert.throws(() => decodeBackup(invalid(d => d.products.push(d.products[0]))));
  assert.throws(() => decodeBackup(invalid(d => d.tasks[0].intervalDays=4000)));
  assert.throws(() => decodeBackup(invalid(d => d.tasks[0].sourceKind='メーカー公式')));
  assert.throws(() => decodeBackup('{"version":99}'));
});
