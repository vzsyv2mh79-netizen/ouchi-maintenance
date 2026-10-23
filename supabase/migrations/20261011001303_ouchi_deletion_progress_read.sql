begin;
-- Server-only read; the server must verify the bearer and supply its user ID.
-- Closed application enrollment does not prevent reading its pending request.
create function public.read_maintenance_deletion_progress(target_request uuid,target_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('requestID',r.id,'userID',r.user_id,'state',r.state)
 from maintenance_private.account_deletion_requests r
 where r.id=target_request and r.user_id=target_user;
$$;
revoke all on function public.read_maintenance_deletion_progress(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_deletion_progress(uuid,uuid) to service_role;
commit;
