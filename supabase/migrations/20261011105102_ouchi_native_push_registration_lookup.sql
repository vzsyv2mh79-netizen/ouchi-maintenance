begin;
-- Read only: confirmation must never reactivate or transfer a destination.
create function public.read_maintenance_native_scoped_registration(target_user uuid,verified_session uuid,expected_epoch uuid,token text,push_environment text,purchase_environment text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d maintenance_private.native_notification_devices%rowtype; rights jsonb;
begin
 if token is null or length(token) not between 32 and 1024 or token !~ '^([0-9a-f]{2})+$'
 or push_environment is null or push_environment not in ('Sandbox','Production')
 or purchase_environment is null or purchase_environment not in ('Sandbox','Production') then raise exception 'Invalid registration'; end if;
 rights:=public.read_maintenance_verified_entitlement(target_user,verified_session,expected_epoch,purchase_environment);
 select * into d from maintenance_private.native_notification_devices row_device
 where row_device.user_id=target_user and row_device.session_id=verified_session and row_device.app_epoch_id=expected_epoch
 and row_device.environment=push_environment and row_device.purchase_environment=read_maintenance_native_scoped_registration.purchase_environment
 and row_device.topic='jp.ouchi.maintenance' and row_device.device_token=token
 order by row_device.enabled desc,row_device.created_at desc,row_device.id desc limit 1;
 if not found then return null; end if;
 return jsonb_build_object('registrationId',d.id,'enabled',d.enabled);
end $$;
revoke all on function public.read_maintenance_native_scoped_registration(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.read_maintenance_native_scoped_registration(uuid,uuid,uuid,text,text,text) to service_role;
commit;
