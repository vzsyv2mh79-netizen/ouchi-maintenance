-- Local private handoff port. Backend must verify BOTH signed consent records
-- under locks in the very same transaction before issuing this private context.
create table maintenance_private.household_handoff_plans(
 home_id uuid primary key,owner_id uuid not null,successor_id uuid not null,
 scope jsonb not null,plan jsonb not null,plan_digest text not null check(plan_digest ~ '^[a-f0-9]{64}$'),
 snapshot jsonb not null,check(owner_id<>successor_id));
create table maintenance_private.household_handoff_consents(
 home_id uuid not null,actor_id uuid not null,token text not null,revoked_at timestamptz,
 primary key(home_id,actor_id));
create table maintenance_private.household_family_holds(
 home_id uuid primary key,principal uuid not null,scope jsonb not null);
create table maintenance_private.household_handoff_contexts(
 token uuid primary key,home_id uuid not null,owner_id uuid not null,successor_id uuid not null,
 scope jsonb not null,native_lease uuid not null,plan_digest text not null,
 backend_pid int not null,transaction_id bigint not null,expires_at timestamptz not null);
alter table maintenance_private.household_handoff_plans enable row level security;
alter table maintenance_private.household_handoff_consents enable row level security;
alter table maintenance_private.household_family_holds enable row level security;
alter table maintenance_private.household_handoff_contexts enable row level security;
revoke all on maintenance_private.household_handoff_plans,maintenance_private.household_handoff_consents,maintenance_private.household_family_holds,maintenance_private.household_handoff_contexts from public,anon,authenticated,service_role;
create function maintenance_private.household_family_snapshot(h uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'home',(select to_jsonb(x)-'owner_id' from public.homes x where id=h),
 'members',(select coalesce(jsonb_agg(to_jsonb(x) order by user_id),'[]') from public.home_members x where "homeId"=h),
 'products',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.products x where "homeId"=h),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.maintenance_tasks x join public.products p on p.id=x."productId" where p."homeId"=h),
 'history',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.maintenance_history x join public.products p on p.id=x."productId" where p."homeId"=h))
$$;
create function maintenance_private.allowed_household_handoff(before_row jsonb,after_row jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare t text:=current_setting('maintenance.handoff_context',true);c maintenance_private.household_handoff_contexts;
 p maintenance_private.household_handoff_plans;b maintenance_private.household_stop_bindings;
begin
 if t is null or t='' then return false;end if;
 select x.* into c from maintenance_private.household_handoff_contexts x where x.token=t::uuid;
 if c.token is null or c.backend_pid<>pg_backend_pid() or c.transaction_id<>txid_current() or c.expires_at<=clock_timestamp() then return false;end if;
 select * into p from maintenance_private.household_handoff_plans where home_id=c.home_id for update;
 select * into b from maintenance_private.household_stop_bindings where user_id=c.owner_id for update;
 if p.home_id is null or b.user_id is null or p.scope is distinct from c.scope or p.plan_digest is distinct from c.plan_digest
  or p.owner_id is distinct from c.owner_id or p.successor_id is distinct from c.successor_id
  or b.scope is distinct from c.scope or b.native_lease is distinct from c.native_lease or b.state<>'processing' or b.lease_until<=clock_timestamp()
  or not exists(select 1 from maintenance_private.household_principal_fences where user_id=c.owner_id and stopped)
  or not exists(select 1 from maintenance_private.household_family_holds where home_id=c.home_id and principal=c.owner_id and scope=c.scope)
  or not exists(select 1 from auth.users where id=c.successor_id)
  or exists(select 1 from maintenance_private.household_principal_fences where user_id=c.successor_id and stopped)
  or not exists(select 1 from public.home_members where "homeId"=c.home_id and user_id=c.successor_id)
  or before_row->>'id' is distinct from c.home_id::text or before_row->>'owner_id' is distinct from c.owner_id::text
  or after_row->>'owner_id' is distinct from c.successor_id::text or (before_row-'owner_id') is distinct from (after_row-'owner_id')
  or maintenance_private.household_family_snapshot(c.home_id) is distinct from p.snapshot then return false;end if;
 return true;
end $$;
revoke all on function maintenance_private.household_family_snapshot(uuid),maintenance_private.allowed_household_handoff(jsonb,jsonb) from public,anon,authenticated,service_role;
-- Handoff stage receipt only; NEVER claims whole-account deletion completion.
create table maintenance_private.household_handoff_receipts(
 home_id uuid primary key,scope jsonb not null,successor_id uuid not null,
 plan_digest text not null,snapshot_digest text not null,completed_at timestamptz not null default clock_timestamp());
alter table maintenance_private.household_handoff_receipts enable row level security;
revoke all on maintenance_private.household_handoff_receipts from public,anon,authenticated,service_role;
