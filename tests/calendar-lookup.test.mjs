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
  assert.ok(lookup.supportedModels.includes(model));
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


test('D50 variants cite the explicit dehumidifier care route and retain both trays', () => {
 for(const [model,year] of [['KI-SD50',2024],['KI-TD50',2025],['KI-UD50',2026]]) {
  const [c]=lookup.lookupModel(model);
  assert.equal(c.releaseYear,year);
  assert.equal(c.name,'除加湿空気清浄機');
  assert.equal(c.releaseSourceUrl,`https://cs.sharp.co.jp/select/contents?productId=${model}`);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,30,30,30]);
  assert.ok(c.suggestions.every(x=>x.sourceKind==='メーカー公式'));
  assert.ok(c.suggestions[1].sourceUrl.endsWith('kild50/filter_humi_care_kild50.html'));
  assert.ok(c.suggestions[1].conditions.includes('上段') && c.suggestions[1].conditions.includes('下段'));
  assert.ok(c.suggestions[2].sourceUrl.endsWith('sensor_care04.html'));
  assert.ok(c.suggestions[3].sourceUrl.endsWith('panel_care02.html'));
  assert.ok(c.lookupNote.includes('一体型') && c.lookupNote.includes('水洗い・天日干ししない'));
  assert.equal(c.discoveredManualUrl,undefined);
 }
 for(const model of ['KI-VD50','KI-UD70','KI-UD50-W']) assert.equal(lookup.lookupModel(model).length,0);
 assert.ok(lookup.lookupModel('KI-US50')[0].suggestions[1].sourceUrl.endsWith('filter_humi_care07.html'));
});

test('NX500K keeps monthly bag inspection separate from conditional replacement and washing', () => {
  const [c] = lookup.lookupModel('ｍｃ－ｎｘ５００ｋ');
  assert.equal(c.releaseYear, 2025);
  assert.equal(c.categoryId, 'vacuum');
  assert.equal(c.suggestions.length, 1);
  const t = c.suggestions[0];
  assert.equal(t.kind, '点検');
  assert.equal(t.intervalDays, 30);
  assert.equal(t.sourceKind, '取扱説明書');
  assert.ok(t.sourceUrl.endsWith('MC-NX500K.pdf#page=9'));
  assert.match(t.conditions, /月ごとの一律交換ではありません/);
  assert.match(t.conditions, /約2秒間隔/);
  assert.match(c.lookupNote, /点灯は保護装置/);
  assert.match(c.lookupNote, /床用ノズル全体は水洗い不可/);
  assert.match(c.lookupNote, /AMC-U2/);
  assert.notEqual(lookup.lookupModel('MC-NX700K')[0].manualUrl, c.manualUrl);
  assert.equal(lookup.lookupModel('MC-NX500K-A').length, 0);
});

test('TZ500 keeps dedicated dishwasher schedules and detergent modes distinct', () => {
  const [c] = lookup.lookupModel('NP-TZ500');
  assert.equal(c.releaseYear, 2024);
  assert.equal(c.categoryId, 'dishwasher');
  assert.deepEqual(c.suggestions.map(t => t.intervalDays), [7,15,30,30,90]);
  assert.ok(c.suggestions.every(t => t.sourceKind === '取扱説明書' && t.sourceUrl.includes('/000000002409139/np-tz500.pdf#page=')));
  assert.match(c.suggestions[1].frequency, /月に2〜3回/);
  assert.match(c.suggestions[1].conditions, /食器を入れず/);
  assert.match(c.suggestions[1].conditions, /塩素系洗剤/);
  assert.match(c.suggestions[4].frequency, /洗剤変更時/);
  assert.match(c.suggestions[4].conditions, /モード2は詰まり時/);
  assert.match(c.suggestions[4].conditions, /モード3は洗剤排出/);
  assert.equal(lookup.lookupModel('NP-TZ300').length, 0);
  assert.equal(lookup.lookupModel('NP-TH4').length, 0);
});

test('TH5 TA5 and TSK2 preserve their own dishwasher course and page evidence', () => {
 for (const model of ['NP-TH5','NP-TA5','NP-TSK2']) {
  const [c] = lookup.lookupModel(model);
  assert.equal(c.categoryId, 'dishwasher');
  assert.deepEqual(c.suggestions.map(t => t.intervalDays), [7,30,30,15]);
  assert.ok(c.suggestions.every(t => t.sourceKind === '取扱説明書' && !t.name.includes('洗剤タンク')));
  const slim = model === 'NP-TSK2';
  assert.equal(c.releaseYear, slim ? 2025 : 2024);
  assert.ok(c.manualUrl.endsWith(slim ? '/np-tsk2.pdf' : '/np-th5_np-ta5.pdf'));
  assert.ok(c.suggestions[1].sourceUrl.endsWith(slim ? '#page=6' : '#page=7'));
  assert.ok(c.suggestions[3].conditions.includes(slim ? '汚れレベルL3' : 'お手入れコース'));
  assert.match(c.suggestions[3].conditions, /2倍/);
 }
 assert.match(lookup.lookupModel('NP-TA5')[0].lookupNote, /80℃すすぎはこの機種の機能ではありません/);
 assert.equal(lookup.lookupModel('NP-TSK1').length, 0);
});

 test('2025 fridge variants retain distinct powered and unplugged care requirements', () => {
 for (const model of ['NR-C33JS2','NR-C33JS2L','NR-C37WS2','NR-C37WS2L']) {
  const [c] = lookup.lookupModel(model.toLowerCase());
  assert.equal(c.categoryId, 'fridge');
  assert.equal(c.releaseYear, 2025);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays), [7,90,90,90,180,365,1095]);
  assert.ok(c.manualUrl.includes('NR-C37WS2_C37WS2L_C33JS2_C33JS2L'));
  assert.match(c.suggestions[0].conditions, /水道水以外/);
  assert.match(c.suggestions[3].conditions, /潤滑剤は拭き取らない/);
  assert.match(c.suggestions[4].conditions, /電源を入れた状態/);
  assert.match(c.suggestions[4].conditions, /取り外せません/);
  assert.ok(c.suggestions[4].sourceUrl.endsWith('#page=8'));
  assert.ok(c.suggestions.filter((_,i)=>i!==4).every(x=>x.sourceUrl.endsWith('#page=9')));
  assert.match(c.suggestions[6].conditions, /使用開始日/);
  assert.match(c.lookupNote, /7分以上/);
 }
 assert.equal(lookup.lookupModel('NR-C33JS1').length,0);
 assert.equal(lookup.lookupModel('NR-C37ES1').length,0);
});

test('ES refrigerators use the ES manual and chiller case rather than partial-mode instructions', () => {
 for (const model of ['NR-C33ES2','NR-C33ES2L','NR-C37ES2','NR-C37ES2L']) {
  const [c] = lookup.lookupModel(model);
  assert.equal(c.categoryId,'fridge');
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,90,90,90,180,365,1095]);
  assert.ok(c.manualUrl.includes('000000003487471'));
  assert.ok(c.suggestions[4].sourceUrl.endsWith('#page=6'));
  assert.match(c.suggestions[4].conditions,/製氷を停止してから/);
  assert.match(c.suggestions[3].name,/チルドルーム/);
  assert.ok(c.suggestions.every(x=>!x.conditions.includes('PDF9') && !x.name.includes('パーシャル')));
  assert.match(c.suggestions[6].conditions,/説明書18ページ/);
  assert.match(c.lookupNote,/2025年7月/);
 }
 assert.equal(lookup.lookupModel('NR-C33ES1').length,0);
});

