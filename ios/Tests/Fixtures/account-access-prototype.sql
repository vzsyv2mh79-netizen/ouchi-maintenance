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
-- Invite redemption is SECURITY DEFINER: row policies alone cannot deny it.
create or replace function maintenance_private.accept_home_invite(invite_code text, member_name text) returns void
language plpgsql security definer set search_path='' as $$
declare invitation public.home_invites;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if not maintenance_private.account_enabled() then raise exception 'App account unavailable'; end if;
 if length(trim(member_name)) not between 1 and 80 or invite_code !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invite'; end if;
 select * into invitation from public.home_invites where token_hash=sha256(convert_to(invite_code,'UTF8')) for update;
 if not found or invitation.revoked or invitation.used_at is not null or invitation.expires_at<=now() then raise exception 'Invite unavailable'; end if;
 if maintenance_private.owns_home(invitation."homeId") then raise exception 'Already owner'; end if;
 insert into public.home_members("homeId",user_id,nickname) values(invitation."homeId",auth.uid(),trim(member_name)) on conflict do nothing;
 update public.home_invites set used_at=now() where id=invitation.id;
end; $$;
revoke all on function maintenance_private.accept_home_invite(text,text) from public,anon;
grant execute on function maintenance_private.accept_home_invite(text,text) to authenticated;
