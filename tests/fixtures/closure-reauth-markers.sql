-- Disposable candidate only. Auth trigger/permissions are NOT applied live.
begin;
create table maintenance_private.closure_reauth_markers(
 marker_id uuid primary key,user_id uuid not null,original_session uuid not null,app_epoch uuid not null,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '2 minutes',
 closed_at timestamptz,check(marker_id<>'00000000-0000-0000-0000-000000000000'::uuid)
);
create index closure_reauth_open on maintenance_private.closure_reauth_markers(user_id,app_epoch,expires_at) where closed_at is null;
create index closure_reauth_closed on maintenance_private.closure_reauth_markers(user_id,app_epoch,closed_at) where closed_at is not null;
alter table maintenance_private.closure_reauth_markers enable row level security;
revoke all on maintenance_private.closure_reauth_markers from public,anon,authenticated,service_role,ouchi_closure_review_executor;

create function maintenance_private.closure_reauth_register(actor uuid,original uuid,epoch uuid,marker uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.closure_reauth_markers;
begin
 perform maintenance_private.closure_review_assert_actor(actor);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(actor::text));
 if marker is null or marker='00000000-0000-0000-0000-000000000000'::uuid or public.current_maintenance_purchase_account(actor,original) is distinct from epoch or epoch is null then raise exception 'Current reauthentication scope required'; end if;
 select * into prior from maintenance_private.closure_reauth_markers where marker_id=marker for update;
 if found then
  if prior.user_id is distinct from actor or prior.original_session is distinct from original or prior.app_epoch is distinct from epoch or prior.closed_at is not null or prior.expires_at<=clock_timestamp() then raise exception 'Reauthentication marker unavailable'; end if;
  return true;
 end if;
 if (select count(*) from maintenance_private.closure_reauth_markers where user_id=actor and closed_at is null)>=128 then raise exception 'Reauthentication recovery required'; end if;
 insert into maintenance_private.closure_reauth_markers(marker_id,user_id,original_session,app_epoch) values(marker,actor,original,epoch);
 return true;
end;$$;

create function maintenance_private.closure_reauth_insert_fence() returns trigger
language plpgsql security definer set search_path='' as $$
declare marker uuid; saved maintenance_private.closure_reauth_markers;
begin
 if coalesce(new.user_agent,'') not like 'OuchiMaintenance/closure-reauth/v1/%' then return new; end if;
 if new.user_agent !~ '^OuchiMaintenance/closure-reauth/v1/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid reauthentication agent'; end if;
 marker:=substring(new.user_agent from length('OuchiMaintenance/closure-reauth/v1/')+1)::uuid;
 select * into saved from maintenance_private.closure_reauth_markers where marker_id=marker for update;
 if not found or saved.user_id is distinct from new.user_id or saved.original_session=new.id or saved.closed_at is not null or saved.expires_at<=clock_timestamp()
 or public.current_maintenance_purchase_account(saved.user_id,saved.original_session) is distinct from saved.app_epoch then raise exception 'Reauthentication agent closed'; end if;
 return new;
end;$$;
create trigger ouchi_closure_reauth_insert_fence before insert on auth.sessions for each row execute function maintenance_private.closure_reauth_insert_fence();
revoke all on function maintenance_private.closure_reauth_insert_fence() from public,anon,authenticated,service_role,ouchi_closure_review_executor;

create function maintenance_private.closure_reauth_observe(actor uuid,original uuid,epoch uuid,marker uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare saved maintenance_private.closure_reauth_markers; n integer;
begin
 perform maintenance_private.closure_review_assert_actor(actor);
 select * into saved from maintenance_private.closure_reauth_markers where marker_id=marker;
 if not found or saved.user_id is distinct from actor or saved.original_session is distinct from original or saved.app_epoch is distinct from epoch or saved.closed_at is not null or saved.expires_at<=clock_timestamp() then raise exception 'Reauthentication marker unavailable'; end if;
 select count(*)::integer into n from auth.sessions where user_id=actor and id<>original and user_agent='OuchiMaintenance/closure-reauth/v1/'||marker::text;
 return n;
end;$$;

create function maintenance_private.closure_reauth_close(actor uuid,original uuid,epoch uuid,marker uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare saved maintenance_private.closure_reauth_markers; n integer;
begin
 perform maintenance_private.closure_review_assert_actor(actor);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(actor::text));
 select * into saved from maintenance_private.closure_reauth_markers where marker_id=marker for update;
 if not found then return 0; end if;
 if saved.user_id is distinct from actor or saved.original_session is distinct from original or saved.app_epoch is distinct from epoch then raise exception 'Reauthentication marker scope changed'; end if;
 update maintenance_private.closure_reauth_markers set closed_at=coalesce(closed_at,clock_timestamp()) where marker_id=marker;
 delete from auth.refresh_tokens where session_id in(select id from auth.sessions where user_id=actor and id<>original and user_agent='OuchiMaintenance/closure-reauth/v1/'||marker::text);
 delete from auth.sessions where user_id=actor and id<>original and user_agent='OuchiMaintenance/closure-reauth/v1/'||marker::text;
 get diagnostics n=row_count;return n;
end;$$;

create function maintenance_private.closure_reauth_sweep(actor uuid,epoch uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved maintenance_private.closure_reauth_markers; closed integer:=0; purged integer;
begin
 perform maintenance_private.closure_review_assert_actor(actor);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(actor::text));
 for saved in select * from maintenance_private.closure_reauth_markers where user_id=actor and app_epoch=epoch and closed_at is null and expires_at<=clock_timestamp() order by created_at limit 100 for update loop
  perform maintenance_private.closure_reauth_close(actor,saved.original_session,epoch,saved.marker_id);closed:=closed+1;
 end loop;
 delete from maintenance_private.closure_reauth_markers where marker_id in(select marker_id from maintenance_private.closure_reauth_markers where user_id=actor and app_epoch=epoch and closed_at<clock_timestamp()-interval '1 day' order by closed_at limit 100);
 get diagnostics purged=row_count;
 return pg_catalog.jsonb_build_object('closed',closed,'purged',purged);
end;$$;
revoke all on function maintenance_private.closure_reauth_register(uuid,uuid,uuid,uuid),maintenance_private.closure_reauth_observe(uuid,uuid,uuid,uuid),maintenance_private.closure_reauth_close(uuid,uuid,uuid,uuid),maintenance_private.closure_reauth_sweep(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_reauth_register(uuid,uuid,uuid,uuid),maintenance_private.closure_reauth_observe(uuid,uuid,uuid,uuid),maintenance_private.closure_reauth_close(uuid,uuid,uuid,uuid),maintenance_private.closure_reauth_sweep(uuid,uuid) to ouchi_closure_review_executor;
commit;
