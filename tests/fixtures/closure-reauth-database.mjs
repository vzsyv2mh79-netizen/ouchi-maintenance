import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './home-handoff-full-schema.mjs';
export async function seedClosureReauthenticationDatabase(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec(`reset role;
 alter table auth.users add column email text;alter table auth.users add column encrypted_password text;
 alter table auth.sessions add column aal text default 'aal1';alter table auth.sessions add column refreshed_at timestamp;alter table auth.sessions add column user_agent text;
 create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text);
 create table auth.refresh_tokens(session_id uuid references auth.sessions(id) on delete cascade,token text);`);
 for(const file of ["supabase/migrations/20261014061605_ouchi_account_closure_review.sql", "supabase/migrations/20261014061618_ouchi_closure_review_private_access.sql", "supabase/migrations/20261014061630_ouchi_closure_reauth_markers.sql", "supabase/migrations/20261014061641_ouchi_closure_reauth_lifecycle.sql", "supabase/migrations/20261014064119_ouchi_closure_review_erasure.sql", "supabase/migrations/20261014231227_ouchi_closure_actor_context_compatibility.sql"])await db.exec(readFileSync(file,'utf8'));
 return db;
}
