begin;
-- Recover a lost receipt only within the user's CURRENT application epoch.
-- Disabled enrollment still permits progress, but a later enrollment cannot
-- inherit an earlier epoch's deletion state.
create function public.read_maintenance_current_deletion_progress(target_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('requestID',r.id,'userID',r.user_id,'state',r.state)
 from maintenance_private.account_deletion_requests r
 join maintenance_private.app_epochs e on e.user_id=r.user_id and e.epoch_id=r.app_epoch_id
 where r.user_id=target_user order by r.requested_at desc,r.id limit 1;
$$;
revoke all on function public.read_maintenance_current_deletion_progress(uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_current_deletion_progress(uuid) to service_role;
commit;
