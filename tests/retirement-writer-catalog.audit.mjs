import {reviewedCleanupFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const f=await reviewedCleanupFixture({enabled:false});
try{
 await f.db.exec('reset role');await f.db.exec(readFileSync('supabase/migrations/20261016224912_ouchi_legacy_erasure_review_guard.sql','utf8'));await f.db.exec(readFileSync('supabase/migrations/20261016234937_ouchi_retired_web_push_claim_guard.sql','utf8'));
 const tables=(await f.db.query(`select c.relname,c.relrowsecurity,
 coalesce((select jsonb_agg(jsonb_build_object('role',r.rolname,'insert',has_table_privilege(r.oid,c.oid,'INSERT'),'update',has_table_privilege(r.oid,c.oid,'UPDATE'),'delete',has_table_privilege(r.oid,c.oid,'DELETE'),'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE'),'trigger',has_table_privilege(r.oid,c.oid,'TRIGGER'),'references',has_table_privilege(r.oid,c.oid,'REFERENCES'))) from pg_roles r where r.rolname in ('anon','authenticated','service_role')),'[]') grants,
 coalesce((select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid))) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),'[]') triggers,
 coalesce((select jsonb_agg(jsonb_build_object('name',pol.polname,'command',pol.polcmd,'using',pg_get_expr(pol.polqual,c.oid),'check',pg_get_expr(pol.polwithcheck,c.oid))) from pg_policy pol where pol.polrelid=c.oid),'[]') policies
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname`)).rows;
 for(const t of tables)t.columnGrants=(await f.db.query(`select a.attname,r.rolname,has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') insert,has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') update,has_column_privilege(r.oid,c.oid,a.attnum,'REFERENCES') references from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid cross join pg_roles r where n.nspname='public' and c.relname=$1 and a.attnum>0 and not a.attisdropped and r.rolname in ('anon','authenticated') order by r.rolname,a.attnum`,[t.relname])).rows;
 const functions=(await f.db.query(`select p.oid::regprocedure::text signature,p.proname,p.prosecdef,pg_get_functiondef(p.oid) definition,
 (select jsonb_agg(r.rolname order by r.rolname) from pg_roles r where r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.oid,p.oid,'EXECUTE')) roles
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by p.proname,p.oid`)).rows;
 const out=process.argv[2];writeFileSync(out,JSON.stringify({status:'local_catalog_inventory_only_not_full_coverage_approval',productionChanged:false,privateSchemaFixture:true,tables,functions},null,2)+'\n');
 console.log(JSON.stringify({tables:tables.map(t=>({name:t.relname,gates:t.triggers.map(g=>g.name)})),functions:functions.length,authenticated:functions.filter(f=>f.roles?.includes('authenticated')).map(f=>f.signature),service:functions.filter(f=>f.roles?.includes('service_role')).length}));
}finally{await f.db.close();}
