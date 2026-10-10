begin;
-- Additive closure gate only. No account is closed by this migration.
-- Reenrollment is not exposed: reopening requires a separate session/epoch policy review.
create function maintenance_private.maintenance_account_is_open() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and not exists(select 1 from maintenance_private.account_access where user_id=auth.uid() and not enabled)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=auth.uid() and not enabled);
$$;
revoke all on function maintenance_private.maintenance_account_is_open() from public,anon;
grant execute on function maintenance_private.maintenance_account_is_open() to authenticated,service_role;
create function maintenance_private.enforce_open_maintenance_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Trusted service workers have no end-user auth.uid(). Authenticated callers,
 -- including SECURITY DEFINER invitation redemption, must pass the closure gate.
 if auth.uid() is not null and not maintenance_private.maintenance_account_is_open() then raise exception 'App account closed'; end if;
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end;$$;
revoke all on function maintenance_private.enforce_open_maintenance_account() from public,anon,authenticated;
create policy open_maintenance_account on public.homes as restrictive for all to authenticated using((select maintenance_private.maintenance_account_is_open())) with check((select maintenance_private.maintenance_account_is_open()));
create policy open_maintenance_account on public.products as restrictive for all to authenticated using((select maintenance_private.maintenance_account_is_open())) with check((select maintenance_private.maintenance_account_is_open()));
create policy open_maintenance_account on public.maintenance_tasks as restrictive for all to authenticated using((select maintenance_private.maintenance_account_is_open())) with check((select maintenance_private.maintenance_account_is_open()));
create policy open_maintenance_account on public.maintenance_history as restrictive for all to authenticated using((select maintenance_private.maintenance_account_is_open())) with check((select maintenance_private.maintenance_account_is_open()));
create policy open_maintenance_account on public.home_members as restrictive for all to authenticated using((select maintenance_private.maintenance_account_is_open())) with check((select maintenance_private.maintenance_account_is_open()));
create policy open_maintenance_account on public.home_invites as restrictive for all to authenticated using((select maintenance_private.maintenance_account_is_open())) with check((select maintenance_private.maintenance_account_is_open()));
create policy open_maintenance_account on public.maintenance_push_subscriptions as restrictive for all to authenticated using((select maintenance_private.maintenance_account_is_open())) with check((select maintenance_private.maintenance_account_is_open()));
create policy open_maintenance_account on public.maintenance_imports as restrictive for all to authenticated using((select maintenance_private.maintenance_account_is_open())) with check((select maintenance_private.maintenance_account_is_open()));
create policy open_maintenance_account on public.maintenance_backup_restores as restrictive for all to authenticated using((select maintenance_private.maintenance_account_is_open())) with check((select maintenance_private.maintenance_account_is_open()));
create trigger maintenance_account_write_gate before insert or update or delete on public.home_members for each row execute function maintenance_private.enforce_open_maintenance_account();
commit;
