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

test('additional model uses its own manual evidence and discovery never fabricates candidates', () => {
  const [candidate] = lookup.lookupModel('ki-rx100');
  assert.equal(candidate.suggestions.length, 3);
  for (const suggestion of candidate.suggestions) {
    assert.equal(suggestion.sourceKind, '取扱説明書');
    assert.equal(suggestion.intervalDays, 30);
    assert.ok(suggestion.sourceUrl.includes('kirx100_mn.pdf#page='));
  }
  assert.equal(lookup.lookupModel('KI-RX100-W').length, 0);
  assert.equal(lookup.officialSearchLinks('evil.example/?x').length, 0);
  assert.equal(lookup.officialSearchLinks(' ＫＩ－ＲＸ１００ ')[0].maker, 'SHARP');
  assert.ok(decodeURIComponent(lookup.officialSearchLinks('KI-RX100')[0].url).includes('site:jp.sharp "KI-RX100"'));
});

test('humidifiers and left/right washer variants use verified shared manuals without matching siblings', () => {
  for (const model of ['HV-T55','HV-T75','HV-R55','HV-R75']) {
    const [candidate] = lookup.lookupModel(model);
    assert.equal(candidate.categoryId, 'humidifier');
    assert.deepEqual(candidate.suggestions.map(item => item.intervalDays), [14,14,30]);
    assert.ok(candidate.manualUrl.includes(model.includes('-T') ? 'hvt55_75' : 'hvr55_75'));
    assert.ok(candidate.suggestions.every(item => item.sourceKind === '取扱説明書' && /#page=1[56]$/.test(item.sourceUrl)));
  }
  for (const model of ['NA-LX129CL','NA-LX129CR']) {
    const [candidate] = lookup.lookupModel(model);
    assert.equal(candidate.categoryId, 'washer');
    assert.deepEqual(candidate.suggestions.map(item => item.intervalDays), [7,30]);
    assert.ok(candidate.suggestions.every(item => item.sourceUrl.endsWith('#page=24')));
    assert.ok(candidate.lookupNote.includes('使用のたび'));
    assert.ok(candidate.suggestions[1].conditions.includes('予定日前'));
  }
  for (const model of ['HV-T50','HV-T75-W','HV-S50','NA-LX129DL','NA-LX129C','NA-LX129CL-W']) assert.equal(lookup.lookupModel(model).length,0);
  assert.equal(lookup.lookupModel(' ｈｖ－ｔ７５ ')[0].modelNumber,'HV-T75');
  assert.equal(new Set(lookup.supportedModels).size, lookup.supportedModels.length);
});

// These checks protect the evidence boundaries, including the range-to-date choice.
test('additional humidifier advice is limited to the manuals explicitly listing each model', () => {
  for (const [models, file] of [
    [['HV-S55','HV-S75'], 'hvs55_s75_mn.pdf'],
    [['HV-P55','HV-P75'], 'hvp55-hvp75_mn.pdf'],
  ]) {
    for (const model of models) {
      const [candidate] = lookup.lookupModel(model);
      assert.equal(candidate.manualUrl.split('/').at(-1), file);
      assert.deepEqual(candidate.suggestions.map(item => item.intervalDays), [14,14,30]);
      assert.ok(candidate.suggestions.every(item => item.sourceUrl.startsWith(candidate.manualUrl + '#page=')));
    }
  }
  for (const model of ['EE-DD35','EE-DD50']) {
    const [candidate] = lookup.lookupModel(model);
    assert.equal(candidate.maker, '象印');
    assert.equal(candidate.categoryId, 'humidifier');
    assert.deepEqual(candidate.suggestions.map(item => item.intervalDays), [30,365]);
    assert.ok(candidate.suggestions[0].frequency.includes('1〜2か月'));
    assert.ok(candidate.suggestions[0].frequency.includes('短い側の30日'));
    assert.ok(candidate.suggestions[1].conditions.includes('1年を待たず'));
    assert.ok(candidate.suggestions.every(item => item.sourceKind === '取扱説明書' && item.sourceUrl.endsWith('EEDD.pdf#page=10')));
  }
  for (const model of ['HV-S30','HV-P30','HV-P75-W','EE-DD5','EE-DD50-WA','EE-DE50','EE-DC50']) {
    assert.equal(lookup.lookupModel(model).length, 0);
  }
  assert.equal(lookup.lookupModel(' ｅｅ－ｄｄ５０ ')[0].modelNumber, 'EE-DD50');
  assert.equal(new Set(lookup.supportedModels).size, 14);
});
