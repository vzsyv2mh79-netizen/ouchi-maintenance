begin;
-- Read only a currently fenced job, without exposing the private schema.
create function public.read_maintenance_native_push_job_claim(target_job uuid,target_lease uuid) returns uuid
language sql security invoker set search_path='' as $$
 select j.device_id from maintenance_private.native_notification_jobs j
 where j.id=target_job and target_lease is not null and j.lease_id=target_lease
 and j.state='claimed' and j.lease_until > clock_timestamp()
$$;
revoke all on function public.read_maintenance_native_push_job_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_native_push_job_claim(uuid,uuid) to service_role;
commit;
