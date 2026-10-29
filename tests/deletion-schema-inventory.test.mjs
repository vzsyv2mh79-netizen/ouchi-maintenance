import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('read-only deletion metadata query reports live columns and FKs without customer rows or unrelated app tables',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);');
  await db.exec(readFileSync('supabase/migrations/20261010141353_ouchi_billing_identity.sql','utf8'));
  await db.exec("create table public.homes(id uuid primary key,owner_id uuid references auth.users(id),name text);alter table public.homes enable row level security;create table public.another_app_records(id uuid,name text);insert into auth.users values('11111111-1111-4111-8111-111111111111');insert into public.homes values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','DO_NOT_RETURN_CUSTOMER_VALUE');");
  const query=readFileSync('tests/fixtures/deletion/schema-inventory.sql','utf8');
  const result=await db.query(query),inventory=Object.values(result.rows[0])[0];
  assert.ok(Array.isArray(inventory));assert.equal(inventory.length,4);assert.ok(inventory.every(table=>table.rls===true));
  const homes=inventory.find(table=>table.relation==='public.homes');assert.ok(homes.columns.some(column=>column.name==='owner_id'&&column.type==='uuid'));assert.ok(homes.foreign_keys.some(key=>key.definition.includes('auth.users')));
  assert.ok(!JSON.stringify(inventory).includes('DO_NOT_RETURN_CUSTOMER_VALUE'));assert.ok(!JSON.stringify(inventory).includes('another_app_records'));
  await db.exec('alter table maintenance_private.app_epochs add column synthetic_new_link text;');
  const changed=Object.values((await db.query(query)).rows[0])[0];assert.ok(changed.find(table=>table.relation==='maintenance_private.app_epochs').columns.some(column=>column.name==='synthetic_new_link'));
  assert.equal((await db.query('select count(*)::int as total from public.homes')).rows[0].total,1,'inventory must not erase rows');
 }finally{await db.close();}
});
