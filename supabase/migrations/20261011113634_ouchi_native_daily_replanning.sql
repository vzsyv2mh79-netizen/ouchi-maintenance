begin;
-- Replan only unsubmitted formal schedules. No activation or new daily job.
create or replace function public.enqueue_maintenance_native_scoped_daily_job(registration_id uuid,target_push_environment text,target_purchase_environment text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d maintenance_private.native_notification_devices%rowtype; local_now timestamp; today date; result uuid; amount bigint; settings jsonb; scheduled timestamptz; queued maintenance_private.native_notification_jobs%rowtype;
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
 if result is null then
  select * into queued from maintenance_private.native_notification_jobs where device_id=d.id and delivery_day=today for update;
  result:=queued.id;
  -- Never replace a send already started or an accepted/unknown receipt. Only
  -- changed effective settings may revive a definitively unsubmitted schedule.
  if queued.send_started_at is null and queued.delivery_schedule is distinct from settings
   and (queued.state in ('pending','skipped') or (queued.state='claimed' and queued.lease_until<=clock_timestamp()))
   and not exists(select 1 from maintenance_private.native_delivery_identities g where g.destination_hash=encode(sha256(convert_to(d.environment||':'||d.topic||':'||d.device_token,'UTF8')),'hex') and g.delivery_day=today) then
   update maintenance_private.native_notification_jobs set delivery_schedule=settings,due_at=scheduled,state='pending',attempts=0,lease_id=null,lease_until=null,send_started_at=null where id=queued.id;
  end if;
 end if;
 return result;
end $$;
commit;
