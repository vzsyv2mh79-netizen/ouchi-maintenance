import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync('lib/maintenance-report.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { maintenanceReport } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const data = {
 homes: [{id:'a',name:'自宅'}, {id:'b',name:'別宅'}],
 products: [{id:'p',homeId:'a',name:'空気清浄機'}, {id:'q',homeId:'b',name:'別の製品'}],
 tasks: [{id:'t',productId:'p',nextDueAt:'2026-10-09'}, {id:'u',productId:'p',nextDueAt:'2026-10-10'}, {id:'v',productId:'q',nextDueAt:'2020-01-01'}],
 history: [{taskId:'t',productId:'p',completedAt:'2026-05-01'}, {taskId:'t',productId:'p',completedAt:'2026-10-01'}, {taskId:'t',productId:'p',completedAt:'2026-10-11'}, {taskId:'v',productId:'q',completedAt:'2026-10-01'}],
};
test('six months, overdue and per-product totals retain home isolation and exclude future completions', () => {
 const r = maintenanceReport(data, 'a', Date.parse('2026-10-10T00:00:00Z'));
 assert.equal(r.productCount,1); assert.equal(r.taskCount,2); assert.equal(r.overdue,1); assert.equal(r.dueToday,1);
 assert.deepEqual(r.months.map(x=>x.month),['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']);
 assert.deepEqual(r.months.map(x=>x.completed),[1,0,0,0,0,1]);
 assert.equal(r.perProduct[0].completedThisMonth,1); assert.equal(r.perProduct.length,1);
});
test('Tokyo midnight and year rollover use the household date rather than host timezone', () => {
 const r = maintenanceReport(data,'a',Date.parse('2026-12-31T15:00:00Z'));
 assert.equal(r.today,'2027-01-01'); assert.equal(r.months[5].month,'2027-01'); assert.equal(r.months[0].month,'2026-08');
 assert.equal(maintenanceReport(data,'a',Date.parse('2026-10-09T14:59:59Z')).dueToday,1);
});
test('missing home and invalid report time do not produce a cross-household report', () => {
 assert.throws(()=>maintenanceReport(data,'other',Date.now())); assert.throws(()=>maintenanceReport(data,'a',NaN));
});
