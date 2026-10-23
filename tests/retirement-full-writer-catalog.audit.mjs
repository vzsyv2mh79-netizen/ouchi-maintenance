/** Navigation inventory from the complete migration chain, never clearance. */
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const output=process.argv[2];
assert.ok(output,'Explicit local output path required');
const sha=value=>createHash('sha256').update(value).digest('hex');
const db=new PGlite(),migrations=[];
try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz,created_at timestamptz default now(),aal text default 'aal1',refreshed_at timestamp);create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text,secret text);`);
 await db.exec(readFileSync('tests/fixtures/auth/rest-bootstrap.sql','utf8'));
 for(const name of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort()){
  const bytes=readFileSync('supabase/migrations/'+name);await db.exec(bytes.toString());migrations.push({name,sha256:sha(bytes)});
 }
 const functions=(await db.query(`select n.nspname as schema,p.proname as name,p.oid::regprocedure::text as signature,
 p.prosecdef as security_definer,pg_get_functiondef(p.oid) as definition,
 coalesce((select jsonb_agg(r.rolname order by r.rolname) from pg_roles r
 where r.rolname not in ('postgres','supabase_admin') and not r.rolsuper
 and has_function_privilege(r.oid,p.oid,'EXECUTE')),'[]'::jsonb) as executable_roles
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','maintenance_private') and p.prokind='f'
 order by n.nspname,p.proname,p.oid::regprocedure::text`)).rows;
 function sourceTree(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const path=directory+'/'+entry.name;
  return entry.isDirectory()?sourceTree(path):entry.isFile()&&/\.(ts|tsx|mjs)$/.test(entry.name)?[{path,text:readFileSync(path,'utf8')}]:[];
 });}
 const sourceFiles=['lib','app/api','scripts'].flatMap(sourceTree);
 for(const f of functions){
  f.definitionSHA256=sha(f.definition);
  // Lexical references include comments/strings and miss dynamic dispatch.
  // DML-looking text also includes comments and cannot classify safety.
  f.lexicalDML=/\b(insert\s+into|update\s+[\w."]|delete\s+from|truncate\b)/i.test(f.definition);
  f.lexicalCallers=sourceFiles.filter(s=>s.text.includes(f.name)).map(s=>s.path);
  f.coverageStatus='unreviewed_inventory_not_runtime_proof';
 }
 const result={status:'complete_migration_catalog_navigation_only',productionChanged:false,
  engine:'PGlite synthetic Auth shape, not production PostgreSQL/grants',
  migrations,sourceSHA256:Object.fromEntries(sourceFiles.map(s=>[s.path,sha(s.text)])),functions,
  limitations:['Effective roles reflect clean fixture defaults, not observed production grants.','Lexical DML/caller detection is navigation only; no call-graph, trigger, direct SQL, worker, external outbox or race completeness claim.','No writer_coverage_verified policy or production configuration changed.']};
 writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({migrations:migrations.length,functions:functions.length,publicFunctions:functions.filter(f=>f.schema==='public').length,privateFunctions:functions.filter(f=>f.schema==='maintenance_private').length}));
}finally{await db.close();}
