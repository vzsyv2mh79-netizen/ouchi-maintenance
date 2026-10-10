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


test('KF07C uses its dedicated cover and care pages without inferring KF05C from the filename',()=>{
 const [c]=lookup.lookupModel('FE-KF07C');assert.equal(c.releaseYear,2025);assert.match(c.lookupNote,/2025年度モデル/);assert.equal(c.categoryId,'humidifier');assert.match(c.manualUrl,/000000003749189/);assert.notEqual(c.manualUrl,lookup.lookupModel('FE-KX07C')[0].manualUrl);
 assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[1,30,30,30,30]);assert.ok(c.suggestions.every(x=>x.sourceUrl.startsWith(c.manualUrl+'#page=')));assert.match(c.suggestions[2].conditions,/フロートは外しません/);assert.match(c.suggestions[3].conditions,/押し洗い.*ぬれたまま.*赤線.*カチッ/);assert.match(c.suggestions[4].conditions,/ユニット部分だけ.*分解せず.*2〜3回/);assert.ok(!c.suggestions.some(x=>x.kind==='交換'));
 assert.equal(lookup.lookupModel('FE-KF05C').length,0);assert.equal(lookup.lookupModel('FE-KF07CX').length,0);
});


test('YEX120B uses dehumidifier category and own fortnightly filter/monthly tank evidence',()=>{
 const [c]=lookup.lookupModel('F-YEX120B');assert.equal(c.categoryId,'dehumidifier-appliance');assert.equal(c.releaseYear,2024);assert.match(c.lookupNote,/2024年5月30日発売/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,30]);assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=19'&&x.conditions.includes('電源プラグを抜き、必ず排水')));
 assert.match(c.suggestions[0].conditions,/繊維部分を強くこすったり押したりしません.*つめ.*外したまま使わず/);assert.match(c.suggestions[1].conditions,/排水口を引っ張りません.*2〜3回.*フロートは外さず.*中性洗剤/);assert.match(c.lookupNote,/内部乾燥.*固定周期は設定しません.*約1時間/);assert.ok(!c.suggestions.some(x=>/内部乾燥|交換/.test(x.name)));assert.equal(lookup.lookupModel('F-YEX120BX').length,0);
});


test('YEX2026 preserve distinct filter washing and tank handling',()=>{
 const [a]=lookup.lookupModel('F-YEX200D'),[b]=lookup.lookupModel('F-YEX90D');
 for(const c of [a,b]){assert.equal(c.releaseYear,2026);assert.equal(c.categoryId,'dehumidifier-appliance');assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,30]);assert.match(c.lookupNote,/固定周期は設定しません.*タンクを外しません/);assert.equal(lookup.lookupModel(c.modelNumber+'X').length,0);}
 assert.match(a.suggestions[0].conditions,/本体側フィルター.*外したフィルター.*水洗い.*左右共用.*取っ手/);assert.match(a.suggestions[1].conditions,/タンクハンドル/);assert.equal(a.suggestions[0].sourceUrl,a.manualUrl+'#page=19');
 assert.equal(b.suggestions[0].sourceUrl,b.manualUrl+'#page=17');assert.equal(b.suggestions[1].sourceUrl,b.manualUrl+'#page=16');assert.match(b.suggestions[0].conditions,/取り付けた状態/);assert.ok(!b.suggestions[0].conditions.includes('水洗い'));assert.ok(!b.suggestions[1].conditions.includes('ハンドル'));assert.notEqual(a.manualUrl,b.manualUrl);
});


test('Sharp T190 uses weekly tank, fortnightly prefilter and monthly body care',()=>{
 const [c]=lookup.lookupModel('CV-T190');assert.equal(c.categoryId,'dehumidifier-appliance');assert.equal(c.releaseYear,2025);assert.match(c.lookupNote,/2025年3月13日発売/);assert.match(c.manualUrl,/cvt190_mn.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,14,30]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[c.manualUrl+'#page=16',c.manualUrl+'#page=17',c.manualUrl+'#page=17']);assert.ok(c.suggestions.every(x=>x.conditions.includes('運転を停止して電源プラグを抜き、排水')));assert.match(c.suggestions[0].conditions,/スポンジ.*フロート.*ふたをしっかり/);assert.match(c.suggestions[1].conditions,/約10分.*歯ブラシ.*陰干し.*前パネル/);assert.match(c.suggestions[2].conditions,/4か所.*絶対に水洗いしません.*40℃以下/);assert.equal(lookup.lookupModel('CV-T190X').length,0);
});


test('Mitsubishi P180YX uses own spread pages and conditional continuous drain check',()=>{
 const [c]=lookup.lookupModel('MJ-P180YX');assert.equal(c.releaseYear,2025);assert.equal(c.categoryId,'dehumidifier-appliance');assert.match(c.lookupNote,/2025年5月1日発売/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,90,14]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[c.manualUrl+'#page=10',c.manualUrl+'#page=11',c.manualUrl+'#page=10']);assert.match(c.suggestions[1].conditions,/約30分.*洗剤・熱湯・ブラシ・もみ洗い.*平ら.*ぬれたまま.*8回/);assert.match(c.suggestions[2].conditions,/場合だけ選択.*つまり・折れ曲がり・ひび割れ/);assert.match(c.lookupNote,/フロートは取り外さず.*MJPR-830VFT.*一律の交換周期は設定しません/);assert.equal(lookup.lookupModel('MJ-P180YXX').length,0);
});


test('PV250YX keeps own manual page and 831 filter instead of P180 parts',()=>{
 const [c]=lookup.lookupModel('MJ-PV250YX');assert.equal(c.releaseYear,2025);assert.equal(c.categoryId,'dehumidifier-appliance');assert.equal(c.releaseSourceUrl,'https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=348076');assert.match(c.manualUrl,/zt936z266h01.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,90,14]);assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=10'));assert.match(c.suggestions[1].conditions,/印刷19ページ.*約30分.*平ら.*8回/);assert.match(c.suggestions[2].conditions,/場合だけ選択/);assert.match(c.lookupNote,/MJPR-831VFT/);assert.ok(!c.lookupNote.includes('MJPR-830VFT'));assert.notEqual(c.manualUrl,lookup.lookupModel('MJ-P180YX')[0].manualUrl);assert.equal(lookup.lookupModel('MJ-PV250YXX').length,0);
});


test('M120YX keeps sensor and filter restrictions, own 829 part and conditional optical care',()=>{
 const [c]=lookup.lookupModel('MJ-M120YX');assert.equal(c.releaseYear,2025);assert.equal(c.categoryId,'dehumidifier-appliance');assert.match(c.manualUrl,/zt936z268h01.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,14,90]);assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=14'));assert.match(c.suggestions[0].conditions,/湿度センサー・室温センサー.*金属フィン.*ブラシ付きノズルは使いません/);assert.match(c.suggestions[1].conditions,/ブラシ付きノズルは使いません.*よく乾燥/);assert.match(c.suggestions[2].conditions,/約30分.*洗剤・熱湯・ブラシ・もみ洗い.*平ら.*陰干し.*ぬれたまま.*8回/);assert.match(c.lookupNote,/フロートは取り外しません.*乾いた綿棒.*運転中は手で動かしません.*MJPR-829VFT.*一律の交換周期は設定しません/);assert.ok(!c.suggestions.some(x=>/タンク|ムーブアイ|交換/.test(x.name)));assert.notEqual(c.manualUrl,lookup.lookupModel('MJ-PV250YX')[0].manualUrl);assert.equal(lookup.lookupModel('MJ-M120YXX').length,0);
});


