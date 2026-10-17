begin;
-- Service-only validated provider outcomes; no live sender is enabled.
create or replace function public.finish_maintenance_native_push_job(target_job uuid,target_lease uuid,outcome text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.native_notification_jobs%rowtype; next_state text; device uuid;
begin
 if outcome not in ('accepted','retry','delivery-unknown','skipped','credentials','disable-device','stale-unregistration','inspect') or outcome is null then return false; end if;
 -- Lock in device->job order, matching registration replacement and enqueue.
 select device_id into device from maintenance_private.native_notification_jobs where id=target_job;
 if not found then return false; end if;
 perform 1 from maintenance_private.native_notification_devices where id=device for update;
 if not found then return false; end if;
 select * into j from maintenance_private.native_notification_jobs where id=target_job for update;
 if not found or j.lease_id is distinct from target_lease or target_lease is null then return false; end if;
 if j.state='sent' then return outcome='accepted'; end if;
 if j.state='unknown' and outcome='accepted' and j.send_started_at is not null then
  update maintenance_private.native_notification_jobs set state='sent' where id=j.id; return true;
 end if;
 if j.state <> 'claimed' then return false; end if;
 if outcome in ('accepted','disable-device') and j.send_started_at is null then return false; end if;
 if j.lease_until <= clock_timestamp() and outcome <> 'accepted' then
  update maintenance_private.native_notification_jobs set state=case when j.send_started_at is null then 'failed' else 'unknown' end where id=j.id;
  return false;
 end if;
 next_state=case outcome when 'accepted' then 'sent' when 'delivery-unknown' then 'unknown'
  when 'skipped' then case when j.send_started_at is null then 'skipped' else 'unknown' end
  when 'retry' then case when j.attempts < 3 then 'pending' else 'failed' end else 'failed' end;
 update maintenance_private.native_notification_jobs set state=next_state,
 lease_id=case when next_state='pending' then null else lease_id end,
 lease_until=case when next_state='pending' then null else lease_until end,
 send_started_at=case when next_state='pending' then null else send_started_at end,
 due_at=case when next_state='pending' then clock_timestamp()+interval '1 minute' else due_at end where id=j.id;
 if outcome='disable-device' then
  -- Classification used this exact registration's APNs registration timestamp.
  -- A replacement has a new UUID and must never be disabled by this receipt.
  update maintenance_private.native_notification_devices set enabled=false where id=j.device_id and environment='Sandbox';
 end if;
 return true;
end $$;
revoke all on function public.finish_maintenance_native_push_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_maintenance_native_push_job(uuid,uuid,text) to service_role;
commit;
