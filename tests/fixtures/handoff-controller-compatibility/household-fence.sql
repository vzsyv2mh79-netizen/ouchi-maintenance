-- Review patch for actual household table/column names, NOT an enabled migration.
-- No coordinator/worker grants until all writer categories and retention are integrated.
create table maintenance_private.household_principal_fences(
 user_id uuid primary key, stopped boolean not null default false);
create table maintenance_private.household_write_routes(
 kind text not null, object_id uuid not null, home_id uuid not null, owner_id uuid not null,
 primary key(kind,object_id));
alter table maintenance_private.household_principal_fences enable row level security;
alter table maintenance_private.household_write_routes enable row level security;
revoke all on maintenance_private.household_principal_fences,maintenance_private.household_write_routes from public,anon,authenticated,service_role;
-- Routes survive cascading parent deletion so BEFORE DELETE child guards can resolve ownership.
insert into maintenance_private.household_write_routes select 'homes',id,id,owner_id from public.homes;
insert into maintenance_private.household_write_routes select 'products',p.id,h.id,h.owner_id from public.products p join public.homes h on h.id=p."homeId";
insert into maintenance_private.household_write_routes select 'maintenance_tasks',t.id,h.id,h.owner_id from public.maintenance_tasks t join public.products p on p.id=t."productId" join public.homes h on h.id=p."homeId";
create function maintenance_private.assert_household_principals(ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare p uuid; blocked boolean;
begin
 for p in select distinct i from unnest(ids) i where i is not null order by i loop
  -- Existing enrollment/deletion RPCs use this account advisory lock first.
  perform pg_advisory_xact_lock(hashtext(p::text));
  if not exists(select 1 from auth.users where id=p) then raise exception 'Household principal absent';end if;
  insert into maintenance_private.household_principal_fences(user_id) values(p) on conflict do nothing;
  select stopped into blocked from maintenance_private.household_principal_fences where user_id=p for update;
  if blocked then raise exception 'Household principal stopped';end if;
 end loop;
end $$;
create function maintenance_private.guard_household_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb; prior jsonb; h uuid; own uuid; participant uuid; actor uuid:=auth.uid(); object_id uuid; parent_id uuid; parent_kind text;hold uuid;
begin
 if tg_op='DELETE' then r:=to_jsonb(old);else r:=to_jsonb(new);end if;
 if tg_op='UPDATE' then
  prior:=to_jsonb(old);
  if tg_table_name='homes' and prior->'owner_id' is distinct from r->'owner_id' then
   if maintenance_private.allowed_household_handoff(prior,r) then return new;else raise exception 'Verified handoff required';end if;
  end if;
  if prior->'id' is distinct from r->'id' or prior->'homeId' is distinct from r->'homeId'
   or prior->'productId' is distinct from r->'productId' or prior->'taskId' is distinct from r->'taskId'
   or prior->'anchor_home' is distinct from r->'anchor_home' or prior->'fingerprint' is distinct from r->'fingerprint'
   or prior->'owner_id' is distinct from r->'owner_id' or prior->'user_id' is distinct from r->'user_id' then
   raise exception 'Immutable household write scope';
  end if;
 end if;
 object_id:=(r->>'id')::uuid;
 if tg_table_name='homes' then h:=object_id;own:=(r->>'owner_id')::uuid;
 elsif tg_table_name='maintenance_backup_restores' then
  h:=(r->>'anchor_home')::uuid;participant:=(r->>'owner_id')::uuid;
  select rt.owner_id into own from maintenance_private.household_write_routes rt where rt.kind='homes' and rt.object_id=h;
 elsif tg_table_name in('home_members','home_invites','products','maintenance_imports') then
  h:=(r->>'homeId')::uuid;
  select rt.owner_id into own from maintenance_private.household_write_routes rt where rt.kind='homes' and rt.object_id=h;
  if tg_table_name='home_members' then participant:=(r->>'user_id')::uuid;end if;
 else
  parent_id:=(r->>'productId')::uuid;parent_kind:='products';
  select rt.home_id,rt.owner_id into h,own from maintenance_private.household_write_routes rt where rt.kind=parent_kind and rt.object_id=parent_id;
 end if;
 if h is null or own is null then raise exception 'Missing household write route';end if;
 select principal into hold from maintenance_private.household_family_holds where home_id=h;
 perform maintenance_private.assert_household_principals(array[actor,own,participant,hold],tg_table_name,tg_op,h,participant);
 -- Do not accept an unauthenticated ordinary caller; service routines retain their existing authorization.
 if actor is null and (case when current_setting('role',true)='none' then session_user::text else current_setting('role',true) end)='authenticated' then raise exception 'Actor required';end if;
 if tg_op='INSERT' and tg_table_name in('homes','products','maintenance_tasks') then
  insert into maintenance_private.household_write_routes values(tg_table_name,object_id,h,own);
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function maintenance_private.assert_household_principals(uuid[]),maintenance_private.guard_household_write() from public,anon,authenticated,service_role;
create trigger household_write_fence before insert or update or delete on public.homes for each row execute function maintenance_private.guard_household_write();
create trigger household_write_fence before insert or update or delete on public.products for each row execute function maintenance_private.guard_household_write();
create trigger household_write_fence before insert or update or delete on public.maintenance_tasks for each row execute function maintenance_private.guard_household_write();
create trigger household_write_fence before insert or update or delete on public.maintenance_history for each row execute function maintenance_private.guard_household_write();
create trigger household_write_fence before insert or update or delete on public.home_members for each row execute function maintenance_private.guard_household_write();
create trigger household_write_fence before insert or update or delete on public.home_invites for each row execute function maintenance_private.guard_household_write();

create trigger household_write_fence before insert or update or delete on public.maintenance_imports for each row execute function maintenance_private.guard_household_write();
create trigger household_write_fence before insert or update or delete on public.maintenance_backup_restores for each row execute function maintenance_private.guard_household_write();
