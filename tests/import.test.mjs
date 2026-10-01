import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
function source(path) { return ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText; }
const backupUrl='data:text/javascript;base64,'+Buffer.from(source('lib/backup.ts')).toString('base64');
const importSource=source('lib/cloud-import.ts').replace('"./backup"',JSON.stringify(backupUrl));
const {prepareCloudImport}=await import('data:text/javascript;base64,'+Buffer.from(importSource).toString('base64'));
const local={homes:[{id:'home-1',name:'わが家',kind:'home'}],products:[{id:'p-demo',homeId:'home-1',categoryId:'aircon',maker:'Test',name:'Test',modelNumber:'TEST'}],tasks:[{id:'t-demo',productId:'p-demo',name:'Clean',kind:'掃除',intervalDays:14,nextDueAt:'2026-10-01',sourceKind:'ユーザー設定'}],history:[{id:'h-demo',taskId:'t-demo',productId:'p-demo',completedAt:'2026-09-17'}]};
test('import preserves source data and remaps all legacy relations, with stable fingerprint',async()=>{
  const snapshot=structuredClone(local), home='33333333-3333-4333-8333-333333333333';
  const a=await prepareCloudImport(local,home), b=await prepareCloudImport(local,home);
  assert.deepEqual(local,snapshot);assert.equal(a.hash,b.hash);assert.notEqual(a.payload.products[0].id,b.payload.products[0].id);
  assert.equal(a.payload.products[0].homeId,home);assert.equal(a.payload.tasks[0].productId,a.payload.products[0].id);
  assert.equal(a.payload.history[0].taskId,a.payload.tasks[0].id);
});
test('Postgres import is atomic, additive, idempotent and isolated',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(readFileSync('supabase/migrations/20261001144732_household_storage.sql','utf8'));
    await db.exec(readFileSync('supabase/migrations/20261001232931_atomic_import.sql','utf8'));
    const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users values ($1),($2)',[alice,bob]);
    const asUser=async(id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
    const load=async()=> (await db.query('select public.load_household() as data')).rows[0].data;
    const send=async(p)=>db.query('select public.import_maintenance($1,$2,$3)',[p.homeId,p.hash,JSON.stringify(p.payload)]);
    await asUser(alice);const home=(await load()).homes[0].id;
    const first=await prepareCloudImport(local,home);await send(first);await send(await prepareCloudImport(local,home));
    let saved=await load();assert.equal(saved.products.length,1);assert.equal(saved.tasks.length,1);assert.equal(saved.history.length,1);
    const changed=structuredClone(local);changed.products[0].name='Second';const invalid=await prepareCloudImport(changed,home);invalid.payload.tasks[0].intervalDays=0;
    await assert.rejects(()=>send(invalid));assert.equal((await load()).products.length,1);
    const valid=await prepareCloudImport(changed,home);await send(valid);assert.equal((await load()).products.length,2);
    await asUser(bob);await load();await assert.rejects(()=>send(first));
    assert.equal((await db.query('select * from public.maintenance_imports')).rows.length,0);
    await db.exec('reset role;set role anon');await assert.rejects(()=>send(first));
  } finally { await db.close(); }
});
