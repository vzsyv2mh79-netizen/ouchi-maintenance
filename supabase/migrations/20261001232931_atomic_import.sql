-- Additive import. Home-row locking serializes retries with the same fingerprint.
create table public.maintenance_imports (
  "homeId" uuid not null references public.homes(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key ("homeId", fingerprint)
);
alter table public.maintenance_imports enable row level security;
create policy own_imports on public.maintenance_imports for all to authenticated
  using (exists (select 1 from public.homes h where h.id = "homeId" and h.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.homes h where h.id = "homeId" and h.owner_id = (select auth.uid())));
revoke all on public.maintenance_imports from anon;
grant select, insert on public.maintenance_imports to authenticated;

create function public.import_maintenance(target_home uuid, import_hash text, payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform 1 from public.homes where id = target_home and owner_id = auth.uid() for update;
  if not found then raise exception 'Home unavailable'; end if;
  if exists (select 1 from public.maintenance_imports where "homeId" = target_home and fingerprint = import_hash) then return; end if;
  if import_hash is null or import_hash !~ '^[0-9a-f]{64}$' or payload is null or octet_length(payload::text) > 10485760
    or jsonb_typeof(payload->'products') is distinct from 'array'
    or jsonb_typeof(payload->'tasks') is distinct from 'array'
    or jsonb_typeof(payload->'history') is distinct from 'array' then raise exception 'Invalid import'; end if;
  if jsonb_array_length(payload->'products') > 10000 or jsonb_array_length(payload->'tasks') > 10000 or jsonb_array_length(payload->'history') > 10000 then raise exception 'Import too large'; end if;
  if exists (select 1 from jsonb_array_elements(payload->'products') p where p->>'homeId' is distinct from target_home::text)
    or exists (select 1 from jsonb_array_elements(payload->'tasks') t where not exists (select 1 from jsonb_array_elements(payload->'products') p where p->>'id' = t->>'productId'))
    or exists (select 1 from jsonb_array_elements(payload->'history') h where not exists (select 1 from jsonb_array_elements(payload->'tasks') t where t->>'id' = h->>'taskId' and t->>'productId' = h->>'productId')) then raise exception 'Invalid import relationships'; end if;
  insert into public.products select * from jsonb_populate_recordset(null::public.products, payload->'products');
  insert into public.maintenance_tasks select * from jsonb_populate_recordset(null::public.maintenance_tasks, payload->'tasks');
  insert into public.maintenance_history select * from jsonb_populate_recordset(null::public.maintenance_history, payload->'history');
  insert into public.maintenance_imports("homeId",fingerprint) values (target_home,import_hash);
end; $$;
revoke all on function public.import_maintenance(uuid,text,jsonb) from public, anon;
grant execute on function public.import_maintenance(uuid,text,jsonb) to authenticated;
