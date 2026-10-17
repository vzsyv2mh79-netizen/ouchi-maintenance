-- Dormant acknowledgement of SERVER registration absence, not remote OS wipe.
-- Canonical Web/native erasers must first resolve every unknown external send.
-- Device-local cache/Keychain cleanup is an independent retryable client flow.
-- No retention evidence, deployment, schedule or completion is created here.
begin;
create function public.maintenance_deletion_registrations_are_erased(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease)
 or not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured and lease_until>clock_timestamp())
 or exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled) then return false;end if;
 -- All retained Ouchi epochs. Jobs have a mandatory cascading device FK;
 -- canonical erasure refuses unknown/started sends before removing that parent.
 return not exists(select 1 from public.maintenance_push_subscriptions where user_id=target_user)
 and not exists(select 1 from public.maintenance_push_test_limits where user_id=target_user)
 and not exists(select 1 from maintenance_private.native_notification_devices where user_id=target_user)
 and not exists(select 1 from maintenance_private.native_delivery_identities where user_id=target_user)
 and not exists(select 1 from maintenance_private.native_notification_jobs j join maintenance_private.native_notification_devices d on d.id=j.device_id where d.user_id=target_user);
end;$$;
revoke all on function public.maintenance_deletion_registrations_are_erased(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.maintenance_deletion_registrations_are_erased(uuid,uuid,uuid,uuid) to service_role;
create function public.maintenance_deletion_retention_is_confirmed(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql volatile security invoker set search_path='' as $$
 select public.maintenance_deletion_identity_is_erased(target_request,target_user,target_epoch,target_lease)
 and exists(select 1 from maintenance_private.account_deletion_requests r join maintenance_private.deletion_retention_checks c on c.request_id=r.id
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch and r.state='running' and r.lease_token=target_lease and r.lease_until>clock_timestamp()
 and c.checked_at<=clock_timestamp() and c.confirmed_until>clock_timestamp());
$$;
revoke all on function public.maintenance_deletion_retention_is_confirmed(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.maintenance_deletion_retention_is_confirmed(uuid,uuid,uuid,uuid) to service_role;
commit;
