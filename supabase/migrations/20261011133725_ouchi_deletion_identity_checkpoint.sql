begin;
-- Intermediate identity erasure only. Completion/retention remain mandatory.
alter table maintenance_private.account_deletion_requests add column identity_erased boolean not null default false;
grant update(identity_erased) on maintenance_private.account_deletion_requests to service_role;
grant delete on maintenance_private.app_session_epochs,maintenance_private.app_epochs,maintenance_private.account_access to service_role;
create function public.maintenance_deletion_identity_is_erased(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease)
 and exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and identity_erased and inventory_captured and records_erased and receipt_sessions_captured)
 and exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 and not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
create function public.erase_maintenance_deletion_identity(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 -- Pin the strict policy in this transaction, not a separate API preflight.
 perform 1 from maintenance_private.enrollment_policy where id=1 and require_explicit for share;
 if not found then return false; end if;
 if public.maintenance_deletion_identity_is_erased(target_request,target_user,target_epoch,target_lease) then return true; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured and records_erased and receipt_sessions_captured)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request)
 or not exists(select 1 from maintenance_private.deletion_receipt_sessions where request_id=target_request)
 or not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled) then return false; end if;
 -- Absence across all retained epochs is required, not only the current one.
 -- These are only Ouchi tables; shared Auth and unrelated public schemas remain.
 if exists(select 1 from maintenance_private.product_attachments where user_id=target_user or captured_owner_id=target_user)
 or exists(select 1 from maintenance_private.attachment_write_attempts where uploader_id=target_user or owner_id=target_user)
 or exists(select 1 from maintenance_private.reconciliation_jobs where user_id=target_user)
 or exists(select 1 from maintenance_private.native_notification_devices where user_id=target_user)
 or exists(select 1 from maintenance_private.native_delivery_identities where user_id=target_user)
 or exists(select 1 from maintenance_private.reminder_schedules where user_id=target_user)
 or exists(select 1 from maintenance_private.notification_channels where user_id=target_user)
 or exists(select 1 from maintenance_private.enrollment_consents where user_id=target_user)
 or exists(select 1 from maintenance_private.verified_notifications where user_id=target_user)
 or exists(select 1 from maintenance_private.verified_renewals where user_id=target_user)
 or exists(select 1 from maintenance_private.verified_transactions where user_id=target_user)
 or exists(select 1 from maintenance_private.transaction_ownership where user_id=target_user)
 or exists(select 1 from public.homes where owner_id=target_user)
 or exists(select 1 from public.home_members where user_id=target_user)
 or exists(select 1 from public.maintenance_push_subscriptions where user_id=target_user)
 or exists(select 1 from public.maintenance_push_test_limits where user_id=target_user)
 or exists(select 1 from public.maintenance_backup_restores where owner_id=target_user) then return false; end if;
 delete from maintenance_private.app_session_epochs where user_id=target_user;
 delete from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled;
 delete from maintenance_private.account_access where user_id=target_user and not enabled;
 update maintenance_private.account_deletion_requests set identity_erased=true where id=target_request;
 return public.maintenance_deletion_identity_is_erased(target_request,target_user,target_epoch,target_lease);
end;$$;
revoke all on function public.maintenance_deletion_identity_is_erased(uuid,uuid,uuid,uuid),public.erase_maintenance_deletion_identity(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.maintenance_deletion_identity_is_erased(uuid,uuid,uuid,uuid),public.erase_maintenance_deletion_identity(uuid,uuid,uuid,uuid) to service_role;
commit;
