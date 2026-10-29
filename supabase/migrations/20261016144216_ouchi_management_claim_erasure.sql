-- Dormant account erasure integration; no scheduler or live erasure is enabled.
-- Erase only the retiring Ouchi actor's management metadata across retired
-- generations. Family records, other actors, Auth and purchases are untouched.
begin;
create function public.erase_maintenance_deletion_management_claims(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if target_request is null or target_user is null or target_epoch is null or target_lease is null
 or '00000000-0000-0000-0000-000000000000'::uuid=any(array[target_request,target_user,target_epoch,target_lease]) then return false; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease)
 or not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and lease_until>clock_timestamp() and records_erased and inventory_captured)
 then return false; end if;
 -- Refuse active/replacement enrollment and any unresolved household role.
 -- Dispatcher/records stages must preserve family data and detach scope first.
 if exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id where e.user_id=target_user and e.enabled and a.enabled)
 or exists(select 1 from public.homes where owner_id=target_user)
 or exists(select 1 from public.home_members where user_id=target_user) then return false; end if;
 delete from maintenance_private.ownerless_home_claims where user_id=target_user;
 return not exists(select 1 from maintenance_private.ownerless_home_claims where user_id=target_user);
end;$$;
revoke all on function public.erase_maintenance_deletion_management_claims(uuid,uuid,uuid,uuid) from public,anon,authenticated,ouchi_closure_operator,ouchi_home_management_executor;
grant execute on function public.erase_maintenance_deletion_management_claims(uuid,uuid,uuid,uuid) to service_role;

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
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
create or replace function public.complete_maintenance_account_deletion(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare receipt_seconds integer;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if exists(select 1 from maintenance_private.ownerless_home_claims where user_id=target_user) then return false; end if;
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
