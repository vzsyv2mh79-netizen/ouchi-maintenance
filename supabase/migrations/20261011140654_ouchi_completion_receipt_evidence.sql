begin;
-- A completed state/expiry flag is insufficient without its sealed evidence.
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
 and not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
create or replace function public.read_maintenance_session_deletion_progress(target_user uuid,verified_session uuid,target_request uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('requestID',r.id,'userID',r.user_id,'epochID',r.app_epoch_id,'state',r.state)
 from maintenance_private.account_deletion_requests r
 where r.user_id=target_user and (target_request is null or r.id=target_request)
 and public.maintenance_auth_session_is_current(target_user,verified_session)
 and not exists(select 1 from maintenance_private.app_epochs e where e.user_id=target_user and e.epoch_id<>r.app_epoch_id)
 and case when r.receipt_sessions_captured then
  exists(select 1 from maintenance_private.deletion_receipt_sessions s where s.request_id=r.id and s.session_id=verified_session)
  and (r.state<>'complete' or public.maintenance_deletion_completion_is_confirmed(r.id,r.user_id,r.app_epoch_id,r.completion_lease))
 else exists(select 1 from maintenance_private.app_epochs e where e.user_id=target_user and e.epoch_id=r.app_epoch_id)
  and r.state<>'complete' end
 order by r.requested_at desc,r.id limit 1;
$$;
revoke all on function public.maintenance_deletion_completion_is_confirmed(uuid,uuid,uuid,uuid),public.read_maintenance_session_deletion_progress(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.maintenance_deletion_completion_is_confirmed(uuid,uuid,uuid,uuid),public.read_maintenance_session_deletion_progress(uuid,uuid,uuid) to service_role;
commit;
