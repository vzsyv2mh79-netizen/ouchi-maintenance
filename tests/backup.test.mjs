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
test('export and restore apply the same UTF-8 file limit to Japanese records', () => {
  const large = structuredClone(data);
  large.products = Array.from({length: 400}, (_, i) => ({...data.products[0], id:`p${i}`, memo:'家'.repeat(10000)}));
  large.tasks = [];
  large.history = [];
  const raw = JSON.stringify({app:'ouchi-maintenance',version:1,data:large});
  assert.ok(raw.length < 10 * 1024 * 1024);
  assert.ok(Buffer.byteLength(raw) > 10 * 1024 * 1024);
  assert.throws(() => encodeBackup(large), /10MB/);
  assert.throws(() => decodeBackup(raw), /10MB/);
  large.products = large.products.slice(0, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(decodeBackup(encodeBackup(large)))), large);
});
