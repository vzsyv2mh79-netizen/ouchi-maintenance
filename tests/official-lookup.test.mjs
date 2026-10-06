import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const uri = source => 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const catalogUri=uri(compile(readFileSync('lib/product-lookup.ts','utf8')));
const source=compile(readFileSync('lib/official-lookup.ts','utf8')).replace('"./product-lookup"',JSON.stringify(catalogUri));
const {parseSharpIndex,parsePanasonicSupport,panasonicSupportUrl,parseDaikinSupport,daikinSupportUrl}=await import(uri(source));
test('official index candidates match exact model and do not infer maintenance advice',()=>{
 const fixture='const kataBuhinList=[{"cat":"kashitsu","kisyu":"KI-RX70"},{"cat":"kuki","kisyu":"FU-R50"},{"cat":"option","kisyu":"FZ-R50"}];';
 const [candidate]=parseSharpIndex(fixture,' ｋｉ－ｒｘ７０ ');
 assert.equal(candidate.modelNumber,'KI-RX70');assert.equal(candidate.name,'加湿空気清浄機');assert.deepEqual(candidate.suggestions,[]);assert.ok(candidate.lookupNote.includes('未確認'));
 assert.equal(candidate.manualUrl,'https://jp.sharp/support/download/members/?productId=KI-RX70');
 assert.equal(parseSharpIndex(fixture,'KI-RX7').length,0);assert.equal(parseSharpIndex(fixture,'KI-RX70-W').length,0);
 assert.equal(parseSharpIndex(fixture,'FU-R50')[0].name,'空気清浄機');assert.equal(parseSharpIndex(fixture,'FZ-R50').length,0);
 assert.equal(parseSharpIndex(fixture,'https://localhost/').length,0);
 assert.equal(parseSharpIndex('(()=>{throw new Error("must never execute")})()', 'KI-RX70').length,0);
});

test('Panasonic discovery uses the exact product title and main manual link, never a script or another model',()=>{
 const pdf='/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/001/12/F-VXW90_web%201.pdf';
 const title='<title>F-VXW90 サポート - 加湿空気清浄機 | 空気清浄機 | Panasonic</title>';
 const link=(href,label='F-VXW90')=>`<a href="${href}"><span>取扱説明書&#xff3b;${label}&#xff3d; (PDF)</span></a>`;
 const [candidate]=parsePanasonicSupport(title+link(pdf),' ｆ－ｖｘｗ９０ ');
 assert.equal(candidate.maker,'Panasonic');assert.equal(candidate.name,'加湿空気清浄機');assert.deepEqual(candidate.suggestions,[]);
 assert.equal(candidate.discoveredManualUrl,'https://panasonic.jp'+pdf);assert.equal(candidate.manualUrl,'https://panasonic.jp/airrich/products/F-VXW90/support.html');
 assert.equal(parsePanasonicSupport(title+link(pdf),'F-VXW9').length,0);assert.equal(parsePanasonicSupport(title+link(pdf),'F-VXW90-W').length,0);
 assert.equal(parsePanasonicSupport(title.replace('F-VXW90','F-VXW900')+link(pdf),'F-VXW90').length,0);
 for(const href of ['https://evil.test'+pdf,'https://panasonic.jp:8443'+pdf,'https://user:pass@panasonic.jp'+pdf,pdf+'?redirect=http://localhost',pdf.replace('F-VXW90_web%201.pdf','evil%2F..%2Fsecret.pdf')])assert.equal(parsePanasonicSupport(title+link(href),'F-VXW90')[0].discoveredManualUrl,undefined);
 assert.equal(parsePanasonicSupport(title+link(pdf,'F-VXW75'),'F-VXW90')[0].discoveredManualUrl,undefined);
 assert.equal(parsePanasonicSupport(title+'<script>'+link(pdf)+'</script>','F-VXW90')[0].discoveredManualUrl,undefined);
 assert.equal(panasonicSupportUrl('https://localhost/'),null);
});


test('Daikin discovery matches the current model, never successor models or unverified advice',()=>{
 const title='<title>AN40ZRP-W | 取扱説明書 | ルームエアコン Ｒシリーズ（量販店） | ダイキン工業株式会社 | DT-NET</title>';
 const header='<h1 style="display: inline-block">AN40ZRP-W</h1><p>住宅用　空調　ルームエアコン　Ｒシリーズ（量販店）</p>';
 const fixture=title+header+'<h4>AN407ARP-W</h4>';
 const [candidate]=parseDaikinSupport(fixture,' ａｎ４０ｚｒｐ－ｗ ');
 assert.equal(candidate.modelNumber,'AN40ZRP-W');assert.equal(candidate.categoryId,'aircon');
 assert.deepEqual(candidate.suggestions,[]);assert.equal(candidate.discoveredManualUrl,undefined);
 assert.equal(new URL(candidate.manualUrl).searchParams.get('conditions'),'AN40ZRP-W');
 assert.equal(parseDaikinSupport(fixture,'AN407ARP-W').length,0);
 assert.equal(parseDaikinSupport(title+'<script>'+header+'</script>','AN40ZRP-W').length,0);
 assert.equal(parseDaikinSupport(title+'<!--'+header+'-->','AN40ZRP-W').length,0);
 assert.equal(parseDaikinSupport(fixture.replace('ルームエアコン　Ｒ','業務用　Ｒ'),'AN40ZRP-W').length,0);
 assert.equal(parseDaikinSupport(fixture.replace('ダイキン工業株式会社','別メーカー'),'AN40ZRP-W').length,0);
 assert.equal(daikinSupportUrl('https://localhost/'),null);assert.equal(daikinSupportUrl('AN40ZRP-W?redirect=localhost'),null);
});
