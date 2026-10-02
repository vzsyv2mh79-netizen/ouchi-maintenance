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
