begin;
-- Intermediate minimization only, never marks account deletion complete.
-- Paths may be removed only after durable object absence and record erasure.
grant delete on maintenance_private.account_deletion_objects to service_role;
create function public.minimize_maintenance_deletion_object_inventory(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured and records_erased)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed) then return false; end if;
 if not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled) then return false; end if;
 delete from maintenance_private.account_deletion_objects where request_id=target_request;
 return not exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request);
end;$$;
revoke all on function public.minimize_maintenance_deletion_object_inventory(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.minimize_maintenance_deletion_object_inventory(uuid,uuid,uuid,uuid) to service_role;
commit;
