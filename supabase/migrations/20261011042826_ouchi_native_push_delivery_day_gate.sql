begin;
-- A delayed daily job cannot become an extra notification on another day.
create or replace function public.count_maintenance_native_job_due(target_job uuid,target_lease uuid) returns bigint
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.native_notification_jobs%rowtype;
begin
 select * into j from maintenance_private.native_notification_jobs where id=target_job;
 if not found or target_lease is null or j.lease_id is distinct from target_lease or j.state <> 'claimed'
 or j.lease_until is null or j.lease_until <= clock_timestamp()
 or public.maintenance_native_push_allowed(j.device_id) is not true then return null; end if;
 if j.delivery_day is not null and (j.delivery_day <> (clock_timestamp() at time zone 'Asia/Tokyo')::date
 or (clock_timestamp() at time zone 'Asia/Tokyo')::time < time '09:00') then return null; end if;
 return maintenance_private.native_due_count(j.device_id);
end $$;
revoke all on function public.count_maintenance_native_job_due(uuid,uuid) from public,anon,authenticated;
grant execute on function public.count_maintenance_native_job_due(uuid,uuid) to service_role;
commit;
