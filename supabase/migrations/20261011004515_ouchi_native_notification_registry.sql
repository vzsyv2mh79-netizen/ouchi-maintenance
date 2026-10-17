begin;
-- Prepared persistence only. No registration endpoint or sender is enabled.
create table maintenance_private.native_notification_devices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 app_epoch_id uuid not null,
 environment text not null check(environment in ('Sandbox','Production')),
 device_token text not null check(length(device_token) between 32 and 1024 and device_token ~ '^([0-9a-f]{2})+$'),
 topic text not null check(topic='jp.ouchi.maintenance'),
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index native_notification_active_token on maintenance_private.native_notification_devices(environment,topic,device_token) where enabled;
create index native_notification_user on maintenance_private.native_notification_devices(user_id);
create table maintenance_private.native_notification_jobs (
 id uuid primary key default gen_random_uuid(),
 device_id uuid not null references maintenance_private.native_notification_devices(id) on delete cascade,
 due_at timestamptz not null,
 state text not null check(state in ('pending','claimed','sent')),
 created_at timestamptz not null default now()
);
alter table maintenance_private.native_notification_devices enable row level security;
alter table maintenance_private.native_notification_jobs enable row level security;
revoke all on maintenance_private.native_notification_devices,maintenance_private.native_notification_jobs from public,anon,authenticated;
grant select,insert,update,delete on maintenance_private.native_notification_devices,maintenance_private.native_notification_jobs to service_role;
create function public.erase_maintenance_deletion_native_push(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured)
 or exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled) then return false; end if;
 delete from maintenance_private.native_notification_devices where user_id=target_user;
 return not exists(select 1 from maintenance_private.native_notification_devices where user_id=target_user);
end;$$;
revoke all on function public.erase_maintenance_deletion_native_push(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.erase_maintenance_deletion_native_push(uuid,uuid,uuid,uuid) to service_role;
commit;
