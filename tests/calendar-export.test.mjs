import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const {outputText}=ts.transpileModule(readFileSync('lib/calendar-export.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {calendarExport}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
test('calendar export uses Japan time, repeats configured intervals and escapes content',()=>{
 const data={homes:[],products:[{id:'p',name:'製品;名前,改行\nEND:VEVENT'}],tasks:[{id:'t',productId:'p',name:'掃除'.repeat(60),nextDueAt:'2026-10-02',intervalDays:21}],history:[]};
 const raw=calendarExport(data,new Date('2026-10-01T00:00:00Z'));
 assert.match(raw,/DTSTART;TZID=Asia\/Tokyo:20261002T090000/);
 assert.match(raw,/DTEND;TZID=Asia\/Tokyo:20261002T093000/);
 assert.match(raw,/RRULE:FREQ=DAILY;INTERVAL=21/);
 assert.match(raw,/TRIGGER:-P1D/);
 const unfolded=raw.replace(/\r\n /g,'');
 assert.match(unfolded,/製品\\;名前\\,改行\\nEND:VEVENT/);
 assert.equal(unfolded.split('\r\n').filter(l=>l==='END:VEVENT').length,1);
 for(const line of raw.split('\r\n')) assert.ok(Buffer.byteLength(line)<=75);
 assert.match(raw,/DTSTAMP:20261001T000000Z/);
});