test('M120WX keeps sensor and filter restrictions, own 829 part and conditional optical care',()=>{
 const [c]=lookup.lookupModel('MJ-M120WX');assert.equal(c.releaseYear,2024);assert.equal(c.categoryId,'dehumidifier-appliance');assert.match(c.manualUrl,/zt936z264h01.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,14,90]);assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=14'));assert.match(c.suggestions[0].conditions,/湿度センサー・室温センサー.*金属フィン.*ブラシ付きノズルは使いません/);assert.match(c.suggestions[1].conditions,/ブラシ付きノズルは使いません.*よく乾燥/);assert.match(c.suggestions[2].conditions,/約30分.*洗剤・熱湯・ブラシ・もみ洗い.*平ら.*陰干し.*ぬれたまま.*8回/);assert.match(c.lookupNote,/フロートは取り外しません.*乾いた綿棒.*運転中は手で動かしません.*MJPR-829VFT.*一律の交換周期は設定しません/);assert.ok(!c.suggestions.some(x=>/タンク|ムーブアイ|交換/.test(x.name)));assert.notEqual(c.manualUrl,lookup.lookupModel('MJ-PV250YX')[0].manualUrl);assert.equal(lookup.lookupModel('MJ-M120WXX').length,0);
});


test('P180WX uses dedicated 2024 manual, drain guard and 830 filter',()=>{
 const [c]=lookup.lookupModel('MJ-P180WX');assert.equal(c.releaseYear,2024);assert.equal(c.categoryId,'dehumidifier-appliance');assert.match(c.lookupNote,/2024年4月22日発売/);assert.match(c.manualUrl,/zt936z263h01.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,90,14]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[c.manualUrl+'#page=10',c.manualUrl+'#page=11',c.manualUrl+'#page=10']);assert.match(c.suggestions[1].conditions,/約30分.*洗剤・熱湯・ブラシ・もみ洗い.*平ら.*ぬれたまま.*8回/);assert.match(c.suggestions[2].conditions,/場合だけ選択.*つまり・折れ曲がり・ひび割れ.*氷点下/);assert.match(c.lookupNote,/フロートは取り外さず.*排水ガードを取り付けて.*MJPR-830VFT.*一律の交換周期は設定しません/);assert.ok(!c.lookupNote.includes('タンクふた'));assert.notEqual(c.manualUrl,lookup.lookupModel('MJ-P180YX')[0].manualUrl);assert.equal(lookup.lookupModel('MJ-P180WXX').length,0);
});


test('PV250WX uses dedicated 2024 manual, drain guard and 831 filter',()=>{
 const [c]=lookup.lookupModel('MJ-PV250WX');assert.equal(c.releaseYear,2024);assert.equal(c.categoryId,'dehumidifier-appliance');assert.match(c.lookupNote,/2024年4月22日発売/);assert.match(c.manualUrl,/zt936z262h01.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,90,14]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[c.manualUrl+'#page=10',c.manualUrl+'#page=10',c.manualUrl+'#page=10']);assert.match(c.suggestions[1].conditions,/約30分.*洗剤・熱湯・ブラシ・もみ洗い.*平ら.*ぬれたまま.*8回/);assert.match(c.suggestions[2].conditions,/場合だけ選択.*つまり・折れ曲がり・ひび割れ.*氷点下/);assert.match(c.lookupNote,/フロートは取り外さず.*排水ガードを取り付けて.*MJPR-831VFT.*一律の交換周期は設定しません/);assert.ok(!c.lookupNote.includes('タンクふた'));assert.notEqual(c.manualUrl,lookup.lookupModel('MJ-PV250YX')[0].manualUrl);assert.equal(lookup.lookupModel('MJ-PV250WXX').length,0);
});


test('PHDV24WX avoids washable-filter instructions and retains semiannual dry lens care',()=>{
 const [c]=lookup.lookupModel('MJ-PHDV24WX');assert.equal(c.releaseYear,2024);assert.equal(c.categoryId,'dehumidifier-appliance');assert.match(c.manualUrl,/zt936z261h01.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,180,14]);assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=13'));assert.match(c.suggestions[0].conditions,/HEPAフィルター・活性炭フィルターを外し.*スマートフラップ.*冷却口.*ニオイセンサー.*取り付け/);assert.match(c.suggestions[1].conditions,/正面と左側面の2か所.*乾いた綿棒.*水・アルコール・洗剤で拭きません/);assert.match(c.suggestions[2].conditions,/場合だけ選択.*ひび割れ.*氷点下/);assert.match(c.lookupNote,/活性炭フィルターのお手入れは不要.*水洗いして再使用できません.*MJPR-PHDVFT.*一緒に交換.*固定交換予定は設定しません/);assert.ok(!c.suggestions.some(x=>/つけ置き|交換/.test(x.name)));assert.equal(lookup.lookupModel('MJ-PHDV24WXX').length,0);
});


test('PHDV24YX avoids washable-filter instructions and retains semiannual dry lens care',()=>{
 const [c]=lookup.lookupModel('MJ-PHDV24YX');assert.equal(c.releaseYear,2025);assert.equal(c.categoryId,'dehumidifier-appliance');assert.match(c.manualUrl,/zt936z265h01.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,180,14]);assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=13'));assert.match(c.suggestions[0].conditions,/HEPAフィルター・活性炭フィルターを外し.*スマートフラップ.*冷却口.*ニオイセンサー.*取り付け/);assert.match(c.suggestions[1].conditions,/正面と左側面の2か所.*乾いた綿棒.*水・アルコール・洗剤で拭きません/);assert.match(c.suggestions[2].conditions,/場合だけ選択.*ひび割れ.*氷点下/);assert.match(c.lookupNote,/活性炭フィルターのお手入れは不要.*水洗いして再使用できません.*MJPR-PHDVFT.*一緒に交換.*固定交換予定は設定しません/);assert.ok(!c.suggestions.some(x=>/つけ置き|交換/.test(x.name)));assert.equal(lookup.lookupModel('MJ-PHDV24YXX').length,0);
});


test('PHDV24ZX avoids washable-filter instructions with electrostatic filter terminology and retains semiannual dry lens care',()=>{
 const [c]=lookup.lookupModel('MJ-PHDV24ZX');assert.equal(c.releaseYear,2026);assert.equal(c.categoryId,'dehumidifier-appliance');assert.match(c.manualUrl,/zt936z279h01.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,180,14]);assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=13'));assert.match(c.suggestions[0].conditions,/静電フィルター・活性炭フィルターを外し.*スマートフラップ.*冷却口.*ニオイセンサー.*取り付け/);assert.match(c.suggestions[1].conditions,/正面と左側面の2か所.*乾いた綿棒.*水・アルコール・洗剤で拭きません/);assert.match(c.suggestions[2].conditions,/場合だけ選択.*ひび割れ.*氷点下/);assert.match(c.lookupNote,/活性炭フィルターのお手入れは不要.*洗っても再使用できません.*MJPR-PHDVFT.*一緒に交換.*固定交換予定は設定しません/);assert.ok(!c.suggestions.some(x=>/つけ置き|交換/.test(x.name)));assert.equal(lookup.lookupModel('MJ-PHDV24ZXX').length,0);assert.ok(!JSON.stringify(c).includes('HEPA'));assert.match(c.lookupNote,/タンクふた/);
});


test('M120ZX keeps sensor and filter restrictions, own 829 part and conditional optical care',()=>{
 const [c]=lookup.lookupModel('MJ-M120ZX');assert.equal(c.releaseYear,2026);assert.equal(c.categoryId,'dehumidifier-appliance');assert.match(c.manualUrl,/zt936z282h01.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,14,90]);assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=14'));assert.match(c.suggestions[0].conditions,/湿度センサー・室温センサー.*金属フィン.*ブラシ付きノズルは使いません/);assert.match(c.suggestions[1].conditions,/ブラシ付きノズルは使いません.*よく乾燥/);assert.match(c.suggestions[2].conditions,/約30分.*洗剤・熱湯・ブラシ・もみ洗い.*平ら.*陰干し.*ぬれたまま.*8回/);assert.match(c.lookupNote,/フロートは取り外しません.*乾いた綿棒.*運転中は手で動かしません.*MJPR-829VFT.*一律の交換周期は設定しません/);assert.ok(!c.suggestions.some(x=>/タンク|ムーブアイ|交換/.test(x.name)));assert.notEqual(c.manualUrl,lookup.lookupModel('MJ-PV250YX')[0].manualUrl);assert.equal(lookup.lookupModel('MJ-M120ZXX').length,0);
});


