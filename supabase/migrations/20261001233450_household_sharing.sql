-- Private authorization helpers avoid recursive membership RLS.
create schema if not exists maintenance_private;
revoke all on schema maintenance_private from public, anon;
grant usage on schema maintenance_private to authenticated;
alter table public.homes drop constraint homes_owner_id_key;
create index homes_owner_idx on public.homes(owner_id);
create table public.home_members (
  "homeId" uuid not null references public.homes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (length(trim(nickname)) between 1 and 80),
  joined_at timestamptz not null default now(),
  primary key ("homeId", user_id)
);
create index home_members_user_idx on public.home_members(user_id);
create table public.home_invites (
  id uuid primary key default gen_random_uuid(),
  "homeId" uuid not null references public.homes(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  revoked boolean not null default false
);
create index home_invites_home_idx on public.home_invites("homeId");
alter table public.home_members enable row level security;
alter table public.home_invites enable row level security;

create function maintenance_private.owns_home(home_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.homes h where h.id = home_id and h.owner_id = auth.uid());
$$;
create function maintenance_private.access_home(home_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (maintenance_private.owns_home(home_id)
    or exists (select 1 from public.home_members m where m."homeId" = home_id and m.user_id = auth.uid()));
$$;
revoke all on function maintenance_private.owns_home(uuid), maintenance_private.access_home(uuid) from public, anon;
grant execute on function maintenance_private.owns_home(uuid), maintenance_private.access_home(uuid) to authenticated;

drop policy own_products on public.products;
create policy accessible_products on public.products for all to authenticated
  using (maintenance_private.access_home("homeId"))
  with check (maintenance_private.access_home("homeId"));
-- Task and history policies follow the visible product through RLS.
drop policy own_home on public.homes;
create policy accessible_home on public.homes for select to authenticated using (maintenance_private.access_home(id));
create policy insert_own_home on public.homes for insert to authenticated with check (owner_id = (select auth.uid()));
create policy update_own_home on public.homes for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy delete_own_home on public.homes for delete to authenticated using (owner_id = (select auth.uid()));
create policy view_members on public.home_members for select to authenticated using (maintenance_private.access_home("homeId"));
create policy owner_add_members on public.home_members for insert to authenticated with check (maintenance_private.owns_home("homeId"));
create policy remove_members on public.home_members for delete to authenticated using (user_id = (select auth.uid()) or maintenance_private.owns_home("homeId"));
create policy owner_invites on public.home_invites for all to authenticated using (maintenance_private.owns_home("homeId")) with check (maintenance_private.owns_home("homeId"));
revoke all on public.home_members, public.home_invites from anon;
grant select, insert, delete on public.home_members to authenticated;
grant select, insert, update, delete on public.home_invites to authenticated;

create or replace function public.load_household() returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  -- Serializes first-load retries; owned home creation no longer relies on a unique owner.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  if not exists (select 1 from public.homes where owner_id = auth.uid()) then
    insert into public.homes(owner_id) values (auth.uid());
  end if;
  return jsonb_build_object(
    'homes', (select coalesce(jsonb_agg((to_jsonb(h) - 'owner_id') || jsonb_build_object('role', case when h.owner_id = auth.uid() then 'owner' else 'member' end) order by h.name, h.id), '[]'::jsonb) from public.homes h),
    'products', (select coalesce(jsonb_agg(to_jsonb(p) order by p.name), '[]'::jsonb) from public.products p),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t."nextDueAt"), '[]'::jsonb) from public.maintenance_tasks t),
    'history', (select coalesce(jsonb_agg(to_jsonb(h) order by h."completedAt" desc), '[]'::jsonb) from public.maintenance_history h)
  );
end; $$;
create function public.create_maintenance_home(home_name text, home_kind text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or length(trim(home_name)) not between 1 and 80 then raise exception 'Invalid home'; end if;
  insert into public.homes(owner_id,name,kind) values(auth.uid(),trim(home_name),home_kind);
end; $$;
create function public.create_home_invite(home_id uuid) returns text
language plpgsql security invoker set search_path = '' as $$
declare token text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
begin
  if not maintenance_private.owns_home(home_id) then raise exception 'Home unavailable'; end if;
  insert into public.home_invites("homeId",token_hash) values(home_id,sha256(convert_to(token,'UTF8')));
  return token;
end; $$;
-- Redemption must read a hashed invite before membership exists. This is the only
-- privileged mutation; identity, expiry, owner self-join and single-use are checked.
create function maintenance_private.accept_home_invite(invite_code text, member_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare invitation public.home_invites;
begin
  if auth.uid() is null or length(trim(member_name)) not between 1 and 80 or invite_code !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invite'; end if;
  select * into invitation from public.home_invites where token_hash = sha256(convert_to(invite_code,'UTF8')) for update;
  if not found or invitation.revoked or invitation.used_at is not null or invitation.expires_at <= now() then raise exception 'Invite unavailable'; end if;
  if maintenance_private.owns_home(invitation."homeId") then raise exception 'Already owner'; end if;
  insert into public.home_members("homeId",user_id,nickname) values(invitation."homeId",auth.uid(),trim(member_name)) on conflict do nothing;
  update public.home_invites set used_at = now() where id = invitation.id;
end; $$;
revoke all on function maintenance_private.accept_home_invite(text,text) from public, anon;
grant execute on function maintenance_private.accept_home_invite(text,text) to authenticated;
create function public.accept_home_invite(invite_code text, member_name text) returns void
language sql security invoker set search_path = '' as $$ select maintenance_private.accept_home_invite(invite_code,member_name); $$;
revoke all on function public.create_maintenance_home(text,text), public.create_home_invite(uuid), public.accept_home_invite(text,text) from public, anon;
grant execute on function public.create_maintenance_home(text,text), public.create_home_invite(uuid), public.accept_home_invite(text,text) to authenticated;
