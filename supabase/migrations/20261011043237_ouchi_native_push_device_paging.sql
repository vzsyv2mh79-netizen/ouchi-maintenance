begin;
create function public.page_maintenance_native_sandbox_devices(after_id uuid default null,batch_size integer default 25) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if batch_size is null or batch_size < 1 or batch_size > 25 then raise exception 'Invalid notification page size'; end if;
 return (select coalesce(jsonb_agg(rows.id order by rows.id),'[]'::jsonb) from (
  select d.id from maintenance_private.native_notification_devices d
  where d.environment='Sandbox' and d.enabled and (after_id is null or d.id > after_id)
  and public.maintenance_native_push_allowed(d.id)
  order by d.id limit batch_size
 ) rows);
end $$;
revoke all on function public.page_maintenance_native_sandbox_devices(uuid,integer) from public,anon,authenticated;
grant execute on function public.page_maintenance_native_sandbox_devices(uuid,integer) to service_role;
commit;
