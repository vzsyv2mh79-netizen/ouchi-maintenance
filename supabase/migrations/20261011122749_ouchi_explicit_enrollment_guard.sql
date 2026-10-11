begin;
-- Disabled rollout gate only. No enrollment/session/data is changed here.
-- Explicit enrollment/reauthentication and finite completion receipts must be
-- implemented and verified before this policy is enabled or identities erased.
create table maintenance_private.enrollment_policy (
 id smallint primary key check(id=1),
 require_explicit boolean not null default false
);
insert into maintenance_private.enrollment_policy(id,require_explicit) values(1,false);
alter table maintenance_private.enrollment_policy enable row level security;
revoke all on maintenance_private.enrollment_policy from public,anon,authenticated;
grant select,update on maintenance_private.enrollment_policy to service_role;
create or replace function public.current_maintenance_purchase_account(target_user uuid,verified_session uuid) returns uuid
language plpgsql volatile security invoker set search_path='' as $$
declare current_epoch uuid; bound_epoch uuid;
begin
 if target_user is null or verified_session is null then return null; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not exists(select 1 from auth.sessions s where s.id=verified_session and s.user_id=target_user and (s.not_after is null or s.not_after>now())) then return null; end if;
 -- Required before final identity erasure: an absent enrollment is not consent.
 if exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit) then
  select e.epoch_id into current_epoch
  from maintenance_private.app_epochs e
  join maintenance_private.account_access a on a.user_id=e.user_id and a.enabled
  join maintenance_private.app_session_epochs s on s.user_id=e.user_id and s.epoch_id=e.epoch_id
  where e.user_id=target_user and e.enabled and s.session_id=verified_session;
  return current_epoch;
 end if;
 -- Explicitly closed identities must not reopen on a later ordinary login.
 if exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and not enabled) then return null; end if;
 insert into maintenance_private.account_access(user_id,enabled) values(target_user,true) on conflict(user_id) do nothing;
 insert into maintenance_private.app_epochs(user_id,epoch_id,enabled) values(target_user,gen_random_uuid(),true) on conflict(user_id) do nothing;
 select epoch_id into current_epoch from maintenance_private.app_epochs where user_id=target_user and enabled;
 if current_epoch is null then return null; end if;
 insert into maintenance_private.app_session_epochs(session_id,user_id,epoch_id) values(verified_session,target_user,current_epoch) on conflict(session_id) do nothing;
 select epoch_id into bound_epoch from maintenance_private.app_session_epochs where session_id=verified_session and user_id=target_user;
 if bound_epoch is distinct from current_epoch then return null; end if;
 return current_epoch;
end;$$;
create or replace function maintenance_private.maintenance_account_is_open() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and case
 when exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit) then
  exists(select 1 from maintenance_private.app_epochs e
   join maintenance_private.account_access a on a.user_id=e.user_id and a.enabled
   join maintenance_private.app_session_epochs s on s.user_id=e.user_id and s.epoch_id=e.epoch_id
   join auth.sessions live on live.id=s.session_id and live.user_id=e.user_id
   where e.user_id=auth.uid() and e.enabled
    and s.session_id::text=lower(auth.jwt()->>'session_id')
    and (live.not_after is null or live.not_after>statement_timestamp()))
 else
  not exists(select 1 from maintenance_private.account_access where user_id=auth.uid() and not enabled)
  and not exists(select 1 from maintenance_private.app_epochs where user_id=auth.uid() and not enabled)
 end;
$$;
create function public.maintenance_explicit_enrollment_is_required() returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit);
$$;
revoke all on function public.current_maintenance_purchase_account(uuid,uuid),public.maintenance_explicit_enrollment_is_required() from public,anon,authenticated;
grant execute on function public.current_maintenance_purchase_account(uuid,uuid),public.maintenance_explicit_enrollment_is_required() to service_role;
revoke all on function maintenance_private.maintenance_account_is_open() from public,anon;
grant execute on function maintenance_private.maintenance_account_is_open() to authenticated,service_role;
commit;
