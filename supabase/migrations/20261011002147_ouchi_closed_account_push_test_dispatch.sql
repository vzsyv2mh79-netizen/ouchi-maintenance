begin;
create function public.can_dispatch_maintenance_push_test(target_user uuid,target_endpoint text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.maintenance_push_subscriptions s where s.user_id=target_user and s.endpoint=target_endpoint
 and not exists(select 1 from maintenance_private.account_access a where a.user_id=s.user_id and not a.enabled)
 and not exists(select 1 from maintenance_private.app_epochs e where e.user_id=s.user_id and not e.enabled));
$$;
revoke all on function public.can_dispatch_maintenance_push_test(uuid,text) from public,anon,authenticated;
grant execute on function public.can_dispatch_maintenance_push_test(uuid,text) to service_role;
commit;
