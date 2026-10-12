begin;
-- Prepared read-only lookup. No route, worker or deletion activation.
-- Absence is authoritative only within the native app enrollment scope.
create or replace function public.read_maintenance_session_deletion_lookup(
 target_user uuid, verified_session uuid, target_request uuid default null
) returns jsonb language sql stable security invoker set search_path='' as $$
 with progress as materialized (
  select public.read_maintenance_session_deletion_progress(target_user,verified_session,target_request) as value
 ), enrollment as materialized (
  select public.read_maintenance_explicit_enrollment(target_user,verified_session) as epoch_id
 )
 select coalesce(
  (select value from progress),
  (select jsonb_build_object('state','not_requested','userID',target_user,'epochID',epoch_id)
   from enrollment
   where target_request is null and epoch_id is not null
    and public.maintenance_auth_session_is_current(target_user,verified_session)
    and not exists (
     select 1 from maintenance_private.account_deletion_requests r
     where r.user_id=target_user and (r.app_epoch_id=enrollment.epoch_id or r.state<>'complete')
    ))
 );
$$;
revoke all on function public.read_maintenance_session_deletion_lookup(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_session_deletion_lookup(uuid,uuid,uuid) to service_role;
commit;
