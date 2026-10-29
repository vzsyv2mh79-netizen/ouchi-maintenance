begin;
-- Prevent household members from reading or modifying an owner's closed home
-- while its leased deletion is pending. Existing open households remain shared.
create function maintenance_private.maintenance_home_is_open(home_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.homes h where h.id=home_id
 and not exists(select 1 from maintenance_private.account_access a where a.user_id=h.owner_id and not a.enabled)
 and not exists(select 1 from maintenance_private.app_epochs e where e.user_id=h.owner_id and not e.enabled));
$$;
revoke all on function maintenance_private.maintenance_home_is_open(uuid) from public,anon;
grant execute on function maintenance_private.maintenance_home_is_open(uuid) to authenticated,service_role;
create or replace function maintenance_private.owns_home(home_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select maintenance_private.maintenance_account_is_open()
 and maintenance_private.maintenance_home_is_open(home_id)
 and exists(select 1 from public.homes h where h.id=home_id and h.owner_id=auth.uid());
$$;
create or replace function maintenance_private.access_home(home_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select maintenance_private.maintenance_account_is_open()
 and maintenance_private.maintenance_home_is_open(home_id)
 and (maintenance_private.owns_home(home_id)
 or exists(select 1 from public.home_members m where m."homeId"=home_id and m.user_id=auth.uid()));
$$;
commit;