test('P180ZX uses dedicated 2026 manual, tank lid and 830 filter',()=>{
 const [c]=lookup.lookupModel('MJ-P180ZX');assert.equal(c.releaseYear,2026);assert.equal(c.categoryId,'dehumidifier-appliance');assert.match(c.lookupNote,/2026年5月22日発売/);assert.match(c.manualUrl,/zt936z281h01.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,90,14]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[c.manualUrl+'#page=10',c.manualUrl+'#page=11',c.manualUrl+'#page=10']);assert.match(c.suggestions[1].conditions,/約30分.*洗剤・熱湯・ブラシ・もみ洗い.*平ら.*ぬれたまま.*8回/);assert.match(c.suggestions[2].conditions,/場合だけ選択.*つまり・折れ曲がり・ひび割れ.*氷点下/);assert.match(c.lookupNote,/フロートは取り外さず.*タンクふたを取り付けて.*MJPR-830VFT.*一律の交換周期は設定しません/);assert.notEqual(c.manualUrl,lookup.lookupModel('MJ-P180YX')[0].manualUrl);assert.equal(lookup.lookupModel('MJ-P180ZXX').length,0);
});


test('PV250ZX uses dedicated 2026 manual, tank lid and 831 filter',()=>{
 const [c]=lookup.lookupModel('MJ-PV250ZX');assert.equal(c.releaseYear,2026);assert.equal(c.categoryId,'dehumidifier-appliance');assert.match(c.lookupNote,/2026年5月22日発売/);assert.match(c.manualUrl,/zt936z280h02.pdf$/);assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,90,14]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[c.manualUrl+'#page=10',c.manualUrl+'#page=10',c.manualUrl+'#page=10']);assert.match(c.suggestions[1].conditions,/約30分.*洗剤・熱湯・ブラシ・もみ洗い.*平ら.*ぬれたまま.*8回/);assert.match(c.suggestions[2].conditions,/場合だけ選択.*つまり・折れ曲がり・ひび割れ.*氷点下/);assert.match(c.lookupNote,/フロートは取り外さず.*タンクふたを取り付けて.*MJPR-831VFT.*一律の交換周期は設定しません/);assert.notEqual(c.manualUrl,lookup.lookupModel('MJ-PV250YX')[0].manualUrl);assert.equal(lookup.lookupModel('MJ-PV250ZXX').length,0);
});


test('IJC-R65 uses its own monthly-care manual without borrowing washable-filter instructions', () => {
 const [c] = lookup.lookupModel('ｉｊｃ－ｒ６５');
 assert.equal(c.maker, 'アイリスオーヤマ');
 assert.equal(c.releaseYear, 2025);
 assert.equal(c.categoryId, 'dehumidifier-appliance');
 assert.match(c.manualUrl, /108184.pdf$/);
 assert.deepEqual(c.suggestions.map(x => x.intervalDays), [30,30,30]);
 assert.deepEqual(c.suggestions.map(x => x.sourceUrl), [c.manualUrl+'#page=30',c.manualUrl+'#page=31',c.manualUrl+'#page=31']);
 assert.match(c.suggestions[0].conditions, /本体は水洗いせず.*40℃以下.*洗剤分/);
 assert.match(c.suggestions[1].conditions, /ふたを外して水洗い.*よく乾かし.*フロートは絶対に外しません/);
 assert.match(c.suggestions[2].conditions, /掃除機.*ブラシ付きノズルは使いません/);
 assert.ok(!/水洗い|つけ置き/.test(c.suggestions[2].conditions));
 assert.ok(c.suggestions.every(x => x.conditions.includes('電源プラグを抜き')));
 assert.equal(lookup.lookupModel('IJC-R650').length, 0);
 assert.ok(lookup.supportedModels.includes('IJC-R65'));
});


test('2026 Iris dehumidifiers cite their dedicated manuals and preserve monthly cleaning restrictions', () => {
 for (const [model,id] of [['AJ-C48A','114742'],['KJ-C481','114743']]) {
  const [c]=lookup.lookupModel(model);
  assert.equal(c.releaseYear,2026);
  assert.equal(c.categoryId,'dehumidifier-appliance');
  assert.ok(c.manualUrl.endsWith(id+'.pdf'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,30,30]);
  assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[c.manualUrl+'#page=32',c.manualUrl+'#page=33',c.manualUrl+'#page=33']);
  assert.match(c.lookupNote,/2026年5月発売.*両手.*フロートを絶対に外さず/);
  assert.match(c.suggestions[0].conditions,/本体は水洗いせず.*40℃以下/);
  assert.match(c.suggestions[1].conditions,/水洗い.*よく乾かし.*フロートは絶対に外しません/);
  assert.match(c.suggestions[2].conditions,/掃除機.*ブラシ付きノズルは使いません/);
  assert.ok(!/水洗い|つけ置き/.test(c.suggestions[2].conditions));
  assert.equal(lookup.lookupModel(model+'X').length,0);
 }
 assert.notEqual(lookup.lookupModel('AJ-C48A')[0].manualUrl,lookup.lookupModel('KJ-C481')[0].manualUrl);
});


test('2026 Iris evaporative humidifiers separate refill cleaning from monthly component care', () => {
 for(const [model,id] of [['AHM-MVU35A','214884'],['KHM-MVU401','214882']]) {
  const [c]=lookup.lookupModel(model);
  assert.equal(c.releaseYear,2026);assert.equal(c.categoryId,'humidifier');
  assert.ok(c.manualUrl.endsWith(id+'.pdf'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,30,30,30]);
  assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[23,24,30,31].map(n=>c.manualUrl+'#page='+n));
  assert.match(c.lookupNote,/2026年9月発売.*給水のたび.*固定の日数.*720時間/);
  assert.ok(!c.suggestions.some(x=>/水タンク/.test(x.name)));
  assert.match(c.suggestions[0].conditions,/本体は水洗いせず.*掃除機/);
  assert.match(c.suggestions[1].conditions,/水洗い.*台所用洗剤.*40℃以上.*使いません/);
  assert.match(c.suggestions[2].conditions,/ファンを外して.*水洗い.*本体は水洗いしません/);
  assert.match(c.suggestions[3].conditions,/下側の水タンク.*中央に入れたまま.*2〜5分.*2L.*15g.*濃度を高くしません/);
  assert.ok(c.suggestions.every(x=>x.conditions.includes('ACアダプター')));
  assert.equal(lookup.lookupModel(model+'X').length,0);
 }
 assert.notEqual(lookup.lookupModel('AHM-MVU35A')[0].manualUrl,lookup.lookupModel('KHM-MVU401')[0].manualUrl);
});


test('Iris steam humidifiers preserve model-specific citric amounts and powered cleaning cycle', () => {
 for(const [model,id,g,l] of [['AHM-MHU40A','211209',20,2],['AHM-MHU60A','211213',30,3],['KHM-MHU401','211210',20,2],['KHM-MHU601','211215',30,3]]) {
  const [c]=lookup.lookupModel(model);
  assert.equal(c.releaseYear,2025);assert.equal(c.categoryId,'humidifier');
  assert.ok(c.manualUrl.endsWith(id+'.pdf'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,60]);
  assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[26,27,25].map(n=>c.manualUrl+'#page='+n));
  assert.match(c.lookupNote,/使用するたび.*固定の日数/);
  assert.match(c.suggestions[0].conditions,/完全に冷めて.*よく絞った/);
  assert.match(c.suggestions[1].conditions,/パッキンは外しません/);
  assert.match(c.suggestions[1].conditions,/洗剤.*使いません.*食器洗い乾燥機/);
  const wash=c.suggestions[2].conditions;
  assert.ok(wash.includes('クエン酸'+g+'g'));assert.ok(wash.includes('総量'+l+'L'));
  assert.match(wash,/満水線.*差し込み.*「強」で2時間.*完全に冷めてから湯を捨て.*すすぎ/);
  assert.equal(lookup.lookupModel(model+'X').length,0);
 }
});


