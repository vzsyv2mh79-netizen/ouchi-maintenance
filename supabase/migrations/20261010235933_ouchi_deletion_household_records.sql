begin;
-- Leased application-record erasure only. Not a complete identity deletion;
-- purchase retention, device/identity finalization and completion are separate gates.
alter table maintenance_private.account_deletion_requests add column records_erased boolean not null default false;
grant update(records_erased) on maintenance_private.account_deletion_requests to service_role;
grant delete on public.homes,public.home_members,public.maintenance_push_subscriptions,public.maintenance_backup_restores,maintenance_private.product_attachments to service_role;
grant select(user_id) on public.home_members,public.maintenance_push_subscriptions to service_role;
grant select(owner_id) on public.maintenance_backup_restores to service_role;
create function public.erase_maintenance_deletion_records(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed) then return false; end if;
 if exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled) then return false; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and records_erased) then return true; end if;
 delete from maintenance_private.product_attachments f using maintenance_private.account_deletion_objects o where o.request_id=target_request and o.attachment_id=f.id;
 delete from public.maintenance_push_subscriptions where user_id=target_user;
 delete from public.home_members where user_id=target_user;
 delete from public.maintenance_backup_restores where owner_id=target_user;
 delete from public.homes where owner_id=target_user;
 update maintenance_private.account_deletion_requests set records_erased=true,updated_at=now() where id=target_request;
 return true;
end;$$;
revoke all on function public.erase_maintenance_deletion_records(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.erase_maintenance_deletion_records(uuid,uuid,uuid,uuid) to service_role;
commit;
