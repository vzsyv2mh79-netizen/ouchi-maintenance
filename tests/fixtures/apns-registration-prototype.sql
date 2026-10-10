-- TEST ONLY, after account-epochs-prototype.sql. Not a production migration.
-- Service must verify Auth user/session before registration or disabling.
create table maintenance_private.apns_registrations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 session_id uuid not null,
 epoch_id uuid not null,
 device_token text not null check(length(device_token) between 32 and 1024 and device_token ~ '^([0-9a-f]{2})+$'),
 topic text not null check(length(topic)<=200 and topic ~ '^[A-Za-z0-9]+([.-][A-Za-z0-9]+)+$'),
 registered_at timestamptz not null default clock_timestamp(),
 enabled boolean not null default true
);
create unique index apns_active_token on maintenance_private.apns_registrations(topic,device_token) where enabled;
create index apns_registration_account on maintenance_private.apns_registrations(user_id,epoch_id) where enabled;
alter table maintenance_private.apns_registrations enable row level security;
revoke all on maintenance_private.apns_registrations from public,anon,authenticated;
grant select,insert,update on maintenance_private.apns_registrations to service_role;
create function public.register_maintenance_apns(target_user uuid,verified_session uuid,expected_epoch uuid,token text,bundle_topic text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare prior maintenance_private.apns_registrations; result uuid;
begin
 if token is null or length(token) not between 32 and 1024 or token !~ '^([0-9a-f]{2})+$' or bundle_topic is null or length(bundle_topic)>200 or bundle_topic !~ '^[A-Za-z0-9]+([.-][A-Za-z0-9]+)+$' or expected_epoch is null then raise exception 'Invalid registration'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not maintenance_private.epoch_session_allowed(target_user,verified_session,expected_epoch) then raise exception 'Inactive enrollment'; end if;
 perform pg_advisory_xact_lock(hashtext(bundle_topic||':'||token));
 select * into prior from maintenance_private.apns_registrations where topic=bundle_topic and device_token=token and enabled for update;
 if found then
  -- Never transfer an active notification destination merely because another
  -- account submitted its token. The old registration must first be disabled.
  if prior.user_id<>target_user or prior.epoch_id<>expected_epoch or prior.session_id<>verified_session then raise exception 'Registration already bound'; end if;
  return prior.id;
 end if;
 insert into maintenance_private.apns_registrations(user_id,session_id,epoch_id,device_token,topic)
 values(target_user,verified_session,expected_epoch,token,bundle_topic) returning id into result;
 return result;
end;$$;
create function public.disable_maintenance_apns(target_user uuid,verified_session uuid,expected_epoch uuid,registration_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not maintenance_private.epoch_session_allowed(target_user,verified_session,expected_epoch) then return false; end if;
 update maintenance_private.apns_registrations set enabled=false
 where id=registration_id and user_id=target_user and session_id=verified_session and epoch_id=expected_epoch and enabled;
 return found;
end;$$;
create function public.maintenance_apns_registration_allowed(registration_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.apns_registrations r
 where r.id=registration_id and r.enabled
 and maintenance_private.epoch_session_allowed(r.user_id,r.session_id,r.epoch_id));
$$;
revoke all on function public.register_maintenance_apns(uuid,uuid,uuid,text,text),public.disable_maintenance_apns(uuid,uuid,uuid,uuid),public.maintenance_apns_registration_allowed(uuid) from public,anon,authenticated;
grant execute on function public.register_maintenance_apns(uuid,uuid,uuid,text,text),public.disable_maintenance_apns(uuid,uuid,uuid,uuid),public.maintenance_apns_registration_allowed(uuid) to service_role;

-- Closing an enrollment releases its destination without transferring old jobs.
create function maintenance_private.close_apns_epoch() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.enabled and (not new.enabled or old.epoch_id<>new.epoch_id) then
  update maintenance_private.apns_registrations set enabled=false
  where user_id=old.user_id and epoch_id=old.epoch_id and enabled;
 end if;
 return new;
end;$$;
revoke all on function maintenance_private.close_apns_epoch() from public,anon,authenticated;
grant execute on function maintenance_private.close_apns_epoch() to service_role;
create trigger close_apns_epoch after update on maintenance_private.app_epochs
for each row execute function maintenance_private.close_apns_epoch();