test('Hitachi HWC X care keeps catalyst and filter restrictions and conditional ice cleaning', () => {
 for (const model of ['R-HWC62X','R-HWC54X','R-HWC49X']) {
  const [c] = lookup.lookupModel(model);
  assert.equal(c.maker,'日立');
  assert.equal(c.releaseYear,2025);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.match(c.suggestions[0].conditions,/フィルター部分にはスポンジも使わず/);
  assert.match(c.suggestions[6].conditions,/プラチナ触媒は水洗い禁止/);
  assert.match(c.suggestions[9].frequency,/3〜4年/);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.ok(!c.suggestions.some(x=>x.name.includes('製氷おそうじ')));
  assert.match(c.lookupNote,/1週間以上不使用/);
 }
 assert.equal(lookup.lookupModel('R-HXC54Y').length,0);
 assert.equal(lookup.lookupModel('R-HWC54XG').length,0);
});


test('Hitachi HXC X uses its own official manual and preserves care limits', () => {
 for (const model of ['R-HXC62X','R-HXC54X']) {
  const [c] = lookup.lookupModel(model);
  assert.equal(c.releaseYear,2025);
  assert.match(c.manualUrl,/r_hxc62x_a\.pdf$/);
  assert.match(c.releaseSourceUrl,new RegExp(model));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.suggestions[0].conditions,/フィルター部分にはスポンジも使わず/);
  assert.match(c.suggestions[6].conditions,/プラチナ触媒は水洗い禁止/);
  assert.match(c.suggestions[9].frequency,/3〜4年/);
  assert.match(c.lookupNote,/2025年2月発売/);
  assert.match(c.lookupNote,/1週間以上不使用/);
  assert.ok(!c.suggestions.some(x=>x.name.includes('製氷おそうじ')));
 }
 assert.equal(lookup.lookupModel('R-HXCC54Y').length,0);
 assert.equal(lookup.lookupModel('R-HXC62Y').length,0);
});


test('Hitachi HXCC X retains camera condition and dedicated care page mapping', () => {
 for (const model of ['R-HXCC62X','R-HXCC54X']) {
  const [c] = lookup.lookupModel(model);
  assert.match(c.manualUrl,/r_hxcc62x_a\.pdf$/);
  assert.equal(c.releaseYear,2025);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.ok(c.suggestions.every(x=>/#page=(39|40)$/.test(x.sourceUrl)));
  assert.match(c.suggestions[4].conditions,/42ページ/);
  assert.match(c.suggestions[6].conditions,/43ページ/);
  assert.match(c.suggestions[9].conditions,/58ページ/);
  assert.match(c.lookupNote,/カメラは汚れが気になるとき/);
  assert.match(c.lookupNote,/41ページの製氷おそうじ/);
  assert.ok(!c.suggestions.some(x=>/カメラ|製氷おそうじ/.test(x.name)));
 }
 assert.equal(lookup.lookupModel('R-HXCC62Y').length,0);
});


test('Hitachi VWC X uses independently verified VWC evidence and exact matching', () => {
 for (const model of ['R-VWC57X','R-VWC50X']) {
  const [c] = lookup.lookupModel(model);
  assert.equal(c.releaseYear,2025);
  assert.match(c.manualUrl,/r_vwc57x_a\.pdf$/);
  assert.match(c.releaseSourceUrl,new RegExp(model));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.suggestions[0].conditions,/フィルター部分にはスポンジも使わず/);
  assert.match(c.suggestions[6].conditions,/プラチナ触媒は水洗い禁止/);
  assert.match(c.suggestions[9].frequency,/3〜4年/);
  assert.match(c.lookupNote,/VWC専用/);
  assert.ok(!c.suggestions.some(x=>/カメラ|製氷おそうじ/.test(x.name)));
 }
 assert.equal(lookup.lookupModel('R-VWC57Y').length,0);
 assert.equal(lookup.lookupModel('R-VW50X').length,0);
});


test('GZC67X preserves vacuum room care and conditional electric drawer cleaning', () => {
 const [c]=lookup.lookupModel('R-GZC67X');
 assert.match(c.manualUrl,/r_gzc67x_a\.pdf$/);
 assert.equal(c.suggestions.length,10);
 assert.equal(c.suggestions[4].name,'真空氷温ルームの清掃');
 assert.match(c.suggestions[4].conditions,/自然乾燥/);
 assert.match(c.suggestions[9].conditions,/57ページ/);
 assert.match(c.lookupNote,/リンク部を動かさない/);
 assert.match(c.lookupNote,/MENU.*Ice Maker/);
 assert.ok(!c.suggestions.some(x=>/電動引き出し|製氷おそうじ|特鮮氷温/.test(x.name)));
 assert.equal(lookup.lookupModel('R-GZC67Y').length,0);
});


test('WXC and GXCC retain distinct chiller and ice tray care', () => {
 const [w]=lookup.lookupModel('R-WXC74X'); const [g]=lookup.lookupModel('R-GXCC67X');
 assert.equal(w.suggestions.length,11); assert.equal(g.suggestions.length,10);
 assert.equal(w.suggestions[4].name,'真空チルドルームの清掃');
 assert.equal(g.suggestions[4].name,'特鮮氷温ルームの清掃');
 assert.match(w.suggestions[10].conditions,/点滅中は約1分待ち/);
 assert.match(w.suggestions[10].conditions,/スポンジ・クレンザー/);
 assert.match(w.lookupNote,/MENU/); assert.ok(!g.lookupNote.includes('MENU'));
 for (const c of [w,g]) assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
 assert.equal(lookup.lookupModel('R-WXC74Y').length,0);
});


test('Hitachi H X uses its own shared manual and excludes unrelated camera and drawer care', () => {
 for (const model of ['R-H54X','R-H49X']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));
  assert.equal(c.releaseYear,2025);
  assert.match(c.manualUrl,/r_h54x_a\.pdf$/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.suggestions[4].conditions,/26ページ/);
  assert.match(c.suggestions[6].conditions,/27ページ/);
  assert.ok(!c.suggestions[6].conditions.includes('プラチナ'));
  assert.match(c.suggestions[9].conditions,/35ページ/);
  assert.match(c.lookupNote,/冷蔵室以外のドア/);
  assert.ok(!/カメラ|電動引き出し|MENU/.test(c.lookupNote));
 }
 assert.equal(lookup.lookupModel('R-H54XX').length,0);
});


test('HWS right and left models retain dedicated manual and catalyst restrictions', () => {
 for (const model of ['R-HWS47X','R-HWS47XL']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));
  assert.match(c.manualUrl,/r_hws47x_b\.pdf$/);
  assert.match(c.releaseSourceUrl,new RegExp(model+'/manual'));
  assert.match(c.lookupNote,/2025年9月発売/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.suggestions[6].conditions,/プラチナ触媒は取り外さず、水洗いしない/);
  assert.match(c.suggestions[6].conditions,/しきりを外し/);
  assert.ok(!c.suggestions.some(x=>/製氷おそうじ|カメラ|電動/.test(x.name)));
 }
 assert.equal(lookup.lookupModel('R-HWS47XX').length,0);
});


