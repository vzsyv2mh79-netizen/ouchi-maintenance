begin;
-- APNs development/distribution and StoreKit purchase environments are independent.
-- Legacy internal registrations keep their old behavior; formal registration
-- explicitly binds the trusted purchase environment and never rewrites a binding.
alter table maintenance_private.native_notification_devices add column purchase_environment text check(purchase_environment in ('Sandbox','Production'));
create function public.register_maintenance_native_scoped_push(target_user uuid,verified_session uuid,expected_epoch uuid,token text,push_environment text,purchase_environment text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid; prior maintenance_private.native_notification_devices%rowtype; rights jsonb;
begin
 if purchase_environment is null or purchase_environment not in ('Sandbox','Production') then raise exception 'Invalid purchase environment'; end if;
 -- Also obtains the common account lock and checks exact live session/enrollment.
 rights:=public.read_maintenance_verified_entitlement(target_user,verified_session,expected_epoch,purchase_environment);
 result:=public.register_maintenance_native_push(target_user,verified_session,expected_epoch,token,push_environment);
 select * into prior from maintenance_private.native_notification_devices where id=result for update;
 if not found or (prior.purchase_environment is not null and prior.purchase_environment<>purchase_environment) then raise exception 'Destination already bound'; end if;
 update maintenance_private.native_notification_devices set purchase_environment=register_maintenance_native_scoped_push.purchase_environment where id=result;
 return result;
end $$;
create function public.disable_maintenance_native_scoped_push(target_user uuid,verified_session uuid,expected_epoch uuid,registration_id uuid,push_environment text,purchase_environment text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if push_environment is null or push_environment not in ('Sandbox','Production') or purchase_environment is null or purchase_environment not in ('Sandbox','Production') then return false; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not exists(select 1 from maintenance_private.native_notification_devices d where d.id=registration_id and d.user_id=target_user and d.app_epoch_id=expected_epoch and d.session_id=verified_session and d.environment=push_environment and d.purchase_environment=disable_maintenance_native_scoped_push.purchase_environment) then return false; end if;
 return public.disable_maintenance_native_push(target_user,verified_session,expected_epoch,registration_id);
end $$;
create or replace function maintenance_private.native_effective_schedule(registration_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d maintenance_private.native_notification_devices%rowtype; settings jsonb;
begin
 select * into d from maintenance_private.native_notification_devices where id=registration_id;
 if not found or public.maintenance_native_push_allowed(d.id) is not true then return null; end if;
 settings:=public.read_maintenance_reminder_schedule(d.user_id,d.session_id,d.app_epoch_id,coalesce(d.purchase_environment,d.environment));
 return settings->'effective';
end $$;
revoke all on function public.register_maintenance_native_scoped_push(uuid,uuid,uuid,text,text,text),public.disable_maintenance_native_scoped_push(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.register_maintenance_native_scoped_push(uuid,uuid,uuid,text,text,text),public.disable_maintenance_native_scoped_push(uuid,uuid,uuid,uuid,text,text) to service_role;
commit;
