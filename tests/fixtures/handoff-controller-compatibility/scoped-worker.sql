-- Local review ONLY. No production roles/grants or endpoint activation.
create function maintenance_private.valid_household_scope(s jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare a jsonb;x text;names text[]:='{}';pattern text:='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
 if jsonb_typeof(s) is distinct from 'object' or s->>'protocolVersion' is distinct from '2' or s->>'kind' is distinct from 'shared-account'
  or coalesce(s->>'inventoryDigest','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(s->'apps') is distinct from 'array' then return false;end if;
 for x in select s->>k from unnest(array['requestID','userID','leaseToken']) k loop
  if x is null or x !~ pattern or x='00000000-0000-0000-0000-000000000000' then return false;end if;
 end loop;
 if jsonb_array_length(s->'apps')=0 then return false;end if;
 for a in select value from jsonb_array_elements(s->'apps') loop
  if jsonb_typeof(a) is distinct from 'object' or coalesce(a->>'app','') !~ '^[-a-z0-9]{1,40}$' or (a->>'app')=any(names) then return false;end if;
  names:=array_append(names,a->>'app');
  for x in select a->>k from unnest(array['requestID','scopeID']) k loop
   if x is null or x !~ pattern or x='00000000-0000-0000-0000-000000000000' then return false;end if;
  end loop;
 end loop;
 return true;
end $$;
revoke all on function maintenance_private.valid_household_scope(jsonb) from public,anon,authenticated,service_role;
create table maintenance_private.household_stop_bindings(
 user_id uuid primary key, scope jsonb not null, native_lease uuid not null,
 lease_until timestamptz not null, state text not null check(state in('requested','processing','closed')),
 check(maintenance_private.valid_household_scope(scope)),
 check(scope->>'userID'=user_id::text),check(scope->>'inventoryDigest' ~ '^[a-f0-9]{64}$'),
 check(jsonb_typeof(scope->'apps')='array'));
create table maintenance_private.household_worker_capabilities(
 token uuid primary key, user_id uuid not null, scope jsonb not null,native_lease uuid not null,
 backend_pid int not null, transaction_id bigint not null, home_id uuid not null,
 table_name text not null check(table_name='home_members'), operation text not null check(operation='DELETE'),
 expires_at timestamptz not null);
alter table maintenance_private.household_stop_bindings enable row level security;
alter table maintenance_private.household_worker_capabilities enable row level security;
revoke all on maintenance_private.household_stop_bindings,maintenance_private.household_worker_capabilities from public,anon,authenticated,service_role;
-- Only a trusted coordinator can call this after validated enrollment/inventory.
-- It has deliberately NO role grant here; fixture controller is not production authority.
create function maintenance_private.freeze_household_scope(s jsonb,n uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare p uuid:=(s->>'userID')::uuid;b maintenance_private.household_stop_bindings;
begin
 perform pg_advisory_xact_lock(hashtext(p::text));
 select * into b from maintenance_private.household_stop_bindings where user_id=p for update;
 if not found or b.scope is distinct from s or b.native_lease is distinct from n
  or b.state<>'requested' or b.lease_until<=clock_timestamp() then raise exception 'Freeze binding mismatch';end if;
 if not exists(select 1 from jsonb_array_elements(s->'apps') a where a->>'app'='ouchi-maintenance' and a->>'requestID' is not null and a->>'scopeID' is not null)
  or not exists(select 1 from auth.users where id=p) then raise exception 'Freeze inventory absent';end if;
 insert into maintenance_private.household_principal_fences(user_id) values(p) on conflict do nothing;
 perform 1 from maintenance_private.household_principal_fences where user_id=p for update;
 update maintenance_private.household_stop_bindings set state='processing' where user_id=p;
 update maintenance_private.household_principal_fences set stopped=true where user_id=p;
end $$;
create function maintenance_private.issue_membership_delete_capability(s jsonb,n uuid,h uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p uuid:=(s->>'userID')::uuid;b maintenance_private.household_stop_bindings;t uuid:=gen_random_uuid();own uuid;
begin
 if (case when current_setting('role',true)='none' then session_user::text else current_setting('role',true) end)<>'hh_worker' then raise exception 'Review worker role required';end if;
 perform pg_advisory_xact_lock(hashtext(p::text));
 select * into b from maintenance_private.household_stop_bindings where user_id=p for update;
 if not found or b.state<>'processing' or b.scope is distinct from s or b.native_lease is distinct from n
  or b.lease_until<=clock_timestamp() or not exists(select 1 from maintenance_private.household_principal_fences where user_id=p and stopped)
  then raise exception 'Capability scope mismatch';end if;
 select rt.owner_id into own from maintenance_private.household_write_routes rt where rt.kind='homes' and rt.object_id=h;
 -- Never remove household owner membership or mutate ownership using this capability.
 if own is null or own=p or not exists(select 1 from public.home_members where "homeId"=h and user_id=p) then raise exception 'Membership target unavailable';end if;
 insert into maintenance_private.household_worker_capabilities values(t,p,s,n,pg_backend_pid(),txid_current(),h,'home_members','DELETE',clock_timestamp()+interval '30 seconds');
 perform set_config('maintenance.worker_capability',t::text,true);return t;
end $$;
create or replace function maintenance_private.assert_household_principals(ids uuid[],tbl text,op text,h uuid,target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p uuid;blocked boolean;c maintenance_private.household_worker_capabilities;b maintenance_private.household_stop_bindings;worker_token text;
begin
 -- A worker role is never an ordinary household writer, even for an open owner.
 if (case when current_setting('role',true)='none' then session_user::text else current_setting('role',true) end)='hh_worker' then
  worker_token:=current_setting('maintenance.worker_capability',true);
  if worker_token is null or worker_token='' then raise exception 'Worker capability required';end if;
  select cap.* into c from maintenance_private.household_worker_capabilities cap where cap.token=worker_token::uuid;
  if c.token is null or target is distinct from c.user_id or tbl is distinct from c.table_name or op is distinct from c.operation
   or h is distinct from c.home_id or c.backend_pid<>pg_backend_pid() or c.transaction_id<>txid_current()
   or c.expires_at<=clock_timestamp() then raise exception 'Household worker operation mismatch';end if;
  select * into b from maintenance_private.household_stop_bindings where user_id=target;
  if b.user_id is null or b.state<>'processing' or b.scope is distinct from c.scope or b.native_lease is distinct from c.native_lease
   or b.lease_until<=clock_timestamp() or not exists(select 1 from maintenance_private.household_principal_fences where user_id=target and stopped)
   then raise exception 'Worker binding inactive';end if;
 end if;
 for p in select distinct i from unnest(ids) i where i is not null order by i loop
  perform pg_advisory_xact_lock(hashtext(p::text));
  -- Do not create anchors after Auth deletion. Existing durable anchors remain.
  if exists(select 1 from auth.users where id=p) then
   insert into maintenance_private.household_principal_fences(user_id) values(p) on conflict do nothing;
  end if;
  select stopped into blocked from maintenance_private.household_principal_fences where user_id=p for update;
  if not found then raise exception 'Household principal absent';end if;
  if blocked then
   worker_token:=current_setting('maintenance.worker_capability',true);
   if (case when current_setting('role',true)='none' then session_user::text else current_setting('role',true) end)<>'hh_worker'
    or worker_token is null or worker_token='' then raise exception 'Household principal stopped';end if;
   select cap.* into c from maintenance_private.household_worker_capabilities cap where cap.token=worker_token::uuid;
   select * into b from maintenance_private.household_stop_bindings where user_id=p for update;
   if c.token is null or b.user_id is null or b.state<>'processing' or c.user_id is distinct from p
    or target is distinct from p or tbl is distinct from c.table_name or op is distinct from c.operation or h is distinct from c.home_id
    or c.scope is distinct from b.scope or c.native_lease is distinct from b.native_lease
    or b.lease_until<=clock_timestamp() or c.expires_at<=clock_timestamp()
    or c.backend_pid<>pg_backend_pid() or c.transaction_id<>txid_current() then raise exception 'Household worker capability mismatch';end if;
  elsif not exists(select 1 from auth.users where id=p) then raise exception 'Household principal absent';
  end if;
 end loop;
end $$;
revoke all on function maintenance_private.freeze_household_scope(jsonb,uuid),maintenance_private.issue_membership_delete_capability(jsonb,uuid,uuid),maintenance_private.assert_household_principals(uuid[],text,text,uuid,uuid) from public,anon,authenticated,service_role;
-- hh_worker grant is issued ONLY by the dedicated test fixture, not this patch.
