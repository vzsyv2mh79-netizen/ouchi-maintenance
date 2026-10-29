import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const modules=new Map();
function moduleURL(name){
 if(modules.has(name))return modules.get(name);
 let source=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 source=source.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dependency)=>`from ${JSON.stringify(dependency.endsWith('.mjs')?import.meta.resolve('../lib/'+dependency):moduleURL(dependency))}`);
 const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,result);return result;
}
const {createAccountClosureReviewTransactions}=await import(moduleURL('account-closure-review-transactions'));
const {HOME_HANDOFF_AUTH_USER_PIN_SQL}=await import(moduleURL('home-handoff-identity'));
const user='11111111-1111-4111-8111-111111111111';
function fixture({lostCommit=false,pending=false}={}){
 const calls=[];let rejectQuery;
 const provider=createAccountClosureReviewTransactions({connect:async()=>({query:async(sql,args)=>{
  calls.push([sql,args]);if(sql==='COMMIT'&&lostCommit)throw Error('Commit acknowledgement lost');
  if(sql===HOME_HANDOFF_AUTH_USER_PIN_SQL&&pending)return new Promise((resolve,reject)=>{rejectQuery=reject;});
  return {rows:[{id:user}]};
 },abort:()=>{calls.push(['abort']);rejectQuery?.(Error('Transport interrupted'));},close:async()=>{calls.push(['close']);}})});
 return {provider,calls};
}
test('only exact prepared SQL with canonical arguments reaches dedicated transport',async()=>{
 for(const [sql,args] of [["delete from auth.users",[]],[HOME_HANDOFF_AUTH_USER_PIN_SQL+';select 1',[user]],[HOME_HANDOFF_AUTH_USER_PIN_SQL,[user,user]],[HOME_HANDOFF_AUTH_USER_PIN_SQL,['client-flag']]]){
  const f=fixture();await assert.rejects(f.provider.run(new AbortController().signal,tx=>tx.query(sql,args)),/Unsupported review SQL/);
  assert.equal(f.calls.some(x=>x[0]===sql),false);assert.equal(f.calls.some(x=>x[0]==='COMMIT'),false);assert.equal(f.calls.at(-1)[0],'close');
 }
});
test('valid pins get SQL deadlines, one COMMIT and sealed callback capability',async()=>{
 const f=fixture();let saved;
 const result=await f.provider.run(new AbortController().signal,async tx=>{saved=tx;return tx.query(HOME_HANDOFF_AUTH_USER_PIN_SQL,[user]);});
 assert.equal(result.rows[0].id,user);assert.equal(f.calls.filter(x=>x[0]==='COMMIT').length,1);
 assert.ok(f.calls.some(x=>x[0].includes('statement_timeout')));assert.ok(f.calls.some(x=>x[0].includes('lock_timeout')));
 await assert.rejects(saved.query(HOME_HANDOFF_AUTH_USER_PIN_SQL,[user]),/callback closed/);
});
test('cancellation interrupts pending SQL and never commits or waits on a queued rollback',async()=>{
 const f=fixture({pending:true}),controller=new AbortController();
 const running=f.provider.run(controller.signal,tx=>tx.query(HOME_HANDOFF_AUTH_USER_PIN_SQL,[user]));
 while(!f.calls.some(x=>x[0]===HOME_HANDOFF_AUTH_USER_PIN_SQL))await new Promise(done=>setImmediate(done));
 controller.abort();await assert.rejects(running,/interrupted/);
 assert.equal(f.calls.some(x=>['COMMIT','ROLLBACK'].includes(x[0])),false);assert.equal(f.calls.at(-1)[0],'close');
});
test('lost COMMIT remains uncertain and never causes transaction retry',async()=>{
 const f=fixture({lostCommit:true});await assert.rejects(f.provider.run(new AbortController().signal,tx=>tx.query(HOME_HANDOFF_AUTH_USER_PIN_SQL,[user])),/acknowledgement lost/);
 assert.equal(f.calls.filter(x=>x[0]==='COMMIT').length,1);assert.equal(f.calls.filter(x=>x[0]===HOME_HANDOFF_AUTH_USER_PIN_SQL).length,1);
});