test('Hitachi V X preserves three-minute ice cleaning and water-dependent tank care', () => {
 for (const model of ['R-V38X','R-V38XL','R-V32X','R-V32XL']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));
  assert.match(c.manualUrl,/r_v38x_a\.pdf$/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,90,90,180,180,1095]);
  assert.match(c.suggestions[0].conditions,/塩素を含まない水.*3日に1回/);
  assert.match(c.lookupNote,/約3分/);
  assert.match(c.lookupNote,/製氷皿は取り外せず/);
  assert.ok(!c.suggestions.some(x=>/氷温|チルド|側面|製氷皿/.test(x.name)));
  assert.match(c.suggestions[7].conditions,model.includes('38')?/上に引っ張り/:/手前に引っ張り/);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
 }
 assert.equal(lookup.lookupModel('R-V38XX').length,0);
});


test('R27X only proposes its own nonautomatic-ice care', () => {
 const [c]=lookup.lookupModel('R-27X');
 assert.ok(lookup.supportedModels.includes('R-27X'));
 assert.match(c.manualUrl,/r_27x_a\.pdf$/);
 assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,30,30,90,90,180,180]);
 assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=10'));
 assert.ok(!c.suggestions.some(x=>/給水|製氷|フィルター/.test(x.name)));
 assert.match(c.suggestions[6].conditions,/蒸発皿を取り外さない/);
 assert.equal(lookup.lookupModel('R-27XL').length,0);
});


test('R-H54XG uses its own manual and conditional four-minute ice cleaning', () => {
 const [c]=lookup.lookupModel('R-H54XG');
 assert.ok(lookup.supportedModels.includes('R-H54XG'));
 assert.match(c.manualUrl,/r_h54xg_b\.pdf$/);
 assert.match(c.lookupNote,/2025年10月発売/);
 assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
 assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
 assert.match(c.suggestions[0].conditions,/フィルター部分にはスポンジも使わず/);
 assert.match(c.suggestions[6].conditions,/レールの潤滑剤を拭き取らない/);
 assert.match(c.lookupNote,/約4分/);
 assert.match(c.lookupNote,/初回・1週間以上不使用後のみ/);
 assert.ok(!c.suggestions.some(x=>/製氷おそうじ|カメラ|電動/.test(x.name)));
 assert.ok(!c.suggestions.some(x=>/プラチナ触媒|しきり/.test(x.conditions)));
 assert.equal(lookup.lookupModel('R-H54YG').length,0);
});


test('2024 WY refrigerators preserve their own nine-task layout without special chiller care', () => {
 for(const model of ['R-H54WY','R-H49WY']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));
  assert.equal(c.releaseYear,2024);
  assert.match(c.lookupNote,/2024年11月発売/);
  assert.match(c.manualUrl,/r_h54wy_a\.pdf$/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.ok(!c.suggestions.some(x=>/特鮮|氷温|カメラ|製氷おそうじ/.test(x.name)));
  assert.match(c.suggestions[5].conditions,/背面から水がたれる/);
  assert.ok(!c.suggestions.some(x=>/プラチナ|歯ブラシ|しきり/.test(x.conditions)));
  assert.match(c.lookupNote,/約4分/);
 }
 assert.equal(lookup.lookupModel('R-H54WYG').length,0);
});


test('2024 W exact models cite the W manual and its nine care tasks', () => {
 for(const model of ['R-H54W','R-H49W']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));
  assert.match(c.manualUrl,/r_h54w_a\.pdf$/);
  assert.equal(c.releaseYear,2024);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.ok(!c.suggestions.some(x=>/氷温|カメラ|製氷おそうじ/.test(x.name)));
  assert.match(c.suggestions[5].conditions,/潤滑剤を拭き取らず/);
  assert.match(c.lookupNote,/約4分/);
 }
 assert.equal(lookup.lookupModel('R-H54WG').length,0);
});


test('2024 HWS V right and left models retain dedicated care and catalyst protection', () => {
 for(const model of ['R-HWS47V','R-HWS47VL']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));
  assert.equal(c.releaseYear,2024);
  assert.match(c.manualUrl,/r_hws47v_a\.pdf$/);
  assert.match(c.lookupNote,/2024年10月発売/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.suggestions[6].conditions,/プラチナ触媒は取り外さず、水洗いしない/);
  assert.match(c.suggestions[6].conditions,/しきりを外し/);
  assert.match(c.lookupNote,/約4分/);
  assert.ok(!c.suggestions.some(x=>/製氷おそうじ|カメラ/.test(x.name)));
 }
 assert.equal(lookup.lookupModel('R-HWS47VG').length,0);
});


test('2024 V four variants preserve own sources, water conditions and capacity-specific removal', () => {
 for(const model of ['R-V38V','R-V38VL','R-V32V','R-V32VL']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));assert.equal(c.releaseYear,2024);
  assert.match(c.manualUrl,/r_v38v_a\.pdf$/);
  assert.match(c.lookupNote,/2024年9月発売/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.suggestions[0].conditions,/塩素を含まない水.*3日に1回/);
  assert.match(c.suggestions[7].conditions,model.includes('38')?/上に引っ張り/:/手前に引っ張り/);
  assert.match(c.lookupNote,/約3分/);
  assert.ok(!c.suggestions.some(x=>/側面|氷温|製氷皿/.test(x.name)));
 }
 assert.equal(lookup.lookupModel('R-V38VG').length,0);
});


test('2024 R27V cites only its own nonautomatic-ice care', () => {
 const [c]=lookup.lookupModel('R-27V');
 assert.ok(lookup.supportedModels.includes('R-27V'));assert.equal(c.releaseYear,2024);
 assert.match(c.manualUrl,/r_27v_a\.pdf$/);
 assert.match(c.lookupNote,/2024年10月発売/);
 assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,30,30,90,90,180,180]);
 assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=10'));
 assert.ok(!c.suggestions.some(x=>/給水|製氷|フィルター|側面/.test(x.name)));
 assert.match(c.suggestions[6].conditions,/蒸発皿を取り外さない/);
 assert.equal(lookup.lookupModel('R-27VL').length,0);
});


test('2024 HS V variants retain their own nine tasks without HWS-only care', () => {
 for (const model of ['R-HS47V','R-HS47VL']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));
  assert.equal(c.releaseYear,2024);
  assert.match(c.releaseSourceUrl,new RegExp('/'+model+'/manual.html$'));
  assert.match(c.manualUrl,/r_hs47v_a\.pdf$/);
  assert.match(c.lookupNote,/2024年6月発売/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.suggestions[5].conditions,/ケース背面から水がたれる/);
  assert.match(c.suggestions[5].conditions,/潤滑剤を拭き取らず/);
  assert.ok(!c.suggestions.some(x=>/氷温|触媒|しきり|製氷おそうじ/.test(x.name+x.conditions)));
  assert.match(c.lookupNote,/初回・1週間以上不使用後のみ/);
  assert.match(c.lookupNote,/約4分/);
 }
 assert.equal(lookup.lookupModel('R-HS47VG').length,0);
});


