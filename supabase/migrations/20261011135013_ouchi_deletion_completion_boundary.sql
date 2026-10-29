begin;
-- Dormant completion boundary. No retention approval is created here.
-- Runtime service can read, but CANNOT manufacture, operator/checker evidence.
create table maintenance_private.deletion_retention_checks (
 request_id uuid primary key references maintenance_private.account_deletion_requests(id) on delete cascade,
 policy_version text not null check(length(policy_version) between 1 and 128),
 checked_at timestamptz not null,
 confirmed_until timestamptz not null check(confirmed_until>checked_at and confirmed_until<=checked_at+interval '1 hour'),
 receipt_lifetime_seconds integer not null check(receipt_lifetime_seconds between 1 and 2592000)
);
alter table maintenance_private.deletion_retention_checks enable row level security;
revoke all on maintenance_private.deletion_retention_checks from public,anon,authenticated,service_role;
grant select on maintenance_private.deletion_retention_checks to service_role;
-- PostgreSQL row locking needs an UPDATE privilege. This single-column grant
-- allows locking only: the trigger refuses every change to a sealed check.
grant update(request_id) on maintenance_private.deletion_retention_checks to service_role;
create function maintenance_private.sealed_deletion_retention_check() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new is distinct from old then raise exception 'Sealed retention check'; end if;
 return new;
end;$$;
revoke all on function maintenance_private.sealed_deletion_retention_check() from public,anon,authenticated;
create trigger sealed_deletion_retention_check before update on maintenance_private.deletion_retention_checks
for each row execute function maintenance_private.sealed_deletion_retention_check();

alter table maintenance_private.account_deletion_requests add column completion_lease uuid;
grant update(completion_lease,receipt_expires_at) on maintenance_private.account_deletion_requests to service_role;
create function public.maintenance_deletion_completion_is_confirmed(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.account_deletion_requests r
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch
 and r.state='complete' and r.completion_lease=target_lease and r.receipt_expires_at>statement_timestamp()
 and r.identity_erased and r.records_erased and r.inventory_captured and r.receipt_sessions_captured)
 and exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 and not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
create function public.complete_maintenance_account_deletion(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare receipt_seconds integer;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
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
revoke all on function public.maintenance_deletion_completion_is_confirmed(uuid,uuid,uuid,uuid),public.complete_maintenance_account_deletion(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.maintenance_deletion_completion_is_confirmed(uuid,uuid,uuid,uuid),public.complete_maintenance_account_deletion(uuid,uuid,uuid,uuid) to service_role;
commit;
