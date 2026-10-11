begin;
-- Sender must check this immediately before dispatch. This cannot recall a
-- notification already accepted by the external push service.
create function public.can_dispatch_maintenance_push(subscription_id uuid,delivery_token uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.maintenance_push_subscriptions s
 where s.id=subscription_id and s.claim_token=delivery_token and s.claimed_until>now()
 and not exists(select 1 from maintenance_private.account_access a where a.user_id=s.user_id and not a.enabled)
 and not exists(select 1 from maintenance_private.app_epochs e where e.user_id=s.user_id and not e.enabled));
$$;
revoke all on function public.can_dispatch_maintenance_push(uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_dispatch_maintenance_push(uuid,uuid) to service_role;
commit;