test('2026 HWC Y models retain dedicated sources and vegetable case safeguards', () => {
 for (const model of ['R-HWC62Y','R-HWC54Y','R-HWC49Y']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));
  assert.equal(c.releaseYear,2026);
  assert.match(c.lookupNote,/2026年2月発売/);
  assert.equal(c.releaseSourceUrl,'https://kadenfan.hitachi.co.jp/support/rei/item/'+model+'/manual.html');
  assert.match(c.manualUrl,/r_hwc62y_b_00\.pdf$/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.suggestions[6].conditions,/プラチナ触媒は取り外さず、水洗いしない/);
  assert.match(c.suggestions[6].conditions,/しきりを外し/);
  assert.match(c.suggestions[6].conditions,/裏返して排水/);
  assert.match(c.lookupNote,/初回・1週間以上不使用後のみ/);
  assert.match(c.lookupNote,/約4分/);
  assert.ok(!c.suggestions.some(x=>/製氷おそうじ|カメラ/.test(x.name)));
 }
 assert.equal(lookup.lookupModel('R-HWC62YG').length,0);
});


test('2026 HZC Y preserves vacuum room care and dedicated manual evidence', () => {
 for (const model of ['R-HZC62Y','R-HZC54Y']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));assert.equal(c.releaseYear,2026);
  assert.match(c.lookupNote,/2026年2月発売/);
  assert.match(c.manualUrl,/r_hzc62y_b_00\.pdf$/);
  assert.equal(c.releaseSourceUrl,'https://kadenfan.hitachi.co.jp/support/rei/item/'+model+'/manual.html');
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.equal(c.suggestions[4].name,'真空氷温ルームの清掃');
  assert.match(c.suggestions[4].conditions,/自然乾燥/);
  assert.match(c.suggestions[4].conditions,/LED庫内灯部分はやさしく/);
  assert.match(c.suggestions[4].conditions,/ハンドルを下げてロック/);
  assert.match(c.suggestions[6].conditions,/プラチナ触媒は取り外さず/);
  assert.ok(!c.suggestions.some(x=>/特鮮|製氷おそうじ|カメラ/.test(x.name)));
 }
 assert.equal(lookup.lookupModel('R-HZC49Y').length,0);
});


test('2026 H Y models retain their own chiller and drainage care without catalyst advice', () => {
 for(const model of ['R-H54Y','R-H49Y']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));assert.equal(c.releaseYear,2026);
  assert.match(c.manualUrl,/r_h54y_a_01\.pdf$/);
  assert.match(c.lookupNote,/2026年4月発売/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.equal(c.suggestions[4].name,'特鮮氷温ルームの清掃');
  assert.match(c.suggestions[6].conditions,/裏返して排水し十分に乾かし/);
  assert.match(c.suggestions[6].conditions,/毛足の長いものは使わず/);
  assert.ok(!c.suggestions.some(x=>/触媒|しきりを外|真空|カメラ/.test(x.name+x.conditions)));
  assert.match(c.lookupNote,/約4分/);
 }
 assert.equal(lookup.lookupModel('R-H54YG').length,0);
});


test('2026 HWS Y variants preserve dedicated sources and catalyst safeguards', () => {
 for(const model of ['R-HWS47Y','R-HWS47YL']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));assert.equal(c.releaseYear,2026);
  assert.match(c.lookupNote,/2026年8月発売/);
  assert.match(c.manualUrl,/r_hws47y_a\.pdf$/);
  assert.equal(c.releaseSourceUrl,'https://kadenfan.hitachi.co.jp/support/rei/item/'+model+'/manual.html');
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.suggestions[6].conditions,/プラチナ触媒は取り外さず、水洗いしない/);
  assert.match(c.suggestions[6].conditions,/しきりを外し/);
  assert.match(c.suggestions[6].conditions,/裏返して排水/);
  assert.ok(!c.suggestions.some(x=>/真空|カメラ|製氷おそうじ/.test(x.name)));
  assert.match(c.lookupNote,/初回・1週間以上不使用後のみ/);
  assert.match(c.lookupNote,/約4分/);
 }
 assert.equal(lookup.lookupModel('R-HWS47YG').length,0);
});


test('2026 V four variants preserve own sources, water conditions and capacity-specific removal', () => {
 for(const model of ['R-V38Y','R-V38YL','R-V32Y','R-V32YL']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));assert.equal(c.releaseYear,2026);
  assert.match(c.manualUrl,/r_v38y_a\.pdf$/);
  assert.match(c.lookupNote,/2026年8月発売/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.suggestions[0].conditions,/塩素を含まない水.*3日に1回/);
  assert.match(c.suggestions[7].conditions,model.includes('38')?/上に引っ張り/:/手前に引っ張り/);
  assert.match(c.lookupNote,/約3分/);
  assert.ok(!c.suggestions.some(x=>/側面|氷温|製氷皿/.test(x.name)));
 }
 assert.equal(lookup.lookupModel('R-V38YG').length,0);
});


test('2026 R27Y cites only its own nonautomatic-ice care', () => {
 const [c]=lookup.lookupModel('R-27Y');
 assert.ok(lookup.supportedModels.includes('R-27Y'));assert.equal(c.releaseYear,2026);
 assert.match(c.manualUrl,/r_27y_a\.pdf$/);
 assert.match(c.lookupNote,/2026年8月発売/);
 assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,30,30,90,90,180,180]);
 assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=10'));
 assert.ok(!c.suggestions.some(x=>/給水|製氷|フィルター|側面/.test(x.name)));
 assert.match(c.suggestions[6].conditions,/蒸発皿を取り外さない/);
 assert.equal(lookup.lookupModel('R-27YL').length,0);
});


test('KW57YJ retains dedicated switch-room care without sibling catalyst or drainage advice', () => {
 const [c]=lookup.lookupModel('R-KW57YJ');
 assert.ok(lookup.supportedModels.includes('R-KW57YJ'));
 assert.equal(c.releaseYear,2026);assert.match(c.lookupNote,/2026年10月発売/);
 assert.match(c.manualUrl,/r_kw57yj_a\.pdf$/);
 assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
 assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
 assert.match(c.suggestions[6].conditions,/切替室.*しきりを外/);
 assert.match(c.suggestions[6].conditions,/「R」.*正面右下/);
 assert.match(c.suggestions[4].conditions,/ケース全体/);
 assert.match(c.lookupNote,/5秒以上/);assert.match(c.lookupNote,/約4分/);
 assert.ok(!c.suggestions.some(x=>/触媒|裏返|毛足|真空/.test(x.conditions)));
 assert.equal(lookup.lookupModel('R-KW57Y').length,0);
});


