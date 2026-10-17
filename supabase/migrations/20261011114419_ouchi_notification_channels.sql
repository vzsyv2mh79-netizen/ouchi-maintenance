begin;
-- Free account preferences, isolated by enrollment and purchase environment.
create table maintenance_private.notification_channels (
 user_id uuid not null references auth.users(id),epoch_id uuid not null,
 environment text not null check(environment in ('Sandbox','Production')),
 channel text not null check(channel in ('web','native','both')),
 revision bigint not null check(revision between 1 and 9007199254740991),
 primary key(user_id,epoch_id,environment)
);
alter table maintenance_private.notification_channels enable row level security;
revoke all on maintenance_private.notification_channels from public,anon,authenticated;
grant select,insert,update,delete on maintenance_private.notification_channels to service_role;
create function public.read_maintenance_notification_channel(target_user uuid,verified_session uuid,target_epoch uuid,target_environment text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rights jsonb; chosen text; rev bigint; ready boolean;
begin
 rights:=public.read_maintenance_verified_entitlement(target_user,verified_session,target_epoch,target_environment);
 select channel,revision into chosen,rev from maintenance_private.notification_channels where user_id=target_user and epoch_id=target_epoch and environment=target_environment;
 select exists(select 1 from maintenance_private.native_notification_devices d where d.user_id=target_user and d.app_epoch_id=target_epoch and d.purchase_environment=target_environment and public.maintenance_native_push_allowed(d.id)) into ready;
 return jsonb_build_object('environment',target_environment,'channel',coalesce(chosen,'both'),'revision',coalesce(rev,0),'nativeRegistered',ready);
end $$;
create function public.save_maintenance_notification_channel(target_user uuid,verified_session uuid,target_epoch uuid,target_environment text,expected_revision bigint,selected_channel text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare snapshot jsonb; prior maintenance_private.notification_channels%rowtype;
begin
 if expected_revision is null or expected_revision<0 or expected_revision>=9007199254740991 or selected_channel is null or selected_channel not in ('web','native','both') then raise exception 'Invalid channel'; end if;
 snapshot:=public.read_maintenance_notification_channel(target_user,verified_session,target_epoch,target_environment);
 -- read obtains the common enrollment/account lock and live Auth verification.
 select * into prior from maintenance_private.notification_channels where user_id=target_user and epoch_id=target_epoch and environment=target_environment for update;
 if prior.revision is distinct from expected_revision and not(prior.revision is null and expected_revision=0) then
  if prior.revision=expected_revision+1 and prior.channel=selected_channel then return snapshot; end if;
  raise exception 'Settings changed; reload required';
 end if;
 if selected_channel='native' and (snapshot->>'nativeRegistered')::boolean is not true then raise exception 'iPhone registration required'; end if;
 insert into maintenance_private.notification_channels values(target_user,target_epoch,target_environment,selected_channel,expected_revision+1)
 on conflict(user_id,epoch_id,environment) do update set channel=excluded.channel,revision=excluded.revision;
 return public.read_maintenance_notification_channel(target_user,verified_session,target_epoch,target_environment);
end $$;
create function maintenance_private.native_channel_allowed(registration_id uuid) returns boolean
language sql security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.native_notification_devices d where d.id=registration_id and not exists(select 1 from maintenance_private.notification_channels c where c.user_id=d.user_id and c.epoch_id=d.app_epoch_id and c.environment=coalesce(d.purchase_environment,d.environment) and c.channel='web'));
$$;
create or replace function maintenance_private.native_effective_schedule(registration_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d maintenance_private.native_notification_devices%rowtype; settings jsonb;
begin
 select * into d from maintenance_private.native_notification_devices where id=registration_id;
 if not found or public.maintenance_native_push_allowed(d.id) is not true or maintenance_private.native_channel_allowed(d.id) is not true then return null; end if;
 settings:=public.read_maintenance_reminder_schedule(d.user_id,d.session_id,d.app_epoch_id,coalesce(d.purchase_environment,d.environment));
 return settings->'effective';
end $$;
alter table maintenance_private.native_notification_jobs add column delivery_channel_revision bigint;
create or replace function public.enqueue_maintenance_native_scoped_daily_job(registration_id uuid,target_push_environment text,target_purchase_environment text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d maintenance_private.native_notification_devices%rowtype; local_now timestamp; today date; result uuid; amount bigint; settings jsonb; scheduled timestamptz; queued maintenance_private.native_notification_jobs%rowtype; channel_revision bigint;
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
 channel_revision:=coalesce((select revision from maintenance_private.notification_channels where user_id=d.user_id and epoch_id=d.app_epoch_id and environment=target_purchase_environment),0);
 amount:=maintenance_private.native_due_count(d.id);
 if amount is null or amount<=0 or amount>100000 then return null; end if;
 insert into maintenance_private.native_notification_jobs(device_id,due_at,state,delivery_day,delivery_schedule,delivery_channel_revision)
 values(d.id,scheduled,'pending',today,settings,channel_revision)
 on conflict(device_id,delivery_day) where delivery_day is not null do nothing returning id into result;
 if result is null then
  select * into queued from maintenance_private.native_notification_jobs where device_id=d.id and delivery_day=today for update;
  result:=queued.id;
  -- Never replace a send already started or an accepted/unknown receipt. Only
  -- changed effective settings may revive a definitively unsubmitted schedule.
  if queued.send_started_at is null and (queued.delivery_schedule is distinct from settings or coalesce(queued.delivery_channel_revision,0)<>channel_revision)
   and (queued.state in ('pending','skipped') or (queued.state='claimed' and queued.lease_until<=clock_timestamp()))
   and not exists(select 1 from maintenance_private.native_delivery_identities g where g.destination_hash=encode(sha256(convert_to(d.environment||':'||d.topic||':'||d.device_token,'UTF8')),'hex') and g.delivery_day=today) then
   update maintenance_private.native_notification_jobs set delivery_schedule=settings,delivery_channel_revision=channel_revision,due_at=scheduled,state='pending',attempts=0,lease_id=null,lease_until=null,send_started_at=null where id=queued.id;
  end if;
 end if;
 return result;
end $$;
create or replace function public.can_dispatch_maintenance_push(subscription_id uuid,delivery_token uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.maintenance_push_subscriptions s
 where s.id=subscription_id and s.claim_token=delivery_token and s.claimed_until>now()
 and not exists(select 1 from maintenance_private.notification_channels c join maintenance_private.app_epochs e on e.user_id=c.user_id and e.epoch_id=c.epoch_id and e.enabled where c.user_id=s.user_id and c.environment='Production' and c.channel='native')
 and not exists(select 1 from maintenance_private.account_access a where a.user_id=s.user_id and not a.enabled)
 and not exists(select 1 from maintenance_private.app_epochs e where e.user_id=s.user_id and not e.enabled));
$$;
create or replace function public.erase_maintenance_deletion_reminder_schedule(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) is distinct from true then return false; end if;
 if not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled) then return false; end if;
 delete from maintenance_private.notification_channels where user_id=target_user and epoch_id=target_epoch;
 delete from maintenance_private.reminder_schedules where user_id=target_user and epoch_id=target_epoch;
 return not exists(select 1 from maintenance_private.reminder_schedules where user_id=target_user and epoch_id=target_epoch) and not exists(select 1 from maintenance_private.notification_channels where user_id=target_user and epoch_id=target_epoch);
end;$$;
revoke all on function public.read_maintenance_notification_channel(uuid,uuid,uuid,text),public.save_maintenance_notification_channel(uuid,uuid,uuid,text,bigint,text),maintenance_private.native_channel_allowed(uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_notification_channel(uuid,uuid,uuid,text),public.save_maintenance_notification_channel(uuid,uuid,uuid,text,bigint,text),maintenance_private.native_channel_allowed(uuid) to service_role;
commit;