test('2025 Iris evaporative humidifiers separate refill cleaning from monthly component care', () => {
 for(const [model,id] of [['AHM-MVU55A','209038'],['KHM-MVU601','209039']]) {
  const [c]=lookup.lookupModel(model);
  assert.equal(c.releaseYear,2025);assert.equal(c.categoryId,'humidifier');
  assert.ok(c.manualUrl.endsWith(id+'.pdf'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,30,30,30]);
  assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[23,24,30,31].map(n=>c.manualUrl+'#page='+n));
  assert.match(c.lookupNote,/2025年8月発売.*給水のたび.*固定の日数.*720時間/);
  assert.match(c.suggestions[2].name,/水タンク/);
  assert.match(c.suggestions[0].conditions,/本体は水洗いせず.*掃除機/);
  assert.match(c.suggestions[1].conditions,/水洗い.*台所用洗剤.*40℃以上.*使いません/);
  assert.match(c.suggestions[2].conditions,/水タンク、ファンカバー、ファンを外して.*水洗い.*本体は水洗いしません/);
  assert.match(c.suggestions[3].conditions,/下側の水タンク.*中央に入れたまま.*2〜5分.*3L.*20g.*濃度を高くしません/);
  assert.ok(c.suggestions.every(x=>x.conditions.includes('ACアダプター')));
  assert.equal(lookup.lookupModel(model+'X').length,0);
 }
 assert.notEqual(lookup.lookupModel('AHM-MVU55A')[0].manualUrl,lookup.lookupModel('KHM-MVU601')[0].manualUrl);
});


test('Iris hybrid humidifiers use their own page offsets and unpowered tank soak', () => {
 for(const [model,id,offset] of [['AHM-HUT55A','112900',0],['KHM-HUT551','112902',3]]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2025);assert.equal(c.categoryId,'humidifier');assert.ok(c.manualUrl.endsWith(id+'.pdf'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[14,14,30,60]);
  assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[25,25,26,23].map(n=>c.manualUrl+'#page='+(n+offset)));
  assert.match(c.lookupNote,/矢印方向.*本体は水洗いせず.*アロマ.*周期未指定.*固定の日数/);
  assert.match(c.suggestions[0].conditions,/ブラシ.*綿棒.*やさしく.*フロート.*上下/);
  assert.match(c.suggestions[1].conditions,/ヒーター.*布.*フェルト.*取り外して洗い/);
  assert.match(c.suggestions[2].conditions,/ほこりがたまっていたら.*乾いた布/);
  assert.match(c.suggestions[3].conditions,/40℃以下.*3L.*20g.*2〜5分.*濃度を高くしません/);
  assert.doesNotMatch(c.suggestions[3].conditions,/2時間|「強」|電源を入れ/);
  assert.equal(lookup.lookupModel(model+'X').length,0);
 }
});


test('2024 Iris MH60 steam humidifiers retain the explicit 2h timer cleaning setting', () => {
 for(const [model,id] of [['AHM-MH60','298878'],['KHM-MH60','299193']]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2024);assert.ok(c.manualUrl.endsWith(id+'.pdf'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,60]);
  assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[16,15,14].map(n=>c.manualUrl+'#page='+n));
  assert.doesNotMatch(c.lookupNote,/使用するたび|使うたび/);
  assert.match(c.suggestions[0].conditions,/完全に冷めて.*絞った/);
  assert.match(c.suggestions[1].conditions,/パッキンは外しません.*16ページ/);
  assert.match(c.suggestions[2].conditions,/30g.*40℃以下.*3L.*濃度を高くしません.*満水線.*差し込み.*「強」.*タイマーボタンで「2h」.*完全に冷めてから湯を捨て.*すすぎ/);
  assert.equal(lookup.lookupModel(model+'X').length,0);
 }
});


test('AAP-AH50A keeps daily humidification care separate from non-cleanable air filters', () => {
 const [c]=lookup.lookupModel('AAP-AH50A');assert.equal(c.releaseYear,2024);assert.equal(c.categoryId,'air-purifier');
 assert.ok(c.manualUrl.endsWith('289205.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[1,1,30,30,30,730]);
 assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[38,38,40,40,41,44].map(n=>c.manualUrl+'#page='+n));
 assert.match(c.lookupNote,/集じんフィルター・脱臭フィルターはお手入れできません.*掃除機.*水洗い/);
 assert.match(c.lookupNote,/水がたまったとき.*固定の日数.*約3秒/);
 assert.match(c.suggestions[1].conditions,/トレーしきり.*給水フロート.*水位フロート.*外しません/);
 assert.match(c.suggestions[3].conditions,/外したまま運転しません.*破損.*交換/);
 assert.match(c.suggestions[4].conditions,/分解せず.*水3L.*約18g.*溝.*後ろ/);
 assert.match(c.suggestions[5].conditions,/1日8時間.*水質.*におい.*水が減らない.*傷み・縮み.*枠は捨てず.*5か所/);
 assert.equal(lookup.lookupModel('AAP-AH50AX').length,0);
});


test('KAP-AH501 uses its dedicated care pages one page after AAP-AH50A', () => {
 const [c]=lookup.lookupModel('KAP-AH501');assert.equal(c.releaseYear,2024);assert.ok(c.manualUrl.endsWith('289204.pdf'));
 assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[1,1,30,30,30,730]);
 assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[39,39,41,41,42,45].map(n=>c.manualUrl+'#page='+n));
 assert.match(c.lookupNote,/38・43ページ.*44ページ.*約3秒.*38ページ/);
 assert.match(c.suggestions[4].conditions,/分解せず.*3L.*約18g.*後ろ/);
 assert.match(c.suggestions[5].conditions,/1日8時間.*枠は捨てず.*5か所/);
 assert.equal(lookup.lookupModel('KAP-AH501X').length,0);
});

test('2024 Iris ultrasonic humidifiers preserve internal-only washing and silver bead soak', () => {
 for(const [model,id] of [['AHM-UU28B','107242'],['KHM-UU281','107243']]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2024);assert.equal(c.categoryId,'humidifier');assert.ok(c.manualUrl.endsWith(id+'.pdf'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30]);assert.ok(c.suggestions.every(x=>x.sourceUrl===c.manualUrl+'#page=24'));
  assert.match(c.lookupNote,/使うたび.*吹き出し口.*排水方向.*本体内部だけ.*外側に水をかけず.*開けず.*上部のみ/);
  assert.match(c.lookupNote,/吸気口.*ほこりがつまっていたら.*十分乾燥.*フィルターなし.*周期未指定.*固定の日数/);
  assert.match(c.suggestions[0].conditions,/ブラシ.*綿棒.*やさしく.*傷/);
  assert.match(c.suggestions[1].conditions,/中央に入れたまま.*40℃以下.*3L.*20g.*浸る量.*2〜5分.*濃度を高くしません.*開けません/);
  assert.doesNotMatch(c.suggestions[1].conditions,/2時間|「強」|電源を入れ/);
  assert.equal(lookup.lookupModel(model+'X').length,0);
 }
});


test('2025 Iris standard air purifiers preserve own manual offsets and conditional filter care', () => {
 for(const [model,id,page,part] of [['AAP-S20C','210171',22,'FLS-S202'],['AAP-S30C','210171',22,'FLS-S302'],['AAP-S40A','210171',22,'FLS-S40'],['KAP-S203','210177',21,'FLS-S202'],['KAP-S303','210177',21,'FLS-S302'],['KAP-S401','210177',21,'FLS-S40']]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2025);assert.equal(c.categoryId,'air-purifier');assert.ok(c.manualUrl.endsWith(id+'.pdf'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,730]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[page,page+1].map(n=>c.manualUrl+'#page='+n));
  assert.match(c.lookupNote,/汚れが気になったとき.*外側.*網状プレフィルター.*絶対に水洗いせず.*強く押しません.*固定の日数/);
  assert.match(c.suggestions[0].conditions,/ACアダプター.*本体は水洗いしません.*背面の吸気口/);
  assert.match(c.suggestions[1].conditions,/1日5本.*運転頻度.*ランプの点灯に関わらず.*点灯していなくても.*モード.*長押し/);
  assert.ok(c.suggestions[1].conditions.includes(part));assert.equal(lookup.lookupModel(model+'X').length,0);
 }
});


