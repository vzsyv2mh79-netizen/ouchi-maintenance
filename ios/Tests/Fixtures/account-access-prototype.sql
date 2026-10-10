-- TEST-ONLY access control foundation, not account deletion or a live migration.
create table maintenance_private.account_access(user_id uuid primary key references auth.users(id),enabled boolean not null);
alter table maintenance_private.account_access enable row level security;
revoke all on maintenance_private.account_access from public,anon,authenticated;
grant select,insert,update,delete on maintenance_private.account_access to service_role;
create function maintenance_private.account_enabled() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from maintenance_private.account_access a where a.user_id=auth.uid() and a.enabled)$$;
revoke all on function maintenance_private.account_enabled() from public,anon;
grant execute on function maintenance_private.account_enabled() to authenticated;
create policy active_account_homes on public.homes as restrictive for all to authenticated using(maintenance_private.account_enabled()) with check(maintenance_private.account_enabled());
create policy active_account_products on public.products as restrictive for all to authenticated using(maintenance_private.account_enabled()) with check(maintenance_private.account_enabled());
create policy active_account_members on public.home_members as restrictive for all to authenticated using(maintenance_private.account_enabled()) with check(maintenance_private.account_enabled());
