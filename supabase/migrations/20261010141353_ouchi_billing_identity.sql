-- Additive purchase identity foundation. No entitlement, purchase, erasure or
-- existing household policy changes. Apply only after rollout review.
begin;
create schema if not exists maintenance_private;
grant usage on schema maintenance_private to service_role;
grant usage on schema auth to service_role;
grant select(id,user_id,not_after) on auth.sessions to service_role;

create table maintenance_private.account_access (
 user_id uuid primary key references auth.users(id),
 enabled boolean not null
);
create table maintenance_private.app_epochs (
 user_id uuid primary key references auth.users(id),
 epoch_id uuid not null unique,
 enabled boolean not null
);
create table maintenance_private.app_session_epochs (
 session_id uuid primary key,
 user_id uuid not null references maintenance_private.app_epochs(user_id),
 epoch_id uuid not null
);
create index app_session_epochs_user_epoch on maintenance_private.app_session_epochs(user_id,epoch_id);
alter table maintenance_private.account_access enable row level security;
alter table maintenance_private.app_epochs enable row level security;
alter table maintenance_private.app_session_epochs enable row level security;
revoke all on maintenance_private.account_access,maintenance_private.app_epochs,maintenance_private.app_session_epochs from public,anon,authenticated;
grant select,insert,update on maintenance_private.account_access,maintenance_private.app_epochs,maintenance_private.app_session_epochs to service_role;

-- Exact bearer must already be verified with Auth.getUser by the server.
-- This function creates only an opaque purchase-account identity, never rights.
create function public.current_maintenance_purchase_account(target_user uuid,verified_session uuid) returns uuid
language plpgsql volatile security invoker set search_path='' as $$
declare current_epoch uuid; bound_epoch uuid;
begin
 if target_user is null or verified_session is null then return null; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not exists(select 1 from auth.sessions s where s.id=verified_session and s.user_id=target_user and (s.not_after is null or s.not_after>now())) then return null; end if;
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
revoke all on function public.current_maintenance_purchase_account(uuid,uuid) from public,anon,authenticated;
grant execute on function public.current_maintenance_purchase_account(uuid,uuid) to service_role;
commit;
