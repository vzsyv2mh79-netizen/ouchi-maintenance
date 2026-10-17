begin;
-- Prepared service-only job fencing. No scheduler or external sender is enabled.
alter table maintenance_private.native_notification_jobs
 drop constraint native_notification_jobs_state_check,
 add constraint native_notification_jobs_state_check check(state in ('pending','claimed','sent','unknown','skipped','failed')),
 add column lease_id uuid,
 add column lease_until timestamptz,
 add column send_started_at timestamptz,
 add column attempts integer not null default 0 check(attempts between 0 and 3);

create function public.claim_maintenance_native_push_job(target_job uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.native_notification_jobs%rowtype; token uuid;
begin
 select * into j from maintenance_private.native_notification_jobs where id=target_job for update;
 if not found then return null; end if;
 if j.state='claimed' and j.lease_until <= clock_timestamp() and j.send_started_at is not null then
  update maintenance_private.native_notification_jobs set state='unknown' where id=j.id;
  return null;
 end if;
 if not (j.state='pending' or (j.state='claimed' and j.lease_until is not null and j.lease_until <= clock_timestamp() and j.send_started_at is null))
 or j.due_at > clock_timestamp() or j.attempts >= 3 then return null; end if;
 if not exists(select 1 from maintenance_private.native_notification_devices d where d.id=j.device_id and d.environment='Sandbox')
 or public.maintenance_native_push_allowed(j.device_id) is not true then return null; end if;
 token=gen_random_uuid();
 update maintenance_private.native_notification_jobs set state='claimed',lease_id=token,
 lease_until=clock_timestamp()+interval '45 seconds',send_started_at=null,attempts=attempts+1 where id=j.id;
 return token;
end $$;

create function public.start_maintenance_native_push_job(target_job uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.native_notification_jobs%rowtype;
begin
 select * into j from maintenance_private.native_notification_jobs where id=target_job for update;
 if not found or target_lease is null or j.lease_until is null or j.state <> 'claimed' or j.lease_id is distinct from target_lease
 or j.lease_until <= clock_timestamp() or j.send_started_at is not null then return false; end if;
 if public.maintenance_native_push_allowed(j.device_id) is not true then return false; end if;
 update maintenance_private.native_notification_jobs set send_started_at=clock_timestamp() where id=j.id;
 return true;
end $$;

create function public.finish_maintenance_native_push_job(target_job uuid,target_lease uuid,outcome text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.native_notification_jobs%rowtype; next_state text;
begin
 if outcome not in ('accepted','retry','delivery-unknown','skipped','credentials','disable-device','stale-unregistration','inspect') or outcome is null then return false; end if;
 select * into j from maintenance_private.native_notification_jobs where id=target_job for update;
 if not found or j.lease_id is distinct from target_lease or target_lease is null then return false; end if;
 if j.state='sent' then return outcome='accepted'; end if;
 if j.state='unknown' and outcome='accepted' and j.send_started_at is not null then
  update maintenance_private.native_notification_jobs set state='sent' where id=j.id; return true;
 end if;
 if j.state <> 'claimed' then return false; end if;
 if outcome='accepted' and j.send_started_at is null then return false; end if;
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
 return true;
end $$;
revoke all on function public.claim_maintenance_native_push_job(uuid),public.start_maintenance_native_push_job(uuid,uuid),public.finish_maintenance_native_push_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_maintenance_native_push_job(uuid),public.start_maintenance_native_push_job(uuid,uuid),public.finish_maintenance_native_push_job(uuid,uuid,text) to service_role;
commit;
