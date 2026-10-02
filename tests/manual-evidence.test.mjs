import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const{outputText}=ts.transpileModule(readFileSync('lib/manual-evidence.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const{officialManualUrl,hasExactModel,extractMaintenanceLines,pdfTextLines}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const url='https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf';
test('manual URLs reject arbitrary hosts, credentials, redirects, query and unsupported paths',()=>{
 assert.equal(officialManualUrl(url+'#page=29'),url);
 for(const input of ['http://jp.sharp/support/air_purifier/doc/a.pdf','https://jp.sharp.evil.example/support/air_purifier/doc/a.pdf','https://user:pass@jp.sharp/support/air_purifier/doc/a.pdf',url+'?redirect=http://localhost',url.replace('kirx100_mn.pdf','../a.pdf'),'https://127.0.0.1/a.pdf'])assert.throws(()=>officialManualUrl(input));
});
test('cover model must match an entire model number, never a prefix or color variant',()=>{
 assert.equal(hasExactModel('形名 ＫＩ－ＲＸ１００\n', 'KI-RX100'),true);
 assert.equal(hasExactModel('KI-RX100-W', 'KI-RX100'),false);
 assert.equal(hasExactModel('KI-RX100', 'KI-RX10'),false);
 assert.equal(hasExactModel('KI-RX1000', 'KI-RX100'),false);
});
test('only explicit same-line maintenance intervals become cited suggestions',()=>{
 const pages=[{page:29,lines:['お手入れ','本体・後ろパネル 約１カ月に１回','センサー部 約1カ月に1回','タンク 給水のたびに','集じんフィルター','約6カ月に1回']},{page:30,lines:['お手入れ','加湿フィルター・ トレー 約１カ月に１回']}];
 const result=extractMaintenanceLines(pages,url);assert.equal(result.length,3);assert.equal(result[0].intervalDays,30);assert.equal(result[0].sourceUrl,url+'#page=29');assert.equal(result[2].sourceUrl,url+'#page=30');assert.equal(result[2].sourceKind,'取扱説明書');
 assert.equal(extractMaintenanceLines([{page:3,lines:['保証','センサー部 約1カ月に1回']}],url).length,0);
 assert.equal(extractMaintenanceLines([{page:29,lines:['お手入れ','センサー部 約1カ月に1回','センサー部 約6カ月に1回']}],url).length,0);
});

test('font baseline differences join a heading to its adjacent frequency without crossing columns',()=>{
 const item=(str,x,y,width)=>({str,transform:[1,0,0,1,x,y],width});
 const lines=pdfTextLines([item('タンク',10,506,50),item('給水のたびに',70,508,90),item('本体・後ろパネル',292,506,139),item('約１カ月に１回',440,508,59),item('お手入れ',10,700,60)]);
 assert.equal(extractMaintenanceLines([{page:29,lines}],url).length,1);
 const crossColumn=pdfTextLines([item('センサー部',10,300,70),item('約1カ月に1回',250,302,70),item('お手入れ',10,700,60)]);
 assert.equal(extractMaintenanceLines([{page:29,lines:crossColumn}],url).length,0);
});

const panasonicUrl='https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/001/12/F-VXW90_web%201.pdf';
test('Panasonic manual URL allows the observed official asset path and rejects escaping it',()=>{
 assert.equal(officialManualUrl(panasonicUrl),panasonicUrl);
 for(const input of [panasonicUrl.replace('panasonic.jp','panasonic.jp.evil.test'),panasonicUrl+'?redirect=http://localhost',panasonicUrl.replace('F-VXW90_web%201.pdf','evil%2F..%2Fsecret.pdf'),panasonicUrl.replace('/support/manual/','/private/'),'https://panasonic.jp/api/data.pdf'])assert.throws(()=>officialManualUrl(input));
});
test('Panasonic delimited part labels retain day/week/month evidence without inventing conditional schedules',()=>{
 const pages=[{page:14,lines:['お手入れする','本体・フロントパネル ＜約 1 か月に 1 回＞','高感度ハウスダストセンサー','＜約3か月に1回＞']},{page:15,lines:['お手入れ','プレフィルター <約2週間に1回> 集じんフィルター <汚れが気になるとき>']},{page:16,lines:['お手入れする','タンク ＜毎日＞','トレー ＜約1か月に1回＞','イオン除菌ユニット（防カビ剤入り） ＜約1か月に1回＞']}];
 const result=extractMaintenanceLines(pages,panasonicUrl);assert.equal(result.length,5);assert.deepEqual(result.map(item=>item.intervalDays),[30,14,1,30,30]);
 assert.equal(result[0].sourceUrl,panasonicUrl+'#page=14');assert.equal(result[1].sourceUrl,panasonicUrl+'#page=15');assert.equal(result[2].sourceUrl,panasonicUrl+'#page=16');
 for(const lines of [['お手入れ','トレー <約1か月に1回>トレー <約2か月に1回>'],['お手入れ','トレー','<約1か月に1回>'],['お手入れ','説明:トレー <約1か月に1回>'],['お手入れ','トレー <約1か月に1回>','トレー <約2か月に1回>']])assert.equal(extractMaintenanceLines([{page:16,lines}],panasonicUrl).length,0);
});
