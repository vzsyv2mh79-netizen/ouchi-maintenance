begin;
-- Web registration cleanup only; APNs/local schedules are separate release gates.
create function public.erase_maintenance_deletion_web_push(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured)
 or exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled) then return false; end if;
 delete from public.maintenance_push_subscriptions where user_id=target_user;
 delete from public.maintenance_push_test_limits where user_id=target_user;
 return true;
end;$$;
revoke all on function public.erase_maintenance_deletion_web_push(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.erase_maintenance_deletion_web_push(uuid,uuid,uuid,uuid) to service_role;
commit;
