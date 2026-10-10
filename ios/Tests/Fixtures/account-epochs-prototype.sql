-- TEST ONLY. Separate app identity epochs; no production migration or Auth deletion.
create schema if not exists maintenance_private;
create table maintenance_private.app_epochs(
 user_id uuid primary key references auth.users(id),
 epoch_id uuid not null unique,
 enabled boolean not null
);
create table maintenance_private.app_session_epochs(
 session_id uuid primary key,
 user_id uuid not null references auth.users(id),
 epoch_id uuid not null
);
alter table maintenance_private.app_epochs enable row level security;
alter table maintenance_private.app_session_epochs enable row level security;
revoke all on maintenance_private.app_epochs,maintenance_private.app_session_epochs from public,anon,authenticated;
grant usage on schema maintenance_private to service_role;
grant select,insert,update,delete on maintenance_private.app_epochs,maintenance_private.app_session_epochs to service_role;
-- API must independently verify caller and recent reauthentication, and derive session UUID.
create function maintenance_private.enroll_app_epoch(target_user uuid, verified_session uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare fresh uuid; active boolean;
begin
 if target_user is null or verified_session is null then raise exception 'Invalid identity'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 select enabled into active from maintenance_private.app_epochs where user_id=target_user for update;
 if active then raise exception 'Existing enrollment'; end if;
 -- A previously bound session must never become a new enrollment credential.
 if exists(select 1 from maintenance_private.app_session_epochs where session_id=verified_session) then raise exception 'Session already bound'; end if;
 fresh := gen_random_uuid();
 insert into maintenance_private.app_epochs values(target_user,fresh,true)
 on conflict(user_id) do update set epoch_id=excluded.epoch_id,enabled=true;
 insert into maintenance_private.app_session_epochs values(verified_session,target_user,fresh);
 return fresh;
end;$$;
create function maintenance_private.close_app_epoch(target_user uuid, expected_epoch uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if target_user is null or expected_epoch is null then raise exception 'Invalid identity'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 update maintenance_private.app_epochs set enabled=false where user_id=target_user and epoch_id=expected_epoch and enabled;
 return found;
end;$$;
create function maintenance_private.epoch_session_allowed(target_user uuid, token_session uuid, purchase_epoch uuid default null) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.app_epochs a
 join maintenance_private.app_session_epochs s on s.user_id=a.user_id and s.epoch_id=a.epoch_id
 where a.user_id=target_user and a.enabled and s.session_id=token_session
 and (purchase_epoch is null or purchase_epoch=a.epoch_id));
$$;
revoke all on function maintenance_private.enroll_app_epoch(uuid,uuid),maintenance_private.close_app_epoch(uuid,uuid),maintenance_private.epoch_session_allowed(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function maintenance_private.enroll_app_epoch(uuid,uuid),maintenance_private.close_app_epoch(uuid,uuid),maintenance_private.epoch_session_allowed(uuid,uuid,uuid) to service_role;
-- Integrated lifecycle transitions, still TEST ONLY. Expected epoch makes retries
-- safe against a later enrollment. Existing app cleanup stays in one transaction.
create function maintenance_private.close_app_identity(target_user uuid, expected_epoch uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if target_user is null or expected_epoch is null then raise exception 'Invalid identity'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=expected_epoch and enabled) then return false; end if;
 perform maintenance_private.close_app_epoch(target_user,expected_epoch);
 perform maintenance_private.close_account_access(target_user);
 return true;
end;$$;
create function maintenance_private.reenroll_app_identity(target_user uuid, verified_session uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare fresh uuid;
begin
 if target_user is null or verified_session is null then raise exception 'Invalid identity'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 -- Never enroll an unknown user or bypass an existing open account.
 if not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled) then raise exception 'Closed app account required'; end if;
 fresh := maintenance_private.enroll_app_epoch(target_user,verified_session);
 update maintenance_private.account_access set enabled=true where user_id=target_user;
 return fresh;
end;$$;
revoke all on function maintenance_private.close_app_identity(uuid,uuid),maintenance_private.reenroll_app_identity(uuid,uuid) from public,anon,authenticated;
grant execute on function maintenance_private.close_app_identity(uuid,uuid),maintenance_private.reenroll_app_identity(uuid,uuid) to service_role;
-- Local-only API adapter. UUIDs must be derived from server-verified JWT claims.
create function public.close_maintenance_app_identity(target_user uuid, verified_session uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare expected uuid;
begin
 if target_user is null or verified_session is null then raise exception 'Invalid identity'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 select a.epoch_id into expected from maintenance_private.app_epochs a
 join maintenance_private.app_session_epochs s on s.user_id=a.user_id and s.epoch_id=a.epoch_id
 where a.user_id=target_user and s.session_id=verified_session;
 if not found then raise exception 'App session unavailable'; end if;
 return maintenance_private.close_app_identity(target_user,expected);
end;$$;
revoke all on function public.close_maintenance_app_identity(uuid,uuid) from public,anon,authenticated;
grant execute on function public.close_maintenance_app_identity(uuid,uuid) to service_role;

-- Local-only API adapter. Caller/session must come from server-verified Auth.
create function public.reenroll_maintenance_app_identity(target_user uuid, verified_session uuid) returns uuid
language sql security invoker set search_path='' as $$
 select maintenance_private.reenroll_app_identity(target_user,verified_session)
$$;
revoke all on function public.reenroll_maintenance_app_identity(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reenroll_maintenance_app_identity(uuid,uuid) to service_role;
