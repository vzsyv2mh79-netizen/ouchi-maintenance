begin;
-- Additive correction; preserve existing invoker ACLs, leases and ownership gates.
-- No new public endpoint, grant or production activation. External device/outbox
-- acknowledgement remains mandatory even after these SQL-only checks.
create or replace function public.erase_maintenance_deletion_web_push(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured)
 or exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled) then return false; end if;
 -- An expired send lease does not resolve an external delivery outcome.
 if exists(select 1 from public.maintenance_push_subscriptions p where p.user_id=target_user and (p.claim_token is not null or p.claimed_until is not null)) then return false;end if;
 delete from public.maintenance_push_subscriptions where user_id=target_user;
 delete from public.maintenance_push_test_limits where user_id=target_user;
 return true;
end;$$;

create or replace function public.erase_maintenance_deletion_native_push(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured)
 or exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled) then return false; end if;
 -- An expired send lease does not resolve an external delivery outcome.
 if exists(select 1 from maintenance_private.native_notification_jobs j join maintenance_private.native_notification_devices d on d.id=j.device_id where d.user_id=target_user and (j.state='unknown' or (j.state='claimed' and j.send_started_at is not null))) then return false;end if;
 delete from maintenance_private.native_notification_devices where user_id=target_user;
 return not exists(select 1 from maintenance_private.native_notification_devices where user_id=target_user);
end;$$;

create or replace function public.erase_maintenance_deletion_records(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not maintenance_private.owned_homes_have_no_other_members(target_user) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed) then return false; end if;
 if exists(select 1 from maintenance_private.account_deletion_objects o join maintenance_private.product_attachments f on f.id=o.attachment_id where o.request_id=target_request and not maintenance_private.attachment_write_is_quiet(f.id)) then return false; end if;
 if exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled) then return false; end if;
 -- An expired send lease does not resolve an external delivery outcome.
 if exists(select 1 from public.maintenance_push_subscriptions p where p.user_id=target_user and (p.claim_token is not null or p.claimed_until is not null))
 or exists(select 1 from maintenance_private.native_notification_jobs j join maintenance_private.native_notification_devices d on d.id=j.device_id where d.user_id=target_user and (j.state='unknown' or (j.state='claimed' and j.send_started_at is not null))) then return false;end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and records_erased) then return true; end if;
 delete from maintenance_private.product_attachments f using maintenance_private.account_deletion_objects o where o.request_id=target_request and o.attachment_id=f.id;
 delete from public.maintenance_push_subscriptions where user_id=target_user;
 delete from public.home_members where user_id=target_user;
 delete from public.maintenance_backup_restores where owner_id=target_user;
 delete from public.homes where owner_id=target_user;
 update maintenance_private.account_deletion_requests set records_erased=true,updated_at=now() where id=target_request;
 return true;
end;$$;
commit;