test('2025 Iris humidifying air purifiers separate refill, silver case and filter care', () => {
 for(const [model,id,page,month] of [['AAP-SH20B','210164',26,9],['AAP-SH30B','210164',26,9],['AAP-SH40A','210164',26,11],['KAP-SH202','209803',25,9],['KAP-SH302','209803',25,9],['KAP-SH401','209803',25,9]]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2025);assert.equal(c.categoryId,'air-purifier');assert.ok(c.manualUrl.endsWith(id+'.pdf'));assert.ok(c.lookupNote.includes('2025年'+month+'月'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,30,30,30,730,730]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[page,page+2,page+2,page+3,page+6,page+6].map(n=>c.manualUrl+'#page='+n));
  assert.match(c.lookupNote,/給水のたび.*外側の網状プレフィルター.*絶対に水洗いせず.*固定の日数/);
  assert.match(c.suggestions[2].conditions,/銀ビーズケース.*2〜5分.*40℃以下.*3L.*20g/);
  assert.match(c.suggestions[3].conditions,/台所用洗剤.*40℃以上.*取り付けずに運転しません.*30分〜2時間.*最長2時間.*重曹110g.*約60分.*混ぜて使用しません/);
  assert.match(c.suggestions[4].conditions,/1日5本.*点灯に関わらず.*点灯していなくても.*モード.*長押し/);
  assert.match(c.suggestions[5].conditions,/1日8時間.*水質.*水が減らない.*型くずれ.*全面.*不燃物/);
  assert.equal(lookup.lookupModel(model+'X').length,0);
 }
});


test('2026 Iris vacuums preserve model-specific exhaust washing and power isolation', () => {
 for(const [model,id,pages] of [['SCA-113','215097',[25,26,30,30]],['SCD-186P','213778',[32,33,36,36,37]],['SCD-186PS','213781',[36,37,40,40,41]]]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2026);assert.equal(c.categoryId,'vacuum');assert.ok(c.manualUrl.endsWith(id+'.pdf'));assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),pages.map(n=>c.manualUrl+'#page='+n));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),pages.map((_,i)=>i===0?7:30));
  assert.match(c.lookupNote,/ごみすてライン.*固定の日数.*固定の交換年数/);assert.match(c.suggestions[1].conditions,/サイクロンユニット.*スポンジフィルター.*約24時間.*熱風.*カチッ/);
  if(model==='SCA-113'){assert.match(c.suggestions[1].conditions,/排気フィルターはごみをはたき落とします。水洗いする部品に含めません/);assert.match(c.suggestions[0].conditions,/電源コードをコンセントから抜いて/);}
  else{assert.match(c.suggestions[4].conditions,/ブラシの溝.*約24時間.*前端内側/);if(model==='SCD-186P'){assert.match(c.suggestions[1].conditions,/排気フィルターはごみをはたき落とした後、水洗い/);assert.match(c.suggestions[0].conditions,/充電アダプターを本体から抜いて/);}else{assert.match(c.suggestions[1].conditions,/クリーニングブラシ.*谷に沿って.*強く押し付けて/);assert.match(c.suggestions[0].conditions,/充電スタンドから外して.*すき間ノズル・充電スタンド/);}}
  assert.equal(lookup.lookupModel(model+'X').length,0);
 }
});


