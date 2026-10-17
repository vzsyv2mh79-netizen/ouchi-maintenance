begin;
-- Internal prepared jobs with explicit APNs and purchase scopes. No scheduler or send activation.
create function public.page_maintenance_native_scoped_devices(target_push_environment text,target_purchase_environment text,after_id uuid default null,batch_size integer default 25) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if target_push_environment is null or target_push_environment not in ('Sandbox','Production') or target_purchase_environment is null or target_purchase_environment not in ('Sandbox','Production') or batch_size is null or batch_size<1 or batch_size>25 then raise exception 'Invalid notification scope'; end if;
 return (select coalesce(jsonb_agg(rows.id order by rows.id),'[]'::jsonb) from (
 select d.id from maintenance_private.native_notification_devices d where d.environment=target_push_environment and d.purchase_environment=target_purchase_environment and d.enabled and (after_id is null or d.id>after_id) and public.maintenance_native_push_allowed(d.id) order by d.id limit batch_size
 ) rows);
end $$;
create function public.read_maintenance_native_scoped_destination(registration_id uuid,target_push_environment text,target_purchase_environment text) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('id',d.id,'environment',d.environment,'purchaseEnvironment',d.purchase_environment,'deviceToken',d.device_token,'topic',d.topic,'registeredAt',floor(extract(epoch from d.created_at)*1000)::bigint)
 from maintenance_private.native_notification_devices d where d.id=registration_id and d.environment=target_push_environment and d.purchase_environment=target_purchase_environment and public.maintenance_native_push_allowed(d.id)
$$;
create function public.read_maintenance_native_scoped_job_claim(target_job uuid,target_lease uuid,target_push_environment text,target_purchase_environment text) returns uuid
language sql security invoker set search_path='' as $$
 select j.device_id from maintenance_private.native_notification_jobs j join maintenance_private.native_notification_devices d on d.id=j.device_id
 where j.id=target_job and j.lease_id=target_lease and j.state='claimed' and j.lease_until>clock_timestamp() and d.environment=target_push_environment and d.purchase_environment=target_purchase_environment and public.maintenance_native_push_allowed(d.id)
