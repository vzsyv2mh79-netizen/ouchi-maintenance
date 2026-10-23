begin;
-- Signature verification remains on the trusted server. These read-only RPCs
-- confirm the signed session still exists, even after Ouchi access is closed.
create function public.maintenance_auth_session_is_current(target_user uuid,verified_session uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from auth.sessions s where s.id=verified_session and s.user_id=target_user
 and (s.not_after is null or s.not_after>statement_timestamp()));
$$;
create function public.read_maintenance_session_deletion_progress(target_user uuid,verified_session uuid,target_request uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when public.maintenance_auth_session_is_current(target_user,verified_session) then
  case when target_request is null then public.read_maintenance_current_deletion_progress(target_user)
   else public.read_maintenance_deletion_progress(target_request,target_user) end
 else null end;
$$;
revoke all on function public.maintenance_auth_session_is_current(uuid,uuid),public.read_maintenance_session_deletion_progress(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.maintenance_auth_session_is_current(uuid,uuid),public.read_maintenance_session_deletion_progress(uuid,uuid,uuid) to service_role;
commit;
