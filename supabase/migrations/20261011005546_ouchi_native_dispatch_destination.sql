begin;
-- Internal Sandbox destination lookup; no user-facing endpoint exposes tokens.
create function public.read_maintenance_native_sandbox_destination(registration_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',d.id,'environment',d.environment,'deviceToken',d.device_token,'topic',d.topic,'registeredAt',floor(extract(epoch from d.created_at)*1000)::bigint)
 from maintenance_private.native_notification_devices d
 where d.id=registration_id and d.environment='Sandbox' and public.maintenance_native_push_allowed(d.id);
$$;
revoke all on function public.read_maintenance_native_sandbox_destination(uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_native_sandbox_destination(uuid) to service_role;
commit;
