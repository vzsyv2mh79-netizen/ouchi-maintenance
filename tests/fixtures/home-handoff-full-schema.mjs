import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {maintenanceMigrationCatalog} from '../../scripts/maintenance-migration-plan.mjs';
import {owner,recipient,other,home,product,request,os,rs,oe,re} from './home-handoff-identifiers.mjs';

// Reuse the actual CI schema order, rather than substitute simplified homes,
// membership, attachment or retirement tables. Auth rows remain synthetic.
export async function seedHomeHandoffFullSchemaFixture({explicitEnrollment=true,databaseFactory,completeCatalog=false}={}){
 const db=databaseFactory?await databaseFactory():new PGlite();
 await db.exec('create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz,created_at timestamptz default now());');
 if(completeCatalog){
  // Explicit synthetic Auth model for canonical SQL tests, never real Auth proof.
  await db.exec(readFileSync('tests/fixtures/auth/rest-bootstrap.sql','utf8'));
  await db.exec(`alter table auth.users add column email text;alter table auth.users add column encrypted_password text;
   alter table auth.sessions add column aal text default 'aal1';alter table auth.sessions add column refreshed_at timestamp;alter table auth.sessions add column user_agent text;
   create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text);
   create table auth.refresh_tokens(session_id uuid references auth.sessions(id) on delete cascade,token text);`);
 }
 const line=readFileSync('.github/workflows/billing-identity-migration.yml','utf8').split('\n').find(value=>value.trim().startsWith('for file in '));
 assert.ok(line,'Expected the authoritative CI migration list');
 const files=line.trim().slice('for file in '.length).split('; do')[0].split(' ');
 for(const name of ['20261011012412_ouchi_attachment_write_attempts.sql','20261011123511_ouchi_explicit_enrollment_consent.sql','20261012174446_ouchi_current_deletion_lookup.sql'])assert.ok(files.some(file=>file.endsWith(name)));
 const candidates=['20261013043000_ouchi_family_handoff.sql','20261013043100_ouchi_family_retirement_guard.sql','20261013043200_ouchi_family_handoff_read.sql','20261013043300_ouchi_shared_home_delete_guard.sql'].map(name=>'supabase/migrations/'+name);
 for(const file of completeCatalog?maintenanceMigrationCatalog().map(x=>x.file):[...files,...candidates.filter(file=>!files.includes(file))])await db.exec(readFileSync(file,'utf8'));
 await db.query('insert into auth.users(id) values($1),($2),($3)',[owner,recipient,other]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[os,owner,rs,recipient]);
 await db.query('insert into maintenance_private.app_epochs values($1,$2,true),($3,$4,true)',[owner,oe,recipient,re]);
 await db.query('insert into maintenance_private.account_access values($1,true),($2,true)',[owner,recipient]);
 await db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3),($4,$5,$6)',[os,owner,oe,rs,recipient,re]);
 await db.query('update maintenance_private.enrollment_policy set require_explicit=$1',[explicitEnrollment]);await db.exec('update maintenance_private.home_handoff_policy set enabled=true');
 await db.query('insert into public.homes(id,owner_id) values($1,$2)',[home,owner]);
 await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,recipient,'Synthetic member']);
 await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','Synthetic product']);
 await db.query('insert into public.maintenance_tasks(id,"productId",name,kind,"intervalDays","nextDueAt","sourceKind") values($1,$2,$3,$4,30,current_date,$5)',[request,product,'Synthetic task','掃除','ユーザー設定']);
 await db.query('insert into public.maintenance_history("taskId","productId","completedAt") values($1,$2,current_date)',[request,product]);
 await db.exec('set role service_role');
 return db;
}
