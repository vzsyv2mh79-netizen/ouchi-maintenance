-- Read-only metadata inventory. Never returns customer values or raw proofs.
-- Run only in the opt-in disposable Auth/PostgreSQL integration environment.
with app_relations as (
 select c.oid,n.nspname as schema_name,c.relname as table_name,c.relrowsecurity as rls
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where c.relkind='r' and (n.nspname='maintenance_private' or (n.nspname='public' and c.relname in (
 'homes','products','maintenance_tasks','maintenance_history','home_members','home_invites',
 'maintenance_imports','maintenance_push_subscriptions','maintenance_backup_restores','maintenance_push_test_limits')))
), inventories as (
 select r.schema_name||'.'||r.table_name as relation,r.rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'nullable',not a.attnotnull) order by a.attnum)
  from pg_catalog.pg_attribute a where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped) as columns,
 coalesce((select jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_catalog.pg_get_constraintdef(k.oid)) order by k.conname)
  from pg_catalog.pg_constraint k where k.conrelid=r.oid and k.contype='f'),'[]'::jsonb) as foreign_keys
 from app_relations r
)
select coalesce(jsonb_agg(to_jsonb(inventories) order by relation),'[]'::jsonb) from inventories;