test('2026 SCD-R5PD separates weekly cup, monthly brush and dock maintenance', () => {
 const [c]=lookup.lookupModel('SCD-R5PD');assert.equal(c.releaseYear,2026);assert.equal(c.categoryId,'vacuum');assert.ok(c.manualUrl.endsWith('214991.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,30,30,30,60,60,60]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[37,38,41,41,42,34,44,44].map(n=>c.manualUrl+'#page='+n));
 assert.match(c.suggestions[1].conditions,/スポンジフィルターの汚れ.*約30分.*クリーニングブラシ.*谷に沿って.*強く押し付け.*約24時間/);
 assert.match(c.suggestions[4].conditions,/ロックスイッチをスライド.*ブラシの溝.*約24時間.*前端内側/);
 assert.match(c.suggestions[5].conditions,/運転中.*取り外しません.*ごみ箱の上.*フィルター類を忘れず/);
 assert.match(c.suggestions[6].conditions,/スポンジフィルターは軽くはたいて水洗い.*不織布フィルターは水洗いの対象に含めず交換/);assert.equal(c.suggestions[7].kind,'交換');assert.match(c.suggestions[7].frequency,/早い側の60日/);assert.match(c.lookupNote,/固定の交換年数は設定していません/);assert.equal(lookup.lookupModel('SCD-R5PDX').length,0);
});


test('2026 dock cleaners preserve mop, sensor and slide-lock instructions', () => {
 for (const [model,pdf] of [['SCD-124PD','212764'],['SCD-L4PD','212765']]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2026);assert.ok(c.manualUrl.endsWith(pdf+'.pdf'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,7,7,30,30,30,60,60,60]);
  assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[41,41,42,42,46,46,47,38,49,49].map(n=>c.manualUrl+'#page='+n));
  assert.match(c.suggestions[1].conditions,/先端のボタン.*モップ部分を水洗い/);assert.match(c.suggestions[2].conditions,/割りばし.*布を巻き付け/);
  assert.match(c.suggestions[3].conditions,/スポンジフィルターと排気フィルター.*約30分.*谷に沿って.*強く押し付け.*約24時間/);
  assert.match(c.suggestions[6].conditions,/カバーを押さえながらロックスイッチをスライドさせて固定/);
  assert.match(c.suggestions[7].conditions,/運転中.*取り外しません.*フィルター類を忘れず/);
  assert.match(c.suggestions[8].conditions,/不織布フィルターは水洗いの対象に含めず交換/);assert.equal(c.suggestions[9].kind,'交換');assert.equal(lookup.lookupModel(model+'X').length,0);
 }
});
test('FBD-41 distinguishes cloth-free swab sensors, washable holder and quarterly sponge', () => {
 const [c]=lookup.lookupModel('FBD-41');assert.ok(c.manualUrl.endsWith('211188.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,30,30,90]);
 assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[31,31,32,33,34].map(n=>c.manualUrl+'#page='+n));
 assert.match(c.suggestions[0].conditions,/薄めた中性洗剤を使用できます/);assert.match(c.suggestions[1].conditions,/左右のセンサーを綿棒/);
 assert.match(c.suggestions[2].conditions,/ロックスイッチを押して.*約24時間.*カチッ/);
 assert.match(c.suggestions[3].conditions,/汚れている場合.*紙パックは水洗いしません/);
 assert.match(c.suggestions[4].conditions,/約24時間.*必ず取り付け.*全周をすき間のない.*カバーをしっかり/);assert.equal(lookup.lookupModel('FBD-41X').length,0);
});


test('FBD-D1 uses its dedicated 2026 manual for swab sensors and quarterly sponge', () => {
 const [c]=lookup.lookupModel('FBD-D1');assert.equal(c.releaseYear,2026);assert.ok(c.manualUrl.endsWith('211190.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,30,30,90]);
 assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[31,31,32,33,34].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[1].conditions,/左右のセンサーを綿棒/);assert.match(c.suggestions[2].conditions,/ロックスイッチを押して/);assert.match(c.suggestions[4].conditions,/約24時間.*必ず取り付け.*全周をすき間のない/);assert.equal(lookup.lookupModel('FBD-D1X').length,0);
});
test('HCD-23 separates two-month cup from quarterly sponge and forbids filter brushing', () => {
 const [c]=lookup.lookupModel('HCD-23');assert.equal(c.releaseYear,2026);assert.ok(c.manualUrl.endsWith('212120.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,60,90]);
 assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[24,24,25].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[1].conditions,/USB充電ケーブル.*排気フィルターはブラシなどでこすりません.*約24時間/);assert.match(c.suggestions[2].conditions,/全周をすき間のない.*必ず取り付け/);assert.match(c.lookupNote,/固定の交換年数は設定していません/);assert.equal(lookup.lookupModel('HCD-23X').length,0);
});
test('HBD-41 preserves passive head clog inspection rather than inventing rotating-brush care', () => {
 const [c]=lookup.lookupModel('HBD-41');assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith('210537.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,90]);
 assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[30,31,31,31,32].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[1].conditions,/紙パックは水洗いしません/);assert.match(c.suggestions[3].conditions,/吸い込み口と内部.*ピンセット/);assert.ok(c.suggestions.every(x=>!x.name.includes('回転ブラシ')));assert.match(c.suggestions[4].conditions,/約24時間.*全周をすき間のない.*カバーをしっかり/);assert.equal(lookup.lookupModel('HBD-41X').length,0);
});


test('2025 paper-pack sticks preserve each brush removal and weekly mop/monthly case split', () => {
 for (const [model,pdf,days,pages,remove,restore] of [
  ['SBD-78DCBLP','210913',[7,7,30,30,30,30,30,90],[37,37,38,38,39,40,41,42],/押し下げて後ろに引き.*横側から引き出し/,/内側に引っかけて固定/],
  ['SBD-202P','209762',[7,7,7,30,30,30,30,30,90],[42,42,42,43,43,44,45,46,47],/ロックスイッチをスライド/,/押し込みながらロックスイッチをスライド/],
  ['SBD-78P','210062',[7,30,30,30,30,90],[33,34,34,35,36,38],/押し下げて手前に引き/,/カチッ/]]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith(pdf+'.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),days);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),pages.map(n=>c.manualUrl+'#page='+n));
  const b=c.suggestions.find(x=>x.name==='回転ブラシのお手入れ');assert.match(b.conditions,remove);assert.match(b.conditions,restore);assert.match(b.conditions,/約24時間/);
  assert.match(c.suggestions.at(-1).conditions,/約24時間.*必ず取り付け.*全周をすき間のない/);
  if(model!=='SBD-78P'){assert.equal(c.suggestions.find(x=>x.name==='静電モップのお手入れ').intervalDays,7);assert.equal(c.suggestions.find(x=>x.name==='モップ帯電ケースのお手入れ').intervalDays,30);}else assert.ok(!c.suggestions.some(x=>x.name.includes('モップ')));
  assert.equal(lookup.lookupModel(model+'X').length,0);
 }
});
test('2025 cyclone sticks do not inherit PD weekly cup or dock filter advice', () => {
 for(const [model,pdf,pages,remove] of [['SCD-230P','210307',[42,42,42,43,47,47,48,49],/つめを押し上げ/],['SCD-124P','209066',[43,43,43,44,48,48,49,50],/ロックスイッチを横にスライド/]]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith(pdf+'.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,7,30,30,30,30,30]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),pages.map(n=>c.manualUrl+'#page='+n));
  assert.match(c.suggestions[3].conditions,/ボタンを押さずに無理に外しません.*谷に沿って.*強く押し付け.*約24時間.*熱風/);assert.doesNotMatch(c.suggestions[3].conditions,/30分/);assert.match(c.suggestions[6].conditions,remove);assert.match(c.suggestions[6].conditions,/カチッ/);assert.ok(!c.suggestions.some(x=>x.name.includes('ドック')));assert.equal(lookup.lookupModel(model+'X').length,0);
 }
});


test('2025 HBD-C1 and HBD-31 use dedicated handheld manuals and avoid stick-cleaner care', () => {
 for (const [model,pdf,page] of [['HBD-C1','209089',28],['HBD-31','209088',27]]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith(pdf+'.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,90]);
  assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[page,page,page+1].map(n=>c.manualUrl+'#page='+n));assert.ok(c.suggestions.every(x=>!/回転ブラシ|延長パイプ|ほこり感知|ダストカップ/.test(x.name)));
  assert.match(c.suggestions[1].conditions,/汚れている場合.*ホルダーを水洗い.*約24時間/);assert.match(c.suggestions[2].conditions,/約24時間.*必ず取り付け.*全周をすき間のない.*カバーをしっかり/);assert.equal(lookup.lookupModel(model+'X').length,0);
 }
 const [c1]=lookup.lookupModel('HBD-C1');const [h31]=lookup.lookupModel('HBD-31');assert.match(c1.suggestions[0].name,/フレキシブルホース/);assert.doesNotMatch(h31.suggestions[0].name,/フレキシブルホース/);
});


test('SBD-G5P preserves weekly mop and quarterly mandatory sponge from its own manual', () => {
 const [c]=lookup.lookupModel('SBD-G5P');assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith('210064.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,30,30,30,30,30,90]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[37,37,38,38,39,40,41,42].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[5].conditions,/スライドさせて解除.*約24時間.*ロックスイッチで固定/);assert.match(c.suggestions[7].conditions,/約24時間.*必ず取り付け.*全周をすき間のない/);assert.ok(!c.suggestions.some(x=>x.name.includes('センサー')));assert.equal(lookup.lookupModel('SBD-G5PX').length,0);
});
test('SCD-R4P uses monthly mop and split cyclone with its own thirty-minute soak guidance', () => {
 const [c]=lookup.lookupModel('SCD-R4P');assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith('210061.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,30]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[39,40,43,43,44,45].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[1].conditions,/反時計回り.*約30分.*谷に沿って.*強く押し付け.*約24時間.*熱風.*時計回り/);assert.match(c.suggestions[4].conditions,/スライドさせて解除.*ロックスイッチで固定/);assert.equal(c.suggestions[5].intervalDays,30);assert.ok(!c.suggestions.some(x=>x.name.includes('センサー')||x.name.includes('ドック')));assert.equal(lookup.lookupModel('SCD-R4PX').length,0);
});


test('FCA-31PZ1 uses weekly swab sensors and monthly passive bedding head care', () => {
 const [c]=lookup.lookupModel('FCA-31PZ1');assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith('209040.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,30]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[24,24,25].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[1].conditions,/電源プラグを抜いて.*左右のダニちりセンサーを綿棒/);assert.match(c.suggestions[2].conditions,/毛取りブラシ.*ピンセット.*たたきパッド.*柔らかいブラシ/);assert.ok(c.suggestions.every(x=>!x.name.includes('回転ブラシ')&&!x.name.includes('ダストカップ')));assert.match(c.lookupNote,/使い捨てフィルターを外して捨て.*日陰.*洗濯機・ドライヤー.*左右のレバー.*固定周期/);assert.doesNotMatch(c.lookupNote,/24時間|30分/);assert.equal(lookup.lookupModel('FCA-31PZ1X').length,0);
});


test('SBD-200PN follows monthly sensor wiping rather than the overview wash label', () => {
 const [c]=lookup.lookupModel('SBD-200PN');assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith('208703.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,30,90]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[29,30,31,31,32,34,35].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[1].conditions,/アダプターを本体から抜いて.*左右.*綿棒.*水洗いせず/);assert.match(c.suggestions[4].conditions,/押し下げて手前.*24時間.*カチッ/);assert.match(c.suggestions[6].conditions,/全周をすき間のない.*必ず取り付け/);assert.equal(lookup.lookupModel('SBD-200PNX').length,0);
});
test('SCD-P3P requires thirty-minute exhaust soak without brushing and no invented sensor/mop task', () => {
 const [c]=lookup.lookupModel('SCD-P3P');assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith('209002.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[35,36,40,41].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[1].conditions,/約30分.*流水.*ブラシなどでこすりません.*約24時間.*熱風.*背面の穴.*フィルター類を忘れず/);assert.ok(c.suggestions.every(x=>!/センサー|モップ|延長パイプ/.test(x.name)));assert.match(c.suggestions[3].conditions,/押し下げて手前.*24時間.*カチッ/);assert.equal(lookup.lookupModel('SCD-P3PX').length,0);
});


test('SBD-T3P keeps weekly mop, quarterly sponge and its click-fit brush cover', () => {
 const [c]=lookup.lookupModel('SBD-T3P');assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith('209850.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,7,30,30,30,30,30,90]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[41,41,41,42,42,43,44,45,46].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[6].conditions,/スライド.*24時間.*前端内側.*カチッ/);assert.doesNotMatch(c.suggestions[6].conditions,/スライドさせて固定/);assert.match(c.suggestions[8].conditions,/24時間.*全周をすき間のない.*必ず取り付け/);assert.equal(lookup.lookupModel('SBD-T3PX').length,0);
});
test('SCD-L4P uses a press-release upper-hole cup without the U2P soak or split', () => {
 const [c]=lookup.lookupModel('SCD-L4P');assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith('209220.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,7,30,30,30,30,30]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[42,42,42,43,46,46,47,48].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[3].conditions,/ボタンを押して.*谷に沿って.*強く押し付け.*24時間.*熱風.*上側の穴/);assert.doesNotMatch(c.suggestions[3].conditions,/30分|反時計|下端/);assert.match(c.suggestions[6].conditions,/スライドさせて固定/);assert.equal(lookup.lookupModel('SCD-L4PX').length,0);
});
test('SCD-U2P uses a slide-release lower-tab cup and monthly mop', () => {
 const [c]=lookup.lookupModel('SCD-U2P');assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith('208375.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,30,30,30,30,30]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[41,41,42,48,49,46,48].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[2].conditions,/ボタンをスライド.*反時計回り.*汚れが気になる場合.*30分.*24時間.*時計回り.*下端の凸部.*確実に閉まって/);assert.doesNotMatch(c.suggestions[2].conditions,/上側の穴|ボタンを押して/);assert.match(c.suggestions[5].conditions,/押し下げて手前.*上に引き上げ.*回転軸.*カチッ/);assert.equal(lookup.lookupModel('SCD-U2PX').length,0);
});


test('SCD-220 uses USB disconnect and twist-lock cup without invented powered-brush care', () => {
 const [c]=lookup.lookupModel('SCD-220');assert.equal(c.releaseYear,2024);assert.ok(c.manualUrl.endsWith('205900.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[30,31,34,34].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[1].conditions,/USB充電ケーブル.*反時計回り.*開いた鍵.*下に引いて.*汚れが気になる場合.*30分.*24時間.*熱風.*時計回り.*閉じた鍵.*フィルター類を忘れず/);assert.doesNotMatch(c.suggestions[1].conditions,/ボタンを押して|上下に分解/);assert.ok(c.suggestions.every(x=>!/回転ブラシ|センサー|モップ/.test(x.name)));assert.equal(lookup.lookupModel('SCD-220X').length,0);
});
test('SCD-185P uses press-release cup, split cyclone and front-tab brush cover', () => {
 const [c]=lookup.lookupModel('SCD-185P');assert.equal(c.releaseYear,2024);assert.ok(c.manualUrl.endsWith('202399.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[30,31,34,34,35].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[1].conditions,/充電アダプター.*ボタンを押して.*反時計回り.*上下に分解.*汚れが気になる場合.*30分.*24時間.*時計回り.*上側の穴.*カチッ/);assert.doesNotMatch(c.suggestions[1].conditions,/ブラシを谷|USB|下端/);assert.match(c.suggestions[4].conditions,/押し下げて手前.*持ち上げて.*24時間.*前端内側.*カチッ/);assert.equal(lookup.lookupModel('SCD-185PX').length,0);
});


test('2024 paper models keep dedicated pages and weekly G4P mop but no invented sensors',()=>{
 for(const [m,pdf,days,pages] of [['SBD-77P','206015',[7,30,30,30,30,90],[33,34,34,35,36,38]],['SBD-G4P','206016',[7,7,30,30,30,30,30,90],[37,37,38,38,39,40,41,42]]]){const[c]=lookup.lookupModel(m);assert.equal(c.releaseYear,2024);assert.ok(c.manualUrl.endsWith(pdf+'.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),days);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),pages.map(n=>c.manualUrl+'#page='+n));assert.ok(c.suggestions.every(x=>!/センサー/.test(x.name)));assert.match(c.suggestions.at(-1).conditions,/24時間.*必ず取り付け/);assert.match(c.suggestions.find(x=>x.name==='回転ブラシのお手入れ').conditions,/押し下げて手前.*前端内側.*カチッ/);assert.equal(lookup.lookupModel(m+'X').length,0);}
});
test('2024 122PMA and R3P cups split cyclones and monthly mop without invented weekly wash',()=>{
 for(const[m,pdf,days,pages] of [['SCD-122PMA','207018',[7,7,30,30,30,30,30],[42,42,43,46,46,47,48]],['SCD-R3P','203683',[7,30,30,30,30,30],[40,41,44,44,45,46]]]){const[c]=lookup.lookupModel(m);assert.equal(c.releaseYear,2024);assert.ok(c.manualUrl.endsWith(pdf+'.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),days);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),pages.map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions.find(x=>x.name==='ダストカップ・フィルターのお手入れ').conditions,/反時計回り.*上下に分解.*メッシュ.*汚れが気になる場合.*30分.*谷に沿って.*24時間.*熱風.*時計回り.*上側の穴/);assert.equal(lookup.lookupModel(m+'X').length,0);}
 const[c]=lookup.lookupModel('SCD-122PMA');assert.match(c.suggestions[0].conditions,/ミニヘッド.*フレキシブルホース/);assert.match(c.suggestions[1].conditions,/左右の/);
});
test('SCD-L3PD keeps weekly cup, no split, and distinct dock wash versus replacement',()=>{
 const[c]=lookup.lookupModel('SCD-L3PD');assert.equal(c.releaseYear,2024);assert.ok(c.manualUrl.endsWith('206147.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,7,7,30,30,30,60,60,60]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[40,40,40,41,44,44,45,47,47,37].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[3].conditions,/ドックの運転を停止.*メッシュ.*30分.*谷に沿って.*24時間/);assert.doesNotMatch(c.suggestions[3].conditions,/上下に分解|反時計/);assert.match(c.suggestions[7].conditions,/スポンジは軽くはたいて水洗い.*24時間.*忘れず/);assert.equal(c.suggestions[8].kind,'交換');assert.match(c.suggestions[8].frequency,/2〜3か月.*60日/);assert.match(c.suggestions[9].conditions,/運転中.*外しません.*上に引いて.*側面.*カチッ.*忘れず/);assert.equal(lookup.lookupModel('SCD-L3PDX').length,0);
});


test('SCD-185PM preserves dedicated monthly cup and mop care without invented sensor',()=>{
 const[c]=lookup.lookupModel('SCD-185PM');assert.equal(c.releaseYear,2024);assert.ok(c.manualUrl.endsWith('202401.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,30,30,30,30,30]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[41,42,45,45,46,47].map(n=>c.manualUrl+'#page='+n));assert.ok(c.suggestions.every(x=>!/センサー/.test(x.name)));assert.match(c.suggestions[1].conditions,/反時計回り.*30分.*谷に沿って.*24時間.*熱風.*時計回り.*上側の穴/);assert.match(c.suggestions.at(-1).conditions,/ボタン.*水洗い.*ケース/);assert.equal(lookup.lookupModel('SCD-185PMX').length,0);
});


test('SBD-201P and T2P retain weekly mop/sensors and quarterly sponge without later cover instructions',()=>{
 for(const[m,pdf,pages]of[['SBD-201P','201506',[38,38,38,39,39,40,41,41]],['SBD-T2P','201507',[39,39,39,40,40,41,42,42]]]){const[c]=lookup.lookupModel(m);assert.equal(c.releaseYear,2024);assert.ok(c.manualUrl.endsWith(pdf+'.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,7,30,30,30,30,90]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),pages.map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[2].conditions,/内部左右/);assert.match(c.suggestions[6].conditions,/汚れた場合.*使い捨て.*取り外し/);assert.match(c.suggestions[7].conditions,/24時間.*必ず取り付け/);assert.doesNotMatch(c.suggestions[5].conditions,/押し下げて手前|前端内側/);assert.equal(lookup.lookupModel(m+'X').length,0);}
 const[a]=lookup.lookupModel('SBD-201P');const[b]=lookup.lookupModel('SBD-T2P');assert.doesNotMatch(a.suggestions[0].conditions,/マルチパワー/);assert.match(b.suggestions[0].conditions,/マルチパワー/);assert.match(b.suggestions[4].conditions,/マルチパワー/);
});


test('2023 Iris 123P/L3P preserve monthly care without later thirty-minute soak',()=>{
 for(const[m,pdf,pages]of[['SCD-123P','299188',[38,38,39,42,42,43,44]],['SCD-L3P','299189',[40,40,41,44,44,45,46]]]){const[c]=lookup.lookupModel(m);assert.equal(c.releaseYear,2023);assert.ok(c.manualUrl.endsWith(pdf+'.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,30,30,30,30,30]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),pages.map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[2].conditions,/反時計回り.*谷に沿って.*24時間.*熱風.*時計回り.*上側の穴/);assert.doesNotMatch(c.suggestions[2].conditions,/30分/);assert.equal(lookup.lookupModel(m+'X').length,0);}
 const[c]=lookup.lookupModel('SCD-L3P');assert.match(c.suggestions[0].conditions,/マルチパワー/);assert.match(c.suggestions[4].conditions,/マルチパワー/);
});
test('SCD-122PM cup is two-monthly and conditional care never receives invented schedules',()=>{
 const[c]=lookup.lookupModel('SCD-122PM');assert.equal(c.releaseYear,2023);assert.ok(c.manualUrl.endsWith('299995.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[7,7,60]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[37,37,38].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[2].frequency,/2か月/);assert.doesNotMatch(c.suggestions[2].conditions,/30分/);assert.match(c.lookupNote,/汚れが目立ってきたら.*固定周期.*41〜43/);assert.equal(lookup.lookupModel('SCD-122PMX').length,0);
});


test('public Panasonic dish care keeps conditional tasks unscheduled and exact model citations',()=>{
 const[a]=lookup.lookupModel('np-tsp2');const[b]=lookup.lookupModel(' ＮＰ－ＴＣＲ５ ');
 assert.equal(a.releaseYear,2026);assert.equal(b.releaseYear,2023);
 assert.deepEqual(a.suggestions.map(x=>x.intervalDays),[7,15]);assert.deepEqual(b.suggestions.map(x=>x.intervalDays),[7,30,30]);
 assert.ok([...a.suggestions,...b.suggestions].every(x=>x.sourceKind==='メーカー公式' && !x.sourceUrl.includes('.pdf')));
 assert.equal(a.manualLinkLabel,'公式お手入れ案内');assert.equal(b.manualLinkLabel,'公式お手入れ案内');assert.equal(a.discoveredManualUrl,undefined);
 assert.match(a.suggestions[0].frequency,/1日2回/);assert.match(a.suggestions[1].conditions,/2倍.*汚れレベル3/);
 assert.match(a.lookupNote,/給水タンク.*汚れが気になった.*固定周期/);assert.ok(a.suggestions.every(x=>!x.name.includes('タンク')));
 assert.match(b.lookupNote,/庫内は汚れたときに標準コース/);assert.ok(b.suggestions.every(x=>!x.name.includes('庫内')));
 assert.ok(b.suggestions.every(x=>!/汚れレベル3|自動投入/.test(x.conditions)));
 assert.equal(lookup.lookupModel('NP-TSP2X').length,0);assert.equal(lookup.lookupModel('NP-TCR5X').length,0);assert.equal(lookup.lookupModel('NP-TMLK1').length,0);
});


test('OSH fit preserves dedicated color/capacity manuals and does not schedule per-use care',()=>{
 for(const[m,pdf]of[['ITW-50B01-W',112861],['ITW-50B01-B',112862],['ITW-60B01-W',112863],['ITW-60B01-B',112864]]){const[c]=lookup.lookupModel(m);assert.equal(c.releaseYear,2025);assert.ok(c.manualUrl.endsWith(pdf+'.pdf'));assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,7]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[58,60].map(n=>c.manualUrl+'#page='+n));assert.match(c.suggestions[0].conditions,/衣類を入れず.*給水・一時停止.*酸性.*糸くずフィルター.*水栓を閉じ/);assert.match(c.suggestions[1].conditions,/洗いを0分・すすぎを0回.*30分.*槽洗浄/);assert.match(c.lookupNote,/洗濯のたび.*汚れたら.*固定の日数/);assert.ok(c.suggestions.every(x=>!x.name.includes('フィルター')&&!x.name.includes('投入')));assert.equal(lookup.lookupModel(m+'X').length,0);}
 assert.equal(lookup.lookupModel('ITW-50B01').length,0);assert.equal(lookup.lookupModel('ITW-60B01').length,0);
});


test('2023 OSH auto-dose washers preserve quarterly tank cleaning without inventing weekly tub drying', () => {
 for (const [model,pdf,wash,tank,buttons] of [['TCW-80A01-W','104373',74,76,/洗剤2と柔軟剤1/],['ITW-80A01-W','104612',68,70,/洗剤と柔軟剤/]]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2023);assert.ok(c.manualUrl.endsWith(pdf+'.pdf'));
  assert.deepEqual(c.suggestions.map(x=>x.intervalDays),[30,90]);assert.deepEqual(c.suggestions.map(x=>x.sourceUrl),[wash,tank].map(n=>c.manualUrl+'#page='+n));
  assert.match(c.suggestions[1].conditions,buttons);assert.match(c.suggestions[1].conditions,/1か月以上未使用.*ゼリー状.*40℃以下.*3秒以上.*水を捨て.*内部にも液剤を充填/);
  assert.match(c.lookupNote,/定期的に.*日数指定はありません/);assert.ok(!c.suggestions.some(x=>x.name.includes('槽乾燥')));assert.equal(lookup.lookupModel(model+'X').length,0);
 }
});


test('ITW-80A02-W uses its non-auto-dose manual and has no tank task or invented drying schedule', () => {
 const [c]=lookup.lookupModel('ITW-80A02-W');assert.equal(c.releaseYear,2023);assert.ok(c.manualUrl.endsWith('104379.pdf'));assert.equal(c.suggestions.length,1);assert.equal(c.suggestions[0].intervalDays,30);assert.equal(c.suggestions[0].sourceUrl,c.manualUrl+'#page=59');assert.match(c.suggestions[0].conditions,/給水終了後に一時停止.*表示の分量.*糸くずフィルター/);assert.match(c.lookupNote,/日数指定はありません/);assert.ok(!c.suggestions.some(x=>/タンク|槽乾燥/.test(x.name)));assert.equal(lookup.lookupModel('ITW-80A02-WX').length,0);
});


test('2024 OSH 10kg variants use dedicated manuals and preserve one-tank-at-a-time priming', () => {
 for(const [model,pdf,auto] of [['TCW-100A01-W','104374',true],['ITW-100A01-W','104613',true],['ITW-100A02-W','104381',false]]) {
  const [c]=lookup.lookupModel(model);assert.equal(c.releaseYear,2024);assert.ok(c.manualUrl.endsWith(pdf+'.pdf'));assert.deepEqual(c.suggestions.map(t=>t.intervalDays),auto?[30,90]:[30]);assert.deepEqual(c.suggestions.map(t=>t.sourceUrl),auto?[79,81].map(p=>c.manualUrl+'#page='+p):[c.manualUrl+'#page=68']);assert.match(c.lookupNote,/ふろ水ホース.*日数指定はありません/);assert.ok(!c.suggestions.some(t=>t.name.includes('槽乾燥')));
  if(auto)assert.match(c.suggestions[1].conditions,/40℃以下.*3秒以上.*水を捨て.*30〜31ページ.*1つずつ.*内部にも液剤を充填/);else assert.ok(!c.suggestions.some(t=>t.name.includes('タンク')));assert.equal(lookup.lookupModel(model+'X').length,0);
 }
 assert.match(lookup.lookupModel('TCW-100A01-W')[0].suggestions[1].conditions,/洗剤2と柔軟剤1/);assert.match(lookup.lookupModel('ITW-100A01-W')[0].suggestions[1].conditions,/洗剤と柔軟剤/);
});