test('2024 HW V models retain dedicated sources and vegetable-room precautions', () => {
 for(const model of ['R-HW62V','R-HW54V','R-HW49V']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));assert.equal(c.releaseYear,2024);
  assert.match(c.manualUrl,/r_hw62v_b\.pdf$/);assert.match(c.lookupNote,/2024年2月発売/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  const care=c.suggestions[6].conditions;
  for(const pattern of [/触媒は取り外さず/,/しきりを外/,/「R」.*正面右下/,/裏返して排水/,/毛足の長い/,/潤滑剤を拭き取らない/]) assert.match(care,pattern);
  assert.match(c.suggestions[4].conditions,/ケース全体/);assert.match(c.lookupNote,/約4分/);
  assert.ok(!c.suggestions.some(x=>/真空|カメラ|切替室/.test(x.conditions)));
 }
 assert.equal(lookup.lookupModel('R-HW54VG').length,0);
});


test('2024 VW V uses its own manual and both divided lower-room case instructions', () => {
 for(const model of ['R-VW57V','R-VW50V']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));assert.equal(c.releaseYear,2024);
  assert.match(c.manualUrl,/r_vw57v_b\.pdf$/);assert.match(c.lookupNote,/2024年2月発売/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  const care=c.suggestions[6].conditions;
  for(const pattern of [/野菜室・冷凍室下段.*しきりを外/,/「R」.*正面右下/,/スリット/,/裏返して排水/,/毛足の長い/,/潤滑剤を拭き取らない/]) assert.match(care,pattern);
  assert.match(c.suggestions[4].conditions,/ケース全体/);assert.match(c.lookupNote,/約4分/);
  assert.ok(!c.suggestions.some(x=>/真空|カメラ|切替室/.test(x.conditions)));
 }
 assert.equal(lookup.lookupModel('R-VW57VG').length,0);
});


test('2024 HXC V has dedicated 56-page sources and distinct freezer and vegetable case instructions', () => {
 for(const model of ['R-HXC62V','R-HXC54V']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));assert.equal(c.releaseYear,2024);
  assert.match(c.manualUrl,/r_hxc62v_b\.pdf$/);assert.match(c.lookupNote,/2024年2月発売/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[40,39,39,39,40,39,39,39,39,40].map(p=>c.manualUrl+'#page='+p));
  const care=c.suggestions[6].conditions;
  for(const pattern of [/野菜室の下段ケース.*しきりを外/,/「R」.*正面右下/,/小物ケース.*スリット/,/左右のつめ.*外側/,/裏返して排水/,/毛足の長い/,/潤滑剤を拭き取らない/]) assert.match(care,pattern);
  assert.ok(!/野菜室・冷凍室下段.*しきりを外/.test(care));
  assert.match(c.suggestions[4].conditions,/42ページ.*ケース全体/);
  assert.match(c.suggestions[9].conditions,/54ページ/);
  assert.match(c.lookupNote,/41ページ/);assert.match(c.lookupNote,/約4分/);
  assert.ok(!c.suggestions.some(x=>/真空|カメラ|切替室|製氷おそうじ/.test(x.name)));
 }
 assert.equal(lookup.lookupModel('R-HXC62VG').length,0);
});


test('2024 HXCC V cites its own 60-page manual and keeps camera care conditional', () => {
 for(const model of ['R-HXCC62V','R-HXCC54V']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));assert.equal(c.releaseYear,2024);
  assert.match(c.manualUrl,/r_hxcc62v_b\.pdf$/);assert.match(c.lookupNote,/2024年2月発売/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
  assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[42,41,41,41,42,41,41,41,41,42].map(p=>c.manualUrl+'#page='+p));
  const care=c.suggestions[6].conditions;
  for(const pattern of [/野菜室の下段ケース.*しきりを外/,/「R」.*正面右下/,/小物ケース.*スリット/,/左右のつめ.*外側/,/裏返して排水/,/毛足の長い/,/潤滑剤を拭き取らない/]) assert.match(care,pattern);
  assert.ok(!/野菜室・冷凍室下段.*しきりを外/.test(care));
  assert.match(c.suggestions[4].conditions,/44ページ.*ケース全体/);
  assert.match(c.suggestions[9].conditions,/58ページ/);
  assert.match(c.lookupNote,/カメラ.*気になるとき.*41ページ/);
  assert.match(c.lookupNote,/43ページ/);assert.match(c.lookupNote,/約4分/);
  assert.ok(!c.suggestions.some(x=>/カメラ|製氷おそうじ|真空/.test(x.name)));
 }
 assert.equal(lookup.lookupModel('R-HXCC62VG').length,0);
});


test('2024 H V preserves dedicated nine-task care without special chiller or vegetable divider instructions', () => {
 for(const model of ['R-H54V','R-H49V']) {
  const [c]=lookup.lookupModel(model);
  assert.ok(lookup.supportedModels.includes(model));assert.equal(c.releaseYear,2024);
  assert.match(c.manualUrl,/r_h54v_b\.pdf$/);assert.match(c.lookupNote,/2024年1月発売/);
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,90,90,180,180,1095]);
  assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[24,23,23,23,23,23,23,23,24].map(p=>c.manualUrl+'#page='+p));
  const care=c.suggestions[5].conditions;
  for(const pattern of [/水がたれる/,/潤滑剤を拭き取らず/,/小物ケース.*スリット/,/左右のつめ.*外側/]) assert.match(care,pattern);
  assert.match(c.suggestions[8].conditions,/35ページ/);
  assert.match(c.lookupNote,/25ページ/);assert.match(c.lookupNote,/約4分/);
  assert.ok(!c.suggestions.some(x=>/氷温|触媒|裏返|毛足|しきりを外|カメラ/.test(x.name+x.conditions)));
 }
 assert.equal(lookup.lookupModel('R-H54VG').length,0);
});


test('KXCC57V uses dedicated switch-room evidence without vegetable-room care', () => {
 const [c]=lookup.lookupModel('R-KXCC57V');
 assert.ok(lookup.supportedModels.includes('R-KXCC57V'));assert.equal(c.releaseYear,2024);
 assert.match(c.manualUrl,/r_kxcc57v_b\.pdf$/);assert.match(c.lookupNote,/2024年2月発売/);
 assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
 assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[42,41,41,41,42,41,41,41,41,42].map(p=>c.manualUrl+'#page='+p));
 const care=c.suggestions[6].conditions;
 for(const pattern of [/上下の切替室.*しきりを外/,/「R」.*正面右下/,/左右にスライド/,/冷凍室.*スリット/,/潤滑剤を拭き取らない/]) assert.match(care,pattern);
 assert.match(c.suggestions[4].conditions,/44ページ.*ケース全体/);
 assert.match(c.suggestions[9].conditions,/58ページ/);
 assert.match(c.lookupNote,/カメラ.*気になるとき/);assert.match(c.lookupNote,/約4分/);
 assert.ok(!c.suggestions.some(x=>/野菜室|触媒|裏返|毛足|小物ケース/.test(x.name+x.conditions)));
 assert.equal(lookup.lookupModel('R-KXCC57VG').length,0);
});


