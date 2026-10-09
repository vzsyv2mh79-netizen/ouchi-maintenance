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
  for (const model of ['HV-T50','HV-T75-W','HV-S50','NA-LX129DLA','NA-LX129C','NA-LX129CL-W']) assert.equal(lookup.lookupModel(model).length,0);
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
  for (const model of ['HV-S30','HV-P30','HV-P75-W','EE-DD5','EE-DD50-WA','EE-DE51','EE-DC50']) {
    assert.equal(lookup.lookupModel(model).length, 0);
  }
  assert.equal(lookup.lookupModel(' ｅｅ－ｄｄ５０ ')[0].modelNumber, 'EE-DD50');
  assert.equal(new Set(lookup.supportedModels).size, lookup.supportedModels.length);
});

test('2024–2026 steam humidifiers retain their own release evidence and revised PDF page mapping', () => {
  for (const [family, year] of [['DE',2024],['DF',2025],['DG',2026],['RT',2024],['RU',2025],['RV',2026]]) {
    for (const capacity of [35,50]) {
      const [candidate] = lookup.lookupModel(`EE-${family}${capacity}`);
      assert.equal(candidate.releaseYear, year);
      assert.ok(candidate.releaseSourceUrl.includes(`ee${family.toLowerCase()}35-ee${family.toLowerCase()}50`));
      assert.ok(candidate.manualUrl.endsWith(`EE${family}.pdf`));
      assert.deepEqual(candidate.suggestions.map(item => item.intervalDays), [30,365]);
      assert.ok(candidate.suggestions[0].sourceUrl.endsWith(`#page=10`));
      assert.ok(candidate.suggestions[1].sourceUrl.endsWith(`#page=11`));
      assert.ok(candidate.suggestions[0].frequency.includes('1〜2か月'));
      assert.ok(candidate.suggestions[1].conditions.includes('印刷20ページ'));
    }
  }
  // The older DD manual has the gasket on PDF10; do not overwrite its evidence.
  assert.ok(lookup.lookupModel('EE-DD50')[0].suggestions[1].sourceUrl.endsWith('#page=10'));
  for (const model of ['EE-DG5','EE-DG50-WA','EE-DG60','EE-RV30','EE-DE50DS']) assert.equal(lookup.lookupModel(model).length,0);
  assert.equal(lookup.lookupModel(' ｅｅ－ｄｇ５０ ')[0].releaseYear,2026);
});

test('TX100/TX75 use their 2024 shared manual without inventing usage-based schedules', () => {
  for (const model of ['KI-TX100','KI-TX75']) {
    const [candidate] = lookup.lookupModel(model);
    assert.equal(candidate.releaseYear,2024);
    assert.ok(candidate.releaseSourceUrl.endsWith('240903-a.html'));
    assert.ok(candidate.manualUrl.endsWith('kitx100_tx75_mn.pdf'));
    assert.deepEqual(candidate.suggestions.map(item => item.intervalDays),[30,30,30]);
    assert.deepEqual(candidate.suggestions.map(item => item.sourceUrl.split('#').at(-1)),['page=24','page=24','page=26']);
    assert.ok(candidate.lookupNote.includes('給水のたび'));
    assert.ok(candidate.suggestions[1].conditions.includes('予定前'));
    assert.ok(candidate.suggestions[2].conditions.includes('水洗い・天日干ししない'));
  }
  for (const model of ['KI-TX60','KI-TX100-H','KI-UX60']) assert.equal(lookup.lookupModel(model).length,0);
});

test('2025 UX variants use their own manual rather than inheriting TX advice', () => {
  for (const model of ['KI-UX100','KI-UX75']) {
    const [candidate] = lookup.lookupModel(model);
    assert.equal(candidate.releaseYear,2025);
    assert.ok(candidate.releaseSourceUrl.endsWith('/lineup/'));
    assert.ok(candidate.manualUrl.includes('kiux100-ux75_mn.pdf'));
    assert.ok(candidate.lookupNote.includes('2025年度'));
    assert.deepEqual(candidate.suggestions.map(item => item.intervalDays),[30,30,30]);
    assert.deepEqual(candidate.suggestions.map(item => item.sourceUrl.split('#').at(-1)),['page=24','page=24','page=26']);
    assert.ok(candidate.suggestions.every(item => item.sourceUrl.startsWith(candidate.manualUrl+'#')));
    assert.ok(candidate.suggestions[1].conditions.includes('予定前'));
  }
  for (const model of ['KI-UX60','KI-UX100-H','KI-WX90']) assert.equal(lookup.lookupModel(model).length,0);
});

test('2024 washer D variants use the D manual and weekly drain-filter evidence', () => {
  for (const model of ['NA-LX129DL','NA-LX129DR']) {
    const [candidate] = lookup.lookupModel(model);
    assert.equal(candidate.releaseYear,2024);
    assert.ok(candidate.manualUrl.endsWith('NA-LX129D-.pdf'));
    assert.deepEqual(candidate.suggestions.map(item=>item.intervalDays),[7,30,7]);
    assert.deepEqual(candidate.suggestions.map(item=>item.sourceUrl.split('#').at(-1)),['page=24','page=24','page=25']);
    assert.ok(candidate.suggestions[2].conditions.includes('ブザー'));
    assert.ok(candidate.lookupNote.includes('使用のたび'));
  }
  for (const model of ['NA-LX127DL','NA-LX129GL','NA-LX129DL-W']) assert.equal(lookup.lookupModel(model).length,0);
});