$$;
create function public.start_maintenance_native_scoped_push_job(target_job uuid,target_lease uuid,target_push_environment text,target_purchase_environment text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare owner_user uuid;
begin
 select d.user_id into owner_user from maintenance_private.native_notification_jobs j join maintenance_private.native_notification_devices d on d.id=j.device_id where j.id=target_job and d.environment=target_push_environment and d.purchase_environment=target_purchase_environment;
 if owner_user is null then return false; end if;
 perform pg_advisory_xact_lock(hashtext(owner_user::text));
 if public.read_maintenance_native_scoped_job_claim(target_job,target_lease,target_push_environment,target_purchase_environment) is null then return false; end if;
 return public.start_maintenance_native_push_job(target_job,target_lease);
end $$;
create function public.count_maintenance_native_scoped_job_due(target_job uuid,target_lease uuid,target_push_environment text,target_purchase_environment text) returns bigint
language plpgsql security invoker set search_path='' as $$
declare amount bigint;
begin
 if public.read_maintenance_native_scoped_job_claim(target_job,target_lease,target_push_environment,target_purchase_environment) is null then return null; end if;
 amount:=public.count_maintenance_native_job_due(target_job,target_lease);
 if public.read_maintenance_native_scoped_job_claim(target_job,target_lease,target_push_environment,target_purchase_environment) is null then return null; end if;
 return amount;
end $$;
create function public.enqueue_maintenance_native_scoped_daily_job(registration_id uuid,target_push_environment text,target_purchase_environment text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d maintenance_private.native_notification_devices%rowtype; local_now timestamp; today date; result uuid; amount bigint; settings jsonb; scheduled timestamptz;
begin
 select * into d from maintenance_private.native_notification_devices where id=registration_id;
 if not found then return null; end if;
 -- Use the registration/erasure lock order: account before device or job.
 perform pg_advisory_xact_lock(hashtext(d.user_id::text));
 select * into d from maintenance_private.native_notification_devices where id=registration_id for update;
 if not found or target_push_environment is null or target_push_environment not in ('Sandbox','Production') or target_purchase_environment is null or target_purchase_environment not in ('Sandbox','Production') or d.environment<>target_push_environment or d.purchase_environment is distinct from target_purchase_environment then return null; end if;
 settings:=maintenance_private.native_effective_schedule(d.id);
 if settings is null then return null; end if;
 local_now:=clock_timestamp() at time zone 'Asia/Tokyo';today:=local_now::date;
 -- UI/calendar convention: Sunday=1, Saturday=7 (not ISO weekday).
 if not (settings->'weekdays' @> to_jsonb(array[extract(dow from today)::integer+1])) then return null; end if;
 scheduled:=(today+make_interval(mins=>(settings->>'minuteOfDay')::integer)) at time zone 'Asia/Tokyo';
 if clock_timestamp()<scheduled then return null; end if;
 if exists(select 1 from maintenance_private.native_notification_jobs j where j.device_id=d.id and j.delivery_day is null and (j.due_at at time zone 'Asia/Tokyo')::date=today) then return null; end if;
 amount:=maintenance_private.native_due_count(d.id);
 if amount is null or amount<=0 or amount>100000 then return null; end if;
 insert into maintenance_private.native_notification_jobs(device_id,due_at,state,delivery_day,delivery_schedule)
 values(d.id,scheduled,'pending',today,settings)
 on conflict(device_id,delivery_day) where delivery_day is not null do nothing returning id into result;
 if result is null then select id into result from maintenance_private.native_notification_jobs where device_id=d.id and delivery_day=today; end if;
 return result;
end $$;
create function public.claim_maintenance_native_scoped_push_job(target_job uuid,target_push_environment text,target_purchase_environment text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.native_notification_jobs%rowtype; token uuid; owner_user uuid;
begin
 select d.user_id into owner_user from maintenance_private.native_notification_jobs queued join maintenance_private.native_notification_devices d on d.id=queued.device_id where queued.id=target_job and d.environment=target_push_environment and d.purchase_environment=target_purchase_environment;
 if owner_user is null then return null; end if;
 perform pg_advisory_xact_lock(hashtext(owner_user::text));
 select * into j from maintenance_private.native_notification_jobs where id=target_job for update;
 if not found then return null; end if;
 if j.state='claimed' and j.lease_until <= clock_timestamp() and j.send_started_at is not null then
  update maintenance_private.native_notification_jobs set state='unknown' where id=j.id;
  return null;
 end if;
 if not (j.state='pending' or (j.state='claimed' and j.lease_until is not null and j.lease_until <= clock_timestamp() and j.send_started_at is null))
 or j.due_at > clock_timestamp() or j.attempts >= 3 then return null; end if;
 if not exists(select 1 from maintenance_private.native_notification_devices d where d.id=j.device_id and d.environment=target_push_environment and d.purchase_environment=target_purchase_environment)
 or public.maintenance_native_push_allowed(j.device_id) is not true then return null; end if;
 token=gen_random_uuid();
 update maintenance_private.native_notification_jobs set state='claimed',lease_id=token,
 lease_until=clock_timestamp()+interval '45 seconds',send_started_at=null,attempts=attempts+1 where id=j.id;
 return token;
end $$;

create function public.finish_maintenance_native_scoped_push_job(target_job uuid,target_lease uuid,outcome text,target_push_environment text,target_purchase_environment text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.native_notification_jobs%rowtype; next_state text; device uuid; owner_user uuid;
begin
 if outcome not in ('accepted','retry','delivery-unknown','skipped','credentials','disable-device','stale-unregistration','inspect') or outcome is null then return false; end if;
 -- Scope and lock account before device/job, matching registration and erasure.
 select d.user_id into owner_user from maintenance_private.native_notification_jobs queued join maintenance_private.native_notification_devices d on d.id=queued.device_id where queued.id=target_job and d.environment=target_push_environment and d.purchase_environment=target_purchase_environment;
 if owner_user is null then return false; end if;
 perform pg_advisory_xact_lock(hashtext(owner_user::text));
 select device_id into device from maintenance_private.native_notification_jobs where id=target_job;
 if not found then return false; end if;
 perform 1 from maintenance_private.native_notification_devices where id=device and environment=target_push_environment and purchase_environment=target_purchase_environment for update;
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
  update maintenance_private.native_notification_devices set enabled=false where id=j.device_id and environment=target_push_environment and purchase_environment=target_purchase_environment;
 end if;
 return true;
end $$;
revoke all on function public.page_maintenance_native_scoped_devices(text,text,uuid,integer),public.read_maintenance_native_scoped_destination(uuid,text,text),public.read_maintenance_native_scoped_job_claim(uuid,uuid,text,text),public.start_maintenance_native_scoped_push_job(uuid,uuid,text,text),public.count_maintenance_native_scoped_job_due(uuid,uuid,text,text),public.enqueue_maintenance_native_scoped_daily_job(uuid,text,text),public.claim_maintenance_native_scoped_push_job(uuid,text,text),public.finish_maintenance_native_scoped_push_job(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.page_maintenance_native_scoped_devices(text,text,uuid,integer),public.read_maintenance_native_scoped_destination(uuid,text,text),public.read_maintenance_native_scoped_job_claim(uuid,uuid,text,text),public.start_maintenance_native_scoped_push_job(uuid,uuid,text,text),public.count_maintenance_native_scoped_job_due(uuid,uuid,text,text),public.enqueue_maintenance_native_scoped_daily_job(uuid,text,text),public.claim_maintenance_native_scoped_push_job(uuid,text,text),public.finish_maintenance_native_scoped_push_job(uuid,uuid,text,text,text) to service_role;
commit;
