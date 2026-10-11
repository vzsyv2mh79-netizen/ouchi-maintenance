begin;
-- Intermediate app-only cleanup. Does not finalize identity or claim deletion complete.
grant delete on maintenance_private.reconciliation_jobs to service_role;
create function public.erase_maintenance_deletion_reconciliation(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and records_erased and inventory_captured) then return false; end if;
 if exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed) then return false; end if;
 if exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and (enabled or epoch_id<>target_epoch)) then return false; end if;
 delete from maintenance_private.reconciliation_jobs where user_id=target_user and app_epoch_id=target_epoch;
 return not exists(select 1 from maintenance_private.reconciliation_jobs where user_id=target_user and app_epoch_id=target_epoch);
end;$$;
revoke all on function public.erase_maintenance_deletion_reconciliation(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.erase_maintenance_deletion_reconciliation(uuid,uuid,uuid,uuid) to service_role;
commit;