test('2025 washers cite the main manual and separate care guide for each task', () => {
 for (const model of ['NA-LX129EL','NA-LX129ER']) {
  const [c]=lookup.lookupModel(model);
  assert.equal(c.releaseYear,2025);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,7,90]);
  assert.ok(c.suggestions.slice(0,2).every(x=>x.sourceUrl.endsWith('NA-LX129E.pdf#page=19')));
  assert.ok(c.suggestions[2].sourceUrl.includes('3642461') && c.suggestions[2].sourceUrl.endsWith('#page=7'));
  assert.ok(c.suggestions[3].sourceUrl.includes('3642461') && c.suggestions[3].sourceUrl.endsWith('#page=5'));
  assert.ok(c.suggestions[3].conditions.includes('1か月以上'));
 }
 for (const m of ['NA-LX127EL','NA-LX129GL','NA-LX129ER-W']) assert.equal(lookup.lookupModel(m).length,0);
});


test('2026 washers retain F-specific filter schedules and do not inherit E tank intervals', () => {
 for (const model of ['NA-LX129FL','NA-LX129FR']) {
  const [c]=lookup.lookupModel(model);
  assert.equal(c.releaseYear,2026);
  assert.ok(c.releaseSourceUrl.endsWith('jn260820-1'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,7,7]);
  assert.ok(c.suggestions.slice(0,2).every(x=>x.sourceUrl.endsWith('NA-LX129F.pdf#page=19')));
  assert.ok(c.suggestions[2].sourceUrl.includes('4498753') && c.suggestions[2].sourceUrl.endsWith('#page=6'));
  assert.ok(c.suggestions[3].sourceUrl.includes('4498753') && c.suggestions[3].sourceUrl.endsWith('#page=7'));
  assert.ok(c.suggestions[3].name.includes('サブフィルター'));
  assert.ok(!c.suggestions.some(x=>x.name.includes('タンク')));
  assert.ok(c.lookupNote.includes('乾燥のたび') && c.lookupNote.includes('種類変更時'));
 }
 assert.equal(lookup.lookupModel('NA-LX129ER')[0].suggestions.at(-1).intervalDays,90);
 for(const m of ['NA-LX127FL','NA-LX129GL','NA-LX129FR-W']) assert.equal(lookup.lookupModel(m).length,0);
});


test('new Sharp variants cite the care route explicitly linked by each official model page', () => {
 for (const [model,year,large] of [['KI-TX70',2024,false],['KI-UX70',2025,false],['KI-WX70',2026,false],['KI-WX75',2026,true],['KI-WX100',2026,true]]) {
  const [c]=lookup.lookupModel(model);
  assert.equal(c.releaseYear,year);
  assert.equal(c.releaseSourceUrl,`https://cs.sharp.co.jp/select/contents?productId=${model}`);
  assert.ok(c.lookupNote.includes('機種別の公式お手入れ案内'));
  assert.equal(c.discoveredManualUrl,undefined);
  assert.equal(c.suggestions.length,large?4:3);
  assert.ok(c.suggestions.every(x=>x.intervalDays===30 && x.sourceKind==='メーカー公式' && x.sourceUrl.endsWith('.html')));
  assert.ok(c.suggestions[1].sourceUrl.endsWith(large?'filter_humi_care06.html':'filter_humi_care03.html'));
  assert.ok(c.lookupNote.includes('給水のたび'));
  assert.ok(!c.suggestions.some(x=>x.name.includes('タンク') || x.name.includes('集じん')));
 }
 for(const model of ['KI-TX60','KI-UX60','KI-WX90','KI-WX70-W']) assert.equal(lookup.lookupModel(model).length,0);
 assert.equal(lookup.lookupModel('ＫＩ－ＷＸ７０')[0].releaseYear,2026);
 assert.ok(lookup.lookupModel('KI-UX75')[0].suggestions.every(x=>x.sourceKind==='取扱説明書'));
});


test('S50 variants retain their independent yearly humidifier and sensor evidence', () => {
 for(const [model,year,hum,sensor] of [['KI-TS50',2024,'01','01'],['KI-US50',2025,'07','06'],['KI-WS50',2026,'07','06']]) {
  const [c]=lookup.lookupModel(model);
  assert.equal(c.releaseYear,year);
  assert.equal(c.releaseSourceUrl,`https://cs.sharp.co.jp/select/contents?productId=${model}`);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,30,30,30]);
  assert.ok(c.suggestions.every(x=>x.sourceKind==='メーカー公式'));
  assert.ok(c.suggestions[1].sourceUrl.endsWith(`filter_humi_care${hum}.html`));
  assert.ok(c.suggestions[2].sourceUrl.endsWith(`sensor_care${sensor}.html`));
  assert.ok(c.suggestions[3].sourceUrl.endsWith('panel_care01.html'));
  assert.ok(c.lookupNote.includes('給水のたび'));
  assert.equal(c.discoveredManualUrl,undefined);
 }
 for(const model of ['KI-US40','KI-WS60','KI-TS50-W']) assert.equal(lookup.lookupModel(model).length,0);
});
