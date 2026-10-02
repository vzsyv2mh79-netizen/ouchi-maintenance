import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const uri = source => 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const catalogUri=uri(compile(readFileSync('lib/product-lookup.ts','utf8')));
const source=compile(readFileSync('lib/official-lookup.ts','utf8')).replace('"./product-lookup"',JSON.stringify(catalogUri));
const {parseSharpIndex}=await import(uri(source));
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
