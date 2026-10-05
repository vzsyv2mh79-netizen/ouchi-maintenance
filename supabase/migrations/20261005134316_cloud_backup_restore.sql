-- Restore an entire backup into separate private homes, without overwriting shared records.
create table public.maintenance_backup_restores (
  owner_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  anchor_home uuid not null references public.homes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, fingerprint)
);
alter table public.maintenance_backup_restores enable row level security;
create policy own_backup_restores on public.maintenance_backup_restores for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.homes h where h.id=anchor_home and h.owner_id=(select auth.uid())));
revoke all on public.maintenance_backup_restores from anon;
grant select, insert on public.maintenance_backup_restores to authenticated;
create function public.restore_maintenance_backup(backup_hash text, payload jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare home_data jsonb; home_id uuid; first_home uuid; part jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  if backup_hash is null or backup_hash !~ '^[0-9a-f]{64}$' or payload is null or octet_length(payload::text)>10485760
    or jsonb_typeof(payload->'homes') is distinct from 'array'
    or jsonb_typeof(payload->'products') is distinct from 'array'
    or jsonb_typeof(payload->'tasks') is distinct from 'array'
    or jsonb_typeof(payload->'history') is distinct from 'array' then raise exception 'Invalid backup'; end if;
  if jsonb_array_length(payload->'homes') not between 1 and 10000
    or jsonb_array_length(payload->'products')>10000 or jsonb_array_length(payload->'tasks')>10000
    or jsonb_array_length(payload->'history')>10000 then raise exception 'Backup too large'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'products') p where not exists(select 1 from jsonb_array_elements(payload->'homes') h where h->>'id'=p->>'homeId'))
    or exists(select 1 from jsonb_array_elements(payload->'tasks') t where not exists(select 1 from jsonb_array_elements(payload->'products') p where p->>'id'=t->>'productId'))
    or exists(select 1 from jsonb_array_elements(payload->'history') h where not exists(select 1 from jsonb_array_elements(payload->'tasks') t where t->>'id'=h->>'taskId' and t->>'productId'=h->>'productId')) then raise exception 'Invalid backup relationships'; end if;
  if exists(select 1 from public.maintenance_backup_restores where owner_id=auth.uid() and fingerprint=backup_hash) then return false; end if;
  for home_data in select value from jsonb_array_elements(payload->'homes') loop
    home_id := (home_data->>'id')::uuid;
    if length(trim(home_data->>'name')) not between 1 and 10000 then raise exception 'Invalid home name'; end if;
    insert into public.homes(id,owner_id,name,kind) values(home_id,auth.uid(),home_data->>'name',home_data->>'kind');
    if first_home is null then first_home := home_id; end if;
    part := jsonb_build_object(
      'products',(select coalesce(jsonb_agg(p),'[]'::jsonb) from jsonb_array_elements(payload->'products') p where p->>'homeId'=home_id::text),
      'tasks',(select coalesce(jsonb_agg(t),'[]'::jsonb) from jsonb_array_elements(payload->'tasks') t where exists(select 1 from jsonb_array_elements(payload->'products') p where p->>'id'=t->>'productId' and p->>'homeId'=home_id::text)),
      'history',(select coalesce(jsonb_agg(h),'[]'::jsonb) from jsonb_array_elements(payload->'history') h where exists(select 1 from jsonb_array_elements(payload->'products') p where p->>'id'=h->>'productId' and p->>'homeId'=home_id::text)));
    perform public.import_maintenance(home_id,backup_hash,part);
  end loop;
  insert into public.maintenance_backup_restores(owner_id,fingerprint,anchor_home) values(auth.uid(),backup_hash,first_home);
  return true;
end; $$;
revoke all on function public.restore_maintenance_backup(text,jsonb) from public,anon;
grant execute on function public.restore_maintenance_backup(text,jsonb) to authenticated;
