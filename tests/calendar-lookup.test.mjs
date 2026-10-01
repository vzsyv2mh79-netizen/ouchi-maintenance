import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
async function importTypeScript(path) {
  const { outputText } = ts.transpileModule(readFileSync(path,'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const date = await importTypeScript('lib/date.ts');
const lookup = await importTypeScript('lib/product-lookup.ts');
test('Japan date rolls over at 15:00 UTC; calendar math handles leap years', () => {
  assert.equal(date.today(new Date('2026-09-30T14:59:59Z')), '2026-09-30');
  assert.equal(date.today(new Date('2026-09-30T15:00:00Z')), '2026-10-01');
  assert.equal(date.addDays('2024-02-28',1),'2024-02-29');
  assert.equal(date.addDays('2026-12-31',1),'2027-01-01');
  assert.equal(date.addDays('2026-10-01',-1),'2026-09-30');
});
test('normalized exact model matching preserves evidence; similar models never inherit advice', () => {
  const candidates = lookup.lookupModel(' ｋｉ－ｒｘ７５ ');
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].suggestions[0].sourceKind,'メーカー公式');
  assert.ok(candidates[0].suggestions[0].sourceUrl.startsWith('https://jp.sharp/'));
  assert.ok(candidates[0].suggestions[0].conditions.includes('2.5L'));
  assert.equal(lookup.lookupModel('KI-RX70').length,0);
  assert.equal(lookup.lookupModel('KI-RX75-W').length,0);
  assert.equal(lookup.lookupModel('').length,0);
});