test('2024 premium V models preserve own vacuum, ice-tray and PLATINUM divider distinctions', () => {
 const [w]=lookup.lookupModel('R-WXC74V'),[g]=lookup.lookupModel('R-GXCC67V');
 for(const c of [w,g]) {
  assert.ok(lookup.supportedModels.includes(c.modelNumber));assert.equal(c.releaseYear,2024);
  assert.match(c.lookupNote,/2024年2月発売/);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.lookupNote,/電動引き出し.*電源プラグ.*水.*分解/);
  assert.match(c.lookupNote,/約4分/);
  assert.ok(!c.suggestions.some(x=>/カメラ|電動引き出し|製氷おそうじ/.test(x.name)));
 }
 assert.match(w.manualUrl,/r_wxc74v_b\.pdf$/);
 assert.deepEqual(w.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095,180]);
 assert.match(w.suggestions[4].conditions,/真空チルド.*ハンドル.*ロック/);
 assert.match(w.suggestions[4].conditions,/6か所/);
 assert.match(w.suggestions[10].conditions,/MENU.*製氷停止.*約1分/);
 assert.match(w.suggestions[6].conditions,/「R」.*正面右下/);
 assert.match(w.suggestions[9].conditions,/57ページ/);
 assert.match(g.manualUrl,/r_gxcc67v_b\.pdf$/);
 assert.deepEqual(g.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
 assert.match(g.suggestions[6].conditions,/PLATINUM/);
 assert.ok(!/「R」/.test(g.suggestions[6].conditions));
 assert.match(g.suggestions[6].conditions,/しきりを付けずに本体へ入れない/);
 assert.match(g.suggestions[9].conditions,/58ページ/);
 assert.ok(!g.suggestions.some(x=>/真空|製氷皿/.test(x.name)));
 assert.equal(lookup.lookupModel('R-WXC74VG').length,0);
});

test('2024 premium W models preserve own vacuum, ice-tray and PLATINUM divider distinctions', () => {
 const [w]=lookup.lookupModel('R-WXC74W'),[g]=lookup.lookupModel('R-GXCC67W');
 for(const c of [w,g]) {
  assert.ok(lookup.supportedModels.includes(c.modelNumber));assert.equal(c.releaseYear,2024);
  assert.match(c.lookupNote,/2024年11月発売/);
  assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));
  assert.match(c.lookupNote,/電動引き出し.*電源プラグ.*水.*分解/);
  assert.match(c.lookupNote,/約4分/);
  assert.ok(!c.suggestions.some(x=>/カメラ|電動引き出し|製氷おそうじ/.test(x.name)));
 }
 assert.match(w.manualUrl,/r_wxc74w_a\.pdf$/);
 assert.deepEqual(w.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095,180]);
 assert.match(w.suggestions[4].conditions,/真空チルド.*ハンドル.*ロック/);
 assert.match(w.suggestions[4].conditions,/6か所/);
 assert.match(w.suggestions[10].conditions,/MENU.*製氷停止.*約1分/);
 assert.match(w.suggestions[6].conditions,/「R」.*正面右下/);
 assert.match(w.suggestions[9].conditions,/57ページ/);
 assert.match(g.manualUrl,/r_gxcc67w_a\.pdf$/);
 assert.deepEqual(g.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,90,90,180,180,1095]);
 assert.match(g.suggestions[6].conditions,/PLATINUM/);
 assert.ok(!/「R」/.test(g.suggestions[6].conditions));
 assert.match(g.suggestions[6].conditions,/しきりを付けずに本体へ入れない/);
 assert.match(g.suggestions[9].conditions,/58ページ/);
 assert.ok(!g.suggestions.some(x=>/真空|製氷皿/.test(x.name)));
 assert.equal(lookup.lookupModel('R-WXC74WG').length,0);
});

test('R-27TV exact manual keeps seven care tasks without automatic ice-maker advice',()=>{
 const [c]=lookup.lookupModel('R-27TV');assert.equal(c.releaseYear,2023);assert.match(c.lookupNote,/2023年10月発売/);
 assert.match(c.manualUrl,/r_27tv_c\.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,30,30,90,90,180,180]);
 assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=10'));
 assert.ok(!c.suggestions.some(x=>/製氷|給水|フィルター|側面/.test(x.name)));
 assert.match(c.suggestions[4].conditions,/突起.*角穴.*ローラー.*レール内/);
 assert.match(c.suggestions[6].conditions,/機械室に手を入れず.*蒸発皿を取り外さない/);
 assert.equal(lookup.lookupModel('R-27TVL').length,0);
});

test('MC-PJ25A uses its own two conditional monthly care suggestions, never bag/filter intervals',()=>{
 const [c]=lookup.lookupModel('MC-PJ25A');assert.equal(c.releaseYear,2026);assert.match(c.lookupNote,/2026年2月発売/);
 assert.match(c.manualUrl,/MC-PJ25A\.pdf$/);assert.equal(c.suggestions.length,2);
 assert.ok(c.suggestions.every(x=>x.intervalDays===30 && x.sourceUrl===c.manualUrl+'#page=7' && x.frequency.includes('吸込力が弱くなったとき')));
 assert.match(c.suggestions[0].conditions,/陰干し.*ドライヤー.*洗剤/);
 assert.match(c.suggestions[1].conditions,/水洗い禁止/);
 assert.match(c.lookupNote,/紙パック交換後も吸込力が戻らないとき.*もみ洗い.*洗濯機.*十分乾燥/);
 assert.match(c.lookupNote,/フィルター清掃や紙パック交換を固定周期にはしません/);
 assert.equal(lookup.lookupModel('MC-PJ25AJ').length,0);
});

test('PJ250G and PJ25G preserve dedicated powered-nozzle care and conditional sensor distinction',()=>{
 const [a]=lookup.lookupModel('MC-PJ250G'),[b]=lookup.lookupModel('MC-PJ25G');
 for(const c of [a,b]){assert.equal(c.releaseYear,2025);assert.match(c.lookupNote,/2025年8月発売/);assert.equal(c.suggestions.length,3);
 assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=8' && x.intervalDays===30 && x.frequency.includes('吸込力が弱くなったとき')));
 assert.match(c.suggestions[0].conditions,/親ノズル本体は水洗い禁止.*ブラシ.*水洗いできます/);assert.match(c.suggestions[0].conditions,/ベルト.*つめ.*陰干し/);
 assert.match(c.suggestions[1].conditions,/子ノズルは水洗い禁止/);assert.match(c.suggestions[2].conditions,/本体・ホース・延長管は水洗い禁止/);
 assert.ok(!c.suggestions.some(x=>/フィルター|紙パック|センサー/.test(x.name)));}
 assert.match(a.manualUrl,/MC-PJ250G\.pdf$/);assert.match(b.manualUrl,/MC-PJ25G\.pdf$/);
 assert.match(a.lookupNote,/ゴミ検知ランプ.*内部センサー.*から拭き.*水洗い禁止/);assert.ok(!b.lookupNote.includes('センサー'));
 assert.equal(lookup.lookupModel('MC-PJ250GX').length,0);
});

