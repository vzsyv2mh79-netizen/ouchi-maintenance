begin;
-- Connect settings to the existing internal job path. No scheduler or APNs send
-- is enabled by this migration; the existing Sandbox dispatch gate is retained.
alter table maintenance_private.native_notification_jobs add column delivery_schedule jsonb;
create function maintenance_private.native_effective_schedule(registration_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d maintenance_private.native_notification_devices%rowtype; settings jsonb;
begin
 select * into d from maintenance_private.native_notification_devices where id=registration_id;
 if not found or public.maintenance_native_push_allowed(d.id) is not true then return null; end if;
 settings:=public.read_maintenance_reminder_schedule(d.user_id,d.session_id,d.app_epoch_id,d.environment);
 return settings->'effective';
end $$;
create or replace function maintenance_private.native_due_count(registration_id uuid) returns bigint
language plpgsql security invoker set search_path='' as $$
declare settings jsonb; today date; result bigint;
begin
 settings:=maintenance_private.native_effective_schedule(registration_id);
 if settings is null then return null; end if;
 today:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
 select count(*) into result from public.maintenance_tasks t
 join public.products p on p.id=t."productId" join public.homes h on h.id=p."homeId"
 join maintenance_private.native_notification_devices d on d.id=registration_id
 where t."nextDueAt" <= today+(settings->>'leadDays')::integer
 and ((settings->>'includeOverdue')::boolean or t."nextDueAt">=today)
 and (h.owner_id=d.user_id or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=d.user_id))
 and not exists(select 1 from maintenance_private.account_access a where a.user_id=h.owner_id and not a.enabled)
 and not exists(select 1 from maintenance_private.app_epochs e where e.user_id=h.owner_id and not e.enabled);
 return result;
end $$;
create or replace function public.enqueue_maintenance_native_daily_job(registration_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d maintenance_private.native_notification_devices%rowtype; local_now timestamp; today date; result uuid; amount bigint; settings jsonb; scheduled timestamptz;
begin
 select * into d from maintenance_private.native_notification_devices where id=registration_id;
 if not found then return null; end if;
 -- Use the registration/erasure lock order: account before device or job.
 perform pg_advisory_xact_lock(hashtext(d.user_id::text));
 select * into d from maintenance_private.native_notification_devices where id=registration_id for update;
 if not found or d.environment <> 'Sandbox' then return null; end if;
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
create or replace function public.count_maintenance_native_job_due(target_job uuid,target_lease uuid) returns bigint
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.native_notification_jobs%rowtype; settings jsonb; local_now timestamp;
begin
 select * into j from maintenance_private.native_notification_jobs where id=target_job;
 if not found or target_lease is null or j.lease_id is distinct from target_lease or j.state <> 'claimed'
 or j.lease_until is null or j.lease_until <= clock_timestamp() then return null; end if;
 settings:=maintenance_private.native_effective_schedule(j.device_id);
 if settings is null then return null; end if;
 local_now:=clock_timestamp() at time zone 'Asia/Tokyo';
 if j.delivery_day is not null and (j.delivery_day<>local_now::date
 or extract(hour from local_now)::integer*60+extract(minute from local_now)::integer < (settings->>'minuteOfDay')::integer
 or not (settings->'weekdays' @> to_jsonb(array[extract(dow from local_now)::integer+1]))
 or coalesce(j.delivery_schedule,jsonb_build_object('minuteOfDay',540,'weekdays',array[1,2,3,4,5,6,7],'leadDays',0,'includeOverdue',true)) is distinct from settings) then return null; end if;
 return maintenance_private.native_due_count(j.device_id);
end $$;
create or replace function public.start_maintenance_native_push_job(target_job uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.native_notification_jobs%rowtype; amount bigint; owner_user uuid;
begin
 select d.user_id into owner_user from maintenance_private.native_notification_jobs queued
 join maintenance_private.native_notification_devices d on d.id=queued.device_id where queued.id=target_job;
 if owner_user is null then return false; end if;
 perform pg_advisory_xact_lock(hashtext(owner_user::text));
 select * into j from maintenance_private.native_notification_jobs where id=target_job for update;
 if not found or target_lease is null or j.lease_until is null or j.state <> 'claimed' or j.lease_id is distinct from target_lease
 or j.lease_until <= clock_timestamp() or j.send_started_at is not null then return false; end if;
 amount:=public.count_maintenance_native_job_due(j.id,target_lease);
 if amount is null or amount<=0 or amount>100000 then return false; end if;
 update maintenance_private.native_notification_jobs set send_started_at=clock_timestamp() where id=j.id;
 return true;
end $$;
revoke all on function maintenance_private.native_effective_schedule(uuid) from public,anon,authenticated;
grant execute on function maintenance_private.native_effective_schedule(uuid) to service_role;
commit;
