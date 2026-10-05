-- Erase only this application's data. Auth identity may be shared with other apps.
create function public.erase_maintenance_data() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  delete from public.home_members where user_id = auth.uid();
  delete from public.homes where owner_id = auth.uid();
end; $$;
revoke all on function public.erase_maintenance_data() from public, anon;
grant execute on function public.erase_maintenance_data() to authenticated;