test('JP890K never inherits a monthly cleaning interval from PJ models',()=>{
 const [c]=lookup.lookupModel('MC-JP890K');assert.equal(c.releaseYear,2025);assert.match(c.lookupNote,/2025年10月発売/);
 assert.match(c.manualUrl,/MC-JP890K\.pdf$/);assert.equal(c.suggestions.length,1);
 assert.match(c.suggestions[0].frequency,/ペットの毛や綿ごみが多いとき/);assert.equal(c.suggestions[0].intervalDays,30);
 assert.equal(c.suggestions[0].sourceUrl,c.manualUrl+'#page=7');assert.match(c.suggestions[0].conditions,/条件に当てはまる場合だけ/);
 assert.match(c.lookupNote,/月1回の清掃とは記載されていません/);assert.match(c.lookupNote,/ガイド（ゴム部）と溝の内側/);
 assert.match(c.lookupNote,/手元ブラシ.*水洗い禁止/);assert.match(c.lookupNote,/センサー.*異常時のみ.*から拭き/);
 assert.ok(!c.suggestions.some(x=>/清掃|交換|センサー|フィルター/.test(x.name)));assert.equal(lookup.lookupModel('MC-JP890KX').length,0);
});

test('SR640K and SR44K keep weekly bin inspection separate from conditional washing',()=>{
 const [a]=lookup.lookupModel('MC-SR640K'),[b]=lookup.lookupModel('MC-SR44K');
 for(const c of [a,b]){assert.equal(c.releaseYear,2025);assert.match(c.lookupNote,/2025年10月発売/);
 assert.equal(c.suggestions.length,1);assert.equal(c.suggestions[0].intervalDays,7);assert.equal(c.suggestions[0].sourceUrl,c.manualUrl+'#page=7');
 assert.match(c.suggestions[0].conditions,/予定を待たず.*立てたまま.*カチッ.*ネットフィルター・サイクロンユニット/);
 assert.match(c.lookupNote,/固定周期にはしません/);assert.match(c.lookupNote,/約1時間.*ブラシでこすりません.*約24時間/);
 assert.match(c.lookupNote,/手元ブラシ.*水洗い禁止/);assert.match(c.lookupNote,/センサー.*異常時のみ.*から拭き/);
 assert.ok(!c.suggestions.some(x=>/清掃|フィルター|センサー/.test(x.name)));}
 assert.match(a.manualUrl,/MC-SR640K\.pdf$/);assert.match(b.manualUrl,/MC-SR44K\.pdf$/);
 assert.match(a.lookupNote,/ふとん用ノズル.*軽く水洗い/);assert.ok(!b.lookupNote.includes('ふとん用ノズル'));
 assert.equal(lookup.lookupModel('MC-SR44KX').length,0);
});

test('NX700K retains dock S-bag and wipe-only rotating brush restrictions',()=>{
 const [c]=lookup.lookupModel('MC-NX700K');assert.equal(c.releaseYear,2024);assert.match(c.lookupNote,/2024年3月発売/);
 assert.match(c.manualUrl,/mc-nx700k\.pdf$/);assert.equal(c.suggestions.length,1);assert.equal(c.suggestions[0].sourceUrl,c.manualUrl+'#page=8');
 assert.match(c.suggestions[0].frequency,/ペットの毛や綿ごみが多いとき/);assert.equal(c.suggestions[0].intervalDays,30);
 assert.match(c.lookupNote,/純正S型AMC-U2.*ケースは捨てず/);assert.match(c.lookupNote,/約24時間.*約1時間/);
 assert.match(c.lookupNote,/回転ブラシ.*固く絞った布.*カバーだけ水洗い/);assert.match(c.lookupNote,/2か所の凹部/);
 assert.match(c.lookupNote,/クリーンランプの色が変わらないときだけ乾拭き/);assert.match(c.lookupNote,/充電端子・排気口.*水洗い禁止/);
 assert.ok(!c.suggestions.some(x=>/清掃|交換|フィルター/.test(x.name)));assert.equal(lookup.lookupModel('MC-NX700KX').length,0);
});

test('NX810KM preserves washable removable brush and inner-only mist tank care',()=>{
 const [c]=lookup.lookupModel('MC-NX810KM');assert.equal(c.releaseYear,2024);assert.match(c.lookupNote,/2024年10月発売/);
 assert.match(c.manualUrl,/MC-NX810KM\.pdf$/);assert.equal(c.suggestions.length,1);assert.equal(c.suggestions[0].sourceUrl,c.manualUrl+'#page=9');
 assert.match(c.suggestions[0].frequency,/ペットの毛や綿ごみが多いとき/);assert.equal(c.suggestions[0].intervalDays,30);
 assert.match(c.lookupNote,/回転ブラシは外して水洗い可能.*解錠／施錠/);assert.match(c.lookupNote,/タンクは内側だけ水洗い可能/);
 assert.match(c.lookupNote,/綿棒.*強く押しつけません.*タンクの水を捨て/);assert.match(c.lookupNote,/常温の水道水以外は入れず/);
 assert.match(c.lookupNote,/約24時間.*約1時間/);assert.match(c.lookupNote,/充電端子・排気口.*水洗い禁止/);
 assert.notEqual(c.manualUrl,lookup.lookupModel('MC-NX700K')[0].manualUrl);assert.equal(lookup.lookupModel('MC-NX810K').length,0);
});

 test('NS100K and NS70F keep own manual pages and nozzle wash restrictions',()=>{
 const [a]=lookup.lookupModel('MC-NS100K'),[b]=lookup.lookupModel('MC-NS70F');
 for(const c of [a,b]){assert.equal(c.releaseYear,2023);assert.match(c.lookupNote,/2023年11月発売/);assert.equal(c.suggestions.length,1);assert.equal(c.suggestions[0].intervalDays,30);
 assert.match(c.suggestions[0].conditions,/条件に当てはまる場合だけ/);assert.match(c.lookupNote,/約30分.*約24時間/);assert.match(c.lookupNote,/切り欠き.*押し込みません/);
 assert.match(c.lookupNote,/青・赤ランプ.*まずドック/);assert.match(c.lookupNote,/固定周期を設定しません/);}
 assert.equal(a.suggestions[0].sourceUrl,a.manualUrl+'#page=8');assert.equal(b.suggestions[0].sourceUrl,b.manualUrl+'#page=9');
 assert.match(a.lookupNote,/回転ブラシは固く絞った布.*カバーだけ水洗い/);assert.match(a.lookupNote,/2か所の凹部/);
 assert.match(b.lookupNote,/床用ノズルは水洗い禁止/);assert.ok(!b.lookupNote.includes('カバーだけ水洗い'));
 assert.notEqual(a.manualUrl,b.manualUrl);assert.equal(lookup.lookupModel('MC-NS100KX').length,0);
 });

test('PB61J uses own monthly-approximate cleaning and bag lamp semantics',()=>{
 const [c]=lookup.lookupModel('MC-PB61J');assert.equal(c.releaseYear,2024);assert.match(c.lookupNote,/2024年11月発売/);assert.equal(c.suggestions.length,5);
 assert.ok(c.suggestions.slice(0,4).every(x=>x.intervalDays===30&&x.sourceUrl===c.manualUrl+'#page=8'&&x.frequency.includes('吸込力が弱くなったとき')));
 assert.match(c.suggestions[0].conditions,/本体は水洗い禁止.*ブラシ.*だけ.*水洗い/);assert.match(c.suggestions[0].conditions,/ベルト.*起毛布.*解錠／施錠/);
 assert.match(c.suggestions[1].conditions,/水洗い禁止/);assert.match(c.suggestions[2].conditions,/水洗い禁止/);assert.match(c.suggestions[3].conditions,/十分乾燥.*必ず取り付け/);
 assert.equal(c.suggestions[4].sourceUrl,c.manualUrl+'#page=7');assert.match(c.suggestions[4].conditions,/点滅はもうすぐ交換、点灯はすぐ交換/);assert.match(c.suggestions[4].conditions,/横長方向.*白ボール紙/);
 assert.equal(lookup.lookupModel('MC-PB61JX').length,0);
});

