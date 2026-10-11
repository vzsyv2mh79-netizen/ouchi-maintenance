begin;
alter table maintenance_private.native_notification_jobs add column delivery_day date;
create unique index native_notification_daily_job on maintenance_private.native_notification_jobs(device_id,delivery_day) where delivery_day is not null;
create function maintenance_private.native_due_count(registration_id uuid) returns bigint
language sql security invoker set search_path='' as $$
 select count(*) from public.maintenance_tasks t
 join public.products p on p.id=t."productId" join public.homes h on h.id=p."homeId"
 join maintenance_private.native_notification_devices d on d.id=registration_id
 where t."nextDueAt" <= (clock_timestamp() at time zone 'Asia/Tokyo')::date
 and (h.owner_id=d.user_id or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=d.user_id))
 and not exists(select 1 from maintenance_private.account_access a where a.user_id=h.owner_id and not a.enabled)
 and not exists(select 1 from maintenance_private.app_epochs e where e.user_id=h.owner_id and not e.enabled)
$$;
create function public.enqueue_maintenance_native_daily_job(registration_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d maintenance_private.native_notification_devices%rowtype; today date; result uuid; amount bigint;
begin
 select * into d from maintenance_private.native_notification_devices where id=registration_id for update;
 if not found or d.environment <> 'Sandbox' or public.maintenance_native_push_allowed(d.id) is not true then return null; end if;
 today=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
 if (clock_timestamp() at time zone 'Asia/Tokyo')::time < time '09:00' then return null; end if;
 -- Legacy work without a delivery day is ambiguous; never infer it is unsent.
 if exists(select 1 from maintenance_private.native_notification_jobs j where j.device_id=d.id and j.delivery_day is null and (j.due_at at time zone 'Asia/Tokyo')::date=today) then return null; end if;
 amount=maintenance_private.native_due_count(d.id);
 if amount <= 0 or amount > 100000 then return null; end if;
 insert into maintenance_private.native_notification_jobs(device_id,due_at,state,delivery_day)
 values(d.id,(today+time '09:00') at time zone 'Asia/Tokyo','pending',today)
 on conflict(device_id,delivery_day) where delivery_day is not null do nothing returning id into result;
 if result is null then select id into result from maintenance_private.native_notification_jobs where device_id=d.id and delivery_day=today; end if;
 return result;
end $$;
create function public.count_maintenance_native_job_due(target_job uuid,target_lease uuid) returns bigint
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.native_notification_jobs%rowtype;
begin
 select * into j from maintenance_private.native_notification_jobs where id=target_job;
 if not found or target_lease is null or j.lease_id is distinct from target_lease or j.state <> 'claimed'
 or j.lease_until is null or j.lease_until <= clock_timestamp()
 or public.maintenance_native_push_allowed(j.device_id) is not true then return null; end if;
 return maintenance_private.native_due_count(j.device_id);
end $$;
revoke all on function maintenance_private.native_due_count(uuid),public.enqueue_maintenance_native_daily_job(uuid),public.count_maintenance_native_job_due(uuid,uuid) from public,anon,authenticated;
grant execute on function maintenance_private.native_due_count(uuid),public.enqueue_maintenance_native_daily_job(uuid),public.count_maintenance_native_job_due(uuid,uuid) to service_role;
commit;
