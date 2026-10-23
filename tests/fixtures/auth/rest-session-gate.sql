-- Test-only session gate and bootstrap adapter.
create or replace function maintenance_private.account_enabled() returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from maintenance_private.account_access x join maintenance_private.app_epochs a on a.user_id=x.user_id and a.enabled join maintenance_private.app_session_epochs s on s.user_id=a.user_id and s.epoch_id=a.epoch_id where x.user_id=auth.uid() and x.enabled and s.session_id=case when auth.jwt()->>'session_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (auth.jwt()->>'session_id')::uuid else null end)
$$;
create function public.bootstrap_synthetic_app_identity(target_user uuid, verified_session uuid) returns uuid language plpgsql security invoker set search_path='' as $$
begin
insert into maintenance_private.account_access values(target_user,true);
return maintenance_private.enroll_app_epoch(target_user,verified_session);
end;$$;
revoke all on function public.bootstrap_synthetic_app_identity(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bootstrap_synthetic_app_identity(uuid,uuid) to service_role;
