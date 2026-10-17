begin;
-- Prepared formal dispatcher only. These hashes remain personal data; no send activation.
create table maintenance_private.native_delivery_identities (
 destination_hash text not null check(destination_hash ~ '^[0-9a-f]{64}$'),
 delivery_day date not null,
 user_id uuid not null,
 app_epoch_id uuid not null,
 job_id uuid not null,
 lease_id uuid not null,
 expires_at timestamptz not null,
 primary key(destination_hash,delivery_day),
 unique(job_id)
);
create index native_delivery_identity_owner on maintenance_private.native_delivery_identities(user_id,app_epoch_id);
create index native_delivery_identity_expiry on maintenance_private.native_delivery_identities(expires_at);
alter table maintenance_private.native_delivery_identities enable row level security;
revoke all on maintenance_private.native_delivery_identities from public,anon,authenticated;
grant select,insert,update,delete on maintenance_private.native_delivery_identities to service_role;
create function public.prune_maintenance_native_delivery_identities(batch_size integer default 500) returns integer
language plpgsql security invoker set search_path='' as $$
declare amount integer;
begin
 if batch_size is null or batch_size<1 or batch_size>500 then raise exception 'Invalid cleanup batch'; end if;
 delete from maintenance_private.native_delivery_identities where (destination_hash,delivery_day) in
 (select destination_hash,delivery_day from maintenance_private.native_delivery_identities where expires_at<=clock_timestamp() order by expires_at,destination_hash limit batch_size for update skip locked);
 get diagnostics amount=row_count; return amount;
end $$;
create function public.erase_maintenance_deletion_native_delivery_identities(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured)
 or exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled) then return false; end if;
 delete from maintenance_private.native_delivery_identities where user_id=target_user and app_epoch_id=target_epoch;
 return not exists(select 1 from maintenance_private.native_delivery_identities where user_id=target_user and app_epoch_id=target_epoch);
end $$;
create or replace function public.start_maintenance_native_scoped_push_job(target_job uuid,target_lease uuid,target_push_environment text,target_purchase_environment text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare owner_user uuid; destination maintenance_private.native_notification_devices%rowtype; today date; inserted uuid; started boolean;
begin
 select d.user_id into owner_user from maintenance_private.native_notification_jobs j join maintenance_private.native_notification_devices d on d.id=j.device_id where j.id=target_job and d.environment=target_push_environment and d.purchase_environment=target_purchase_environment;
 if owner_user is null then return false; end if;
 perform pg_advisory_xact_lock(hashtext(owner_user::text));
 if public.read_maintenance_native_scoped_job_claim(target_job,target_lease,target_push_environment,target_purchase_environment) is null then return false; end if;
 select * into destination from maintenance_private.native_notification_devices where id=public.read_maintenance_native_scoped_job_claim(target_job,target_lease,target_push_environment,target_purchase_environment);
 today:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
 -- Device/session replacement may cascade-delete the original job; the daily identity survives.
 insert into maintenance_private.native_delivery_identities(destination_hash,delivery_day,user_id,app_epoch_id,job_id,lease_id,expires_at)
 values(encode(sha256(convert_to(destination.environment||':'||destination.topic||':'||destination.device_token,'UTF8')),'hex'),today,destination.user_id,destination.app_epoch_id,target_job,target_lease,(today+2)::timestamp at time zone 'Asia/Tokyo')
 on conflict(destination_hash,delivery_day) do nothing returning job_id into inserted;
 if inserted is null then return false; end if;
 started:=public.start_maintenance_native_push_job(target_job,target_lease);
 if not started then delete from maintenance_private.native_delivery_identities where job_id=target_job and lease_id=target_lease; end if;
 return started;
end $$;
create or replace function public.finish_maintenance_native_scoped_push_job(target_job uuid,target_lease uuid,outcome text,target_push_environment text,target_purchase_environment text) returns boolean
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
 -- 'retry' is only a trusted provider outcome proving no submission. Unknown/accepted stay fenced.
 if outcome='retry' then delete from maintenance_private.native_delivery_identities where job_id=target_job and lease_id=target_lease; end if;
 if outcome='disable-device' then
  -- Classification used this exact registration's APNs registration timestamp.
  -- A replacement has a new UUID and must never be disabled by this receipt.
  update maintenance_private.native_notification_devices set enabled=false where id=j.device_id and environment=target_push_environment and purchase_environment=target_purchase_environment;
 end if;
 return true;
end $$;
revoke all on function public.prune_maintenance_native_delivery_identities(integer),public.erase_maintenance_deletion_native_delivery_identities(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.prune_maintenance_native_delivery_identities(integer),public.erase_maintenance_deletion_native_delivery_identities(uuid,uuid,uuid,uuid) to service_role;
commit;
