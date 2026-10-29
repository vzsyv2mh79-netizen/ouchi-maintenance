begin;
-- Prepared service-only settings. Does not enable sales, a public route or dispatch.
create table maintenance_private.reminder_schedules (
 user_id uuid not null references auth.users(id), epoch_id uuid not null,
 environment text not null check(environment in ('Sandbox','Production')),
 minute_of_day integer not null check(minute_of_day between 0 and 1439),
 weekdays smallint[] not null check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
 lead_days integer not null check(lead_days in (0,1,3,7)), include_overdue boolean not null,
 revision bigint not null check(revision between 1 and 9007199254740991),
 primary key(user_id,epoch_id,environment)
);
alter table maintenance_private.reminder_schedules enable row level security;
revoke all on maintenance_private.reminder_schedules from public,anon,authenticated;
grant select,insert,update,delete on maintenance_private.reminder_schedules to service_role;
create function public.read_maintenance_reminder_schedule(target_user uuid,verified_session uuid,target_epoch uuid,target_environment text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rights jsonb; saved jsonb; rev bigint; free jsonb:=jsonb_build_object('minuteOfDay',540,'weekdays',array[1,2,3,4,5,6,7],'leadDays',0,'includeOverdue',true);
begin
 rights:=public.read_maintenance_verified_entitlement(target_user,verified_session,target_epoch,target_environment);
 select jsonb_build_object('minuteOfDay',minute_of_day,'weekdays',weekdays,'leadDays',lead_days,'includeOverdue',include_overdue),revision into saved,rev
 from maintenance_private.reminder_schedules where user_id=target_user and epoch_id=target_epoch and environment=target_environment;
 return jsonb_build_object('environment',target_environment,'revision',coalesce(rev,0),'saved',saved,
 'premiumActive',rights->>'plan'='premium','effective',case when rights->>'plan'='premium' then coalesce(saved,free) else free end);
end;$$;
create function public.save_maintenance_reminder_schedule(target_user uuid,verified_session uuid,target_epoch uuid,target_environment text,
 expected_revision bigint,notification_minute integer,notification_weekdays smallint[],advance_days integer,include_expired boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rights jsonb; prior maintenance_private.reminder_schedules; sorted_days smallint[];
begin
 if expected_revision is null or expected_revision<0 or expected_revision>=9007199254740991
 or notification_minute is null or notification_minute not between 0 and 1439 or advance_days is null or advance_days not in (0,1,3,7)
 or include_expired is null or notification_weekdays is null or cardinality(notification_weekdays) not between 1 and 7
 or not (notification_weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
 or array_position(notification_weekdays,null) is not null
 or cardinality(notification_weekdays)<>(select count(distinct x) from unnest(notification_weekdays) x)
 then raise exception 'Invalid notification settings'; end if;
 -- Entitlement obtains the account lock; erasure/reenrollment uses the same lock.
 rights:=public.read_maintenance_verified_entitlement(target_user,verified_session,target_epoch,target_environment);
 if rights->>'plan' is distinct from 'premium' then raise exception 'Premium required'; end if;
 select array_agg(x order by x) into sorted_days from unnest(notification_weekdays) x;
 select * into prior from maintenance_private.reminder_schedules where user_id=target_user and epoch_id=target_epoch and environment=target_environment for update;
 if prior.revision is distinct from expected_revision and not (prior.revision is null and expected_revision=0) then
  -- An acknowledgement lost after this exact write can be retried; never overwrite
  -- a concurrent preference change using a stale revision.
  if prior.revision=expected_revision+1 and prior.minute_of_day=notification_minute and prior.weekdays=sorted_days
    and prior.lead_days=advance_days and prior.include_overdue=include_expired then
    return public.read_maintenance_reminder_schedule(target_user,verified_session,target_epoch,target_environment);
  end if;
  raise exception 'Settings changed; reload required';
 end if;
 insert into maintenance_private.reminder_schedules values(target_user,target_epoch,target_environment,notification_minute,sorted_days,advance_days,include_expired,expected_revision+1)
 on conflict(user_id,epoch_id,environment) do update set minute_of_day=excluded.minute_of_day,weekdays=excluded.weekdays,
 lead_days=excluded.lead_days,include_overdue=excluded.include_overdue,revision=excluded.revision;
 return public.read_maintenance_reminder_schedule(target_user,verified_session,target_epoch,target_environment);
end;$$;
revoke all on function public.read_maintenance_reminder_schedule(uuid,uuid,uuid,text),public.save_maintenance_reminder_schedule(uuid,uuid,uuid,text,bigint,integer,smallint[],integer,boolean) from public,anon,authenticated;
grant execute on function public.read_maintenance_reminder_schedule(uuid,uuid,uuid,text),public.save_maintenance_reminder_schedule(uuid,uuid,uuid,text,bigint,integer,smallint[],integer,boolean) to service_role;
-- Do not leave saved preferences behind when the matching closed epoch is erased.
create function public.erase_maintenance_deletion_reminder_schedule(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) is distinct from true then return false; end if;
 if not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled) then return false; end if;
 delete from maintenance_private.reminder_schedules where user_id=target_user and epoch_id=target_epoch;
 return not exists(select 1 from maintenance_private.reminder_schedules where user_id=target_user and epoch_id=target_epoch);
end;$$;
revoke all on function public.erase_maintenance_deletion_reminder_schedule(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.erase_maintenance_deletion_reminder_schedule(uuid,uuid,uuid,uuid) to service_role;
commit;
