-- Dormant physical admission boundary; starts disabled, allocation zero and
-- writer coverage unverified. No live approval/activation or Storage operation.
-- Originals and copies remain charged independently until definitive absence
-- and late-writer fencing support a separately reviewed release. No timed or
-- metadata-only release exists here; source-path metadata blocks completion.
begin;
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
 object_path text not null unique check(object_path ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|households/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|pdf)$'),
 check(split_part(object_path,'/',1)<>'00000000-0000-0000-0000-000000000000'
 and split_part(object_path,'/',2)<>'00000000-0000-0000-0000-000000000000'
 and split_part(split_part(object_path,'/',3),'.',1)<>'00000000-0000-0000-0000-000000000000'),
 size_bytes bigint not null check(size_bytes between 1 and 5242880),
 purpose text not null check(purpose in ('upload','transfer-copy','household-copy')),
 check((purpose='household-copy')=(split_part(object_path,'/',1)='households')),
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

-- Preserve prior completion/retention gates; identifying source paths must be
-- removed through future verified release/minimization before completion.
create or replace function public.maintenance_deletion_completion_is_confirmed(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.account_deletion_requests r
 join maintenance_private.deletion_retention_checks c on c.request_id=r.id
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch
 and r.state='complete' and r.completion_lease=target_lease and r.receipt_expires_at>statement_timestamp()
 and r.identity_erased and r.records_erased and r.inventory_captured and r.receipt_sessions_captured
 and c.checked_at<=r.updated_at and c.confirmed_until>r.updated_at
 and r.receipt_expires_at=r.updated_at+make_interval(secs=>c.receipt_lifetime_seconds))
 and exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 and not exists(select 1 from maintenance_private.restore_transfer_jobs where user_id=target_user)
 and not exists(select 1 from maintenance_private.attest_registration_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_attested_keys where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.ownerless_home_claims where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_file_inspections where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_file_decisions where user_id=target_user)
 and not exists(select 1 from maintenance_private.attachment_capacity_claims where split_part(object_path,'/',1)=target_user::text)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
create or replace function public.complete_maintenance_account_deletion(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare receipt_seconds integer;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if exists(select 1 from maintenance_private.ownerless_home_claims where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_file_inspections where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_file_decisions where user_id=target_user)
 or exists(select 1 from maintenance_private.attachment_capacity_claims where split_part(object_path,'/',1)=target_user::text) then return false; end if;
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 perform 1 from maintenance_private.enrollment_policy where id=1 and require_explicit for share;
 if not found then return false; end if;
 -- Idempotent acknowledgement never extends expiry or changes timestamps.
 if public.maintenance_deletion_completion_is_confirmed(target_request,target_user,target_epoch,target_lease) then return true; end if;
 if not public.maintenance_deletion_identity_is_erased(target_request,target_user,target_epoch,target_lease)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request)
 or not exists(select 1 from maintenance_private.deletion_receipt_sessions where request_id=target_request) then return false; end if;
 select c.receipt_lifetime_seconds into receipt_seconds from maintenance_private.deletion_retention_checks c
 where c.request_id=target_request and c.checked_at<=statement_timestamp() and c.confirmed_until>statement_timestamp() for share;
 if not found then return false; end if;
 update maintenance_private.account_deletion_requests set state='complete',completion_lease=target_lease,
 lease_token=null,lease_until=null,updated_at=statement_timestamp(),receipt_expires_at=statement_timestamp()+make_interval(secs=>receipt_seconds)
 where id=target_request;
 return public.maintenance_deletion_completion_is_confirmed(target_request,target_user,target_epoch,target_lease);
end;$$;
commit;