test('SB35K and SB55K use weekly bin inspection without invented cleaning or sensor intervals',()=>{
 const [a]=lookup.lookupModel('MC-SB35K'),[b]=lookup.lookupModel('MC-SB55K');
 for(const c of [a,b]){assert.equal(c.releaseYear,2025);assert.match(c.lookupNote,/2025年8月発売/);assert.equal(c.suggestions.length,1);assert.equal(c.suggestions[0].intervalDays,7);
 assert.match(c.suggestions[0].conditions,/予定を待たず.*ネットフィルター.*カチッ/);assert.match(c.lookupNote,/約30分.*プリーツフィルター.*ブラシでこすりません.*約24時間/);
 assert.match(c.lookupNote,/回転ブラシだけ.*ベルト.*起毛布/);assert.match(c.lookupNote,/固定周期を設定しません/);}
 assert.equal(a.suggestions[0].sourceUrl,a.manualUrl+'#page=7');assert.equal(b.suggestions[0].sourceUrl,b.manualUrl+'#page=9');
 assert.match(a.lookupNote,/充電アダプターを抜き/);assert.match(a.lookupNote,/標準運転ではランプは光りません/);assert.ok(!a.lookupNote.includes('センサー'));
 assert.match(b.lookupNote,/充電台から本体を外し/);assert.match(b.lookupNote,/同時点滅/);assert.match(b.lookupNote,/センサー.*乾拭き.*水洗い禁止/);
 assert.notEqual(a.manualUrl,b.manualUrl);assert.equal(lookup.lookupModel('MC-SB55KX').length,0);
});

test('SB70KM keeps its dust-filter assembly and inner-only mist tank care',()=>{
 const [c]=lookup.lookupModel('MC-SB70KM');assert.equal(c.releaseYear,2024);assert.match(c.lookupNote,/2024年10月発売/);assert.equal(c.suggestions.length,1);assert.equal(c.suggestions[0].intervalDays,7);assert.equal(c.suggestions[0].sourceUrl,c.manualUrl+'#page=9');
 assert.match(c.lookupNote,/ダストフィルター.*ティッシュ.*約24時間/);assert.ok(!c.lookupNote.includes('プリーツフィルター'));assert.ok(!c.lookupNote.includes('約30分'));
 assert.match(c.lookupNote,/スポンジをダストフィルター.*カチッ/);assert.match(c.lookupNote,/タンクは内側だけ水洗い可能/);assert.match(c.lookupNote,/常温の水道水以外は入れず.*水を捨て/);
 assert.match(c.lookupNote,/ミスト吹出口.*綿棒.*強く押しつけません/);assert.match(c.lookupNote,/回転ブラシだけ.*ベルト.*つめ.*解錠／施錠/);assert.match(c.lookupNote,/クリーンランプの色が変わらないときだけ.*乾拭き/);assert.match(c.lookupNote,/固定周期を設定しません/);
 assert.equal(lookup.lookupModel('MC-SB70K').length,0);
});

test('JP880K preserves wipe-only brush and monthly bag inspection from its FAQ',()=>{
 const [c]=lookup.lookupModel('MC-JP880K');assert.equal(c.releaseYear,2025);assert.match(c.lookupNote,/2025年5月発売/);assert.equal(c.suggestions.length,1);assert.equal(c.suggestions[0].intervalDays,30);assert.equal(c.suggestions[0].sourceUrl,c.manualUrl+'#page=9');
 assert.match(c.suggestions[0].frequency,/月1回程度/);assert.match(c.suggestions[0].conditions,/印刷16ページ/);assert.match(c.lookupNote,/回転ブラシは固く絞った布.*カバーだけ水洗い/);assert.match(c.lookupNote,/2か所の凹部/);
 assert.match(c.lookupNote,/紙パック交換後も吸込力が戻らないとき.*押し洗い.*もみ洗い.*十分乾燥.*ガイド/);assert.match(c.lookupNote,/オレンジ色.*点滅はもうすぐ交換、点灯はすぐ交換/);
 assert.match(c.lookupNote,/クリーンランプ.*乾拭き.*水洗い禁止/);assert.match(c.lookupNote,/固定周期を設定しません/);assert.ok(!c.lookupNote.includes('ベルト'));
 assert.equal(lookup.lookupModel('MC-JP880KX').length,0);
});


test('Panasonic D humidifiers retain daily tank and monthly component care',()=>{
 const models=['FE-KX07D','FE-KX05D','FE-KF07D'];const urls=new Set();
 for(const model of models){const [c]=lookup.lookupModel(model);assert.equal(c.categoryId,'humidifier');assert.equal(c.releaseYear,2026);assert.match(c.lookupNote,/2026年9月発売/);urls.add(c.manualUrl);
 assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[1,30,30,30,30]);assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')&&x.conditions.includes('電源プラグを抜いて')));
 assert.match(c.suggestions[2].conditions,/フロートは外しません.*本体から直接排水しません/);assert.match(c.suggestions[3].conditions,/押し洗い.*ブラシ.*洗濯機・乾燥機.*ぬれたまま.*赤線.*カチッ/);
 assert.match(c.suggestions[4].conditions,/ユニット部分だけ.*分解せず.*約30分.*2〜3回/);assert.match(c.lookupNote,/約10年.*1日8時間.*FE-ZKE07.*枠は捨てません/);assert.ok(!c.suggestions.some(x=>x.kind==='交換'));assert.equal(lookup.lookupModel(model+'X').length,0);
 }assert.equal(urls.size,3);
});


test('Panasonic C shared manual explicitly covers both 2025 models',()=>{
 const [a]=lookup.lookupModel('FE-KX07C'),[b]=lookup.lookupModel('FE-KX05C');
 for(const c of [a,b]){assert.equal(c.releaseYear,2025);assert.match(c.lookupNote,/2025年度モデル/);assert.equal(c.releaseSourceUrl,`https://panasonic.jp/kashitsu/products/${c.modelNumber}.html`);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[1,30,30,30,30]);
 assert.match(c.manualUrl,/KX07C_KX05C/);assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));assert.match(c.suggestions[2].conditions,/フロートは外しません/);assert.match(c.suggestions[3].conditions,/ぬれたまま.*赤線.*カチッ/);assert.match(c.suggestions[4].conditions,/ユニット部分だけ.*分解せず.*2〜3回/);assert.ok(!c.suggestions.some(x=>x.kind==='交換'));}
 assert.equal(a.manualUrl,b.manualUrl);assert.notEqual(a.manualUrl,lookup.lookupModel('FE-KX07D')[0].manualUrl);assert.equal(lookup.lookupModel('FE-KX07CX').length,0);
});
