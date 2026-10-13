-- Disposable candidate, not a migration or production grant. This accounts
-- for Ouchi's operator-approved share of a shared project's physical storage.
-- Auth/rights, all-writer coverage and project-plan capacity remain prerequisites.
-- Claims never expire/release merely because a request times out, entitlement
-- expires, logical metadata is removed, or ownership moves. Verified physical
-- absence/release integration is deliberately not enabled by this candidate.
create table maintenance_private.attachment_app_budget_policy (
 id integer primary key check(id=1), enabled boolean not null default false,
 writer_coverage_verified boolean not null default false,
 budget_bytes bigint not null default 0 check(budget_bytes between 0 and 1099511627776)
);
insert into maintenance_private.attachment_app_budget_policy(id) values(1);
alter table maintenance_private.attachment_app_budget_policy enable row level security;
revoke all on maintenance_private.attachment_app_budget_policy from public,anon,authenticated,service_role;
grant select on maintenance_private.attachment_app_budget_policy to service_role;

create table maintenance_private.attachment_capacity_claims (
 claim_id uuid primary key check(claim_id<>'00000000-0000-0000-0000-000000000000'),
 object_path text not null unique check(object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|pdf)$'),
 check(split_part(object_path,'/',1)<>'00000000-0000-0000-0000-000000000000'
 and split_part(object_path,'/',2)<>'00000000-0000-0000-0000-000000000000'
 and split_part(split_part(object_path,'/',3),'.',1)<>'00000000-0000-0000-0000-000000000000'),
 size_bytes bigint not null check(size_bytes between 1 and 5242880),
 purpose text not null check(purpose in ('upload','transfer-copy')),
 created_at timestamptz not null default clock_timestamp()
);
alter table maintenance_private.attachment_capacity_claims enable row level security;
revoke all on maintenance_private.attachment_capacity_claims from public,anon,authenticated,service_role;
grant select,insert on maintenance_private.attachment_capacity_claims to service_role;

create function maintenance_private.lock_attachment_app_budget()
returns void language sql security invoker set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('OuchiMaintenance/attachment-app-budget/v1',0));
$$;
revoke all on function maintenance_private.lock_attachment_app_budget() from public,anon,authenticated;
grant execute on function maintenance_private.lock_attachment_app_budget() to service_role;

create function maintenance_private.guard_attachment_budget_policy()
returns trigger language plpgsql security invoker set search_path='' as $$
declare held numeric;
begin
 perform maintenance_private.lock_attachment_app_budget();
 if tg_op='DELETE' then raise exception 'Budget policy must be retained';end if;
 select coalesce(sum(size_bytes),0) into held from maintenance_private.attachment_capacity_claims;
 if new.budget_bytes<held then raise exception 'Held capacity exceeds proposed budget';end if;
 if new.enabled and (not new.writer_coverage_verified or new.budget_bytes=0) then raise exception 'Budget coverage unavailable';end if;
 return new;
end $$;
revoke all on function maintenance_private.guard_attachment_budget_policy() from public,anon,authenticated,service_role;
create trigger attachment_budget_policy_guard before update or delete
on maintenance_private.attachment_app_budget_policy for each row
execute function maintenance_private.guard_attachment_budget_policy();

create function maintenance_private.guard_attachment_capacity_claim()
returns trigger language plpgsql security invoker set search_path='' as $$
declare policy maintenance_private.attachment_app_budget_policy; held numeric;
begin
 perform maintenance_private.lock_attachment_app_budget();
 if tg_op<>'INSERT' then raise exception 'Capacity claim is immutable';end if;
 select * into policy from maintenance_private.attachment_app_budget_policy where id=1;
 if not found or not policy.enabled or not policy.writer_coverage_verified then raise exception 'App storage budget unavailable';end if;
 select coalesce(sum(size_bytes),0) into held from maintenance_private.attachment_capacity_claims;
 if held+new.size_bytes>policy.budget_bytes then raise exception 'App storage budget exceeded';end if;
 return new;
end $$;
revoke all on function maintenance_private.guard_attachment_capacity_claim() from public,anon,authenticated;
grant execute on function maintenance_private.guard_attachment_capacity_claim() to service_role;
create trigger attachment_capacity_claim_guard before insert or update or delete
on maintenance_private.attachment_capacity_claims for each row
execute function maintenance_private.guard_attachment_capacity_claim();

-- Server resource accounting only; this is not upload permission or a paid right.
create function maintenance_private.reserve_attachment_capacity(target_claim uuid,target_path text,target_bytes bigint,target_purpose text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare prior maintenance_private.attachment_capacity_claims; policy maintenance_private.attachment_app_budget_policy;
begin
 if target_claim is null or target_path is null or target_bytes is null or target_purpose is null then raise exception 'Exact capacity scope required';end if;
 perform maintenance_private.lock_attachment_app_budget();
 select * into policy from maintenance_private.attachment_app_budget_policy where id=1;
 if not found or not policy.enabled or not policy.writer_coverage_verified then raise exception 'App storage budget unavailable';end if;
 select * into prior from maintenance_private.attachment_capacity_claims where claim_id=target_claim;
 if found then
  if prior.object_path=target_path and prior.size_bytes=target_bytes and prior.purpose=target_purpose then return prior.claim_id;end if;
  raise exception 'Capacity scope conflict';
 end if;
 insert into maintenance_private.attachment_capacity_claims(claim_id,object_path,size_bytes,purpose)
 values(target_claim,target_path,target_bytes,target_purpose);
 return target_claim;
end $$;
revoke all on function maintenance_private.reserve_attachment_capacity(uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function maintenance_private.reserve_attachment_capacity(uuid,text,bigint,text) to service_role;
