import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './home-handoff-full-schema.mjs';
export async function seedClosureReauthenticationDatabase(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec(`reset role;
 alter table auth.users add column email text;alter table auth.users add column encrypted_password text;
 alter table auth.sessions add column aal text default 'aal1';alter table auth.sessions add column refreshed_at timestamp;alter table auth.sessions add column user_agent text;
 create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text);
 create table auth.refresh_tokens(session_id uuid references auth.sessions(id) on delete cascade,token text);`);
 for(const name of ['account-closure-review','closure-review-private-access','closure-reauth-markers','closure-reauth-lifecycle'])await db.exec(readFileSync('tests/fixtures/'+name+'.sql','utf8'));
 return db;
}
