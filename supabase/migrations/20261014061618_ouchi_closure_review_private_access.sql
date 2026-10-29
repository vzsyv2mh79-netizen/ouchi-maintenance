-- Additive release candidate. Intake remains disabled; no LOGIN or scheduler is provisioned.
begin;
create role ouchi_closure_review_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema maintenance_private to ouchi_closure_review_executor;

create function maintenance_private.closure_review_assert_actor(target_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if target_user is null or target_user='00000000-0000-0000-0000-000000000000'::uuid
 or auth.uid() is null or auth.uid()<>target_user then raise exception 'Verified review actor context required'; end if;
end;$$;
revoke all on function maintenance_private.closure_review_assert_actor(uuid) from public,anon,authenticated,service_role;

create function maintenance_private.closure_review_session(session_id uuid,user_id uuid,timebox bigint,inactivity bigint) returns table(verified_at numeric,epoch_id uuid,session_aal text,has_verified_factor boolean,session_current boolean)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.closure_review_assert_actor($2);
 return query select
 extract(epoch from clock_timestamp()) * 1000 as verified_at,
 public.read_maintenance_explicit_enrollment($2::uuid,$1::uuid) as epoch_id,
 s.aal::text as session_aal,
 exists(select 1 from auth.mfa_factors f where f.user_id=s.user_id and f.status::text='verified') as has_verified_factor,
 (s.not_after is null or s.not_after>clock_timestamp())
 and s.created_at<=clock_timestamp()
 and (s.refreshed_at is null or (s.refreshed_at at time zone 'UTC')<=clock_timestamp())
 and ($3::bigint is null or s.created_at+($3::bigint * interval '1 second')>clock_timestamp())
 and ($4::bigint is null or (s.refreshed_at is not null and s.refreshed_at at time zone 'UTC'+($4::bigint * interval '1 second')>clock_timestamp())) as session_current
 from auth.sessions s where s.id=$1::uuid and s.user_id=$2::uuid;
end;$$;
revoke all on function maintenance_private.closure_review_session(uuid,uuid,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_session(uuid,uuid,bigint,bigint) to ouchi_closure_review_executor;

create function maintenance_private.closure_review_pin_constraints() returns table(supported boolean)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.closure_review_assert_actor(auth.uid());
 return query select count(distinct c.conrelid)=2 as supported
 from pg_catalog.pg_constraint c
 join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
 join pg_catalog.pg_attribute target on target.attrelid=c.confrelid and target.attnum=any(c.confkey)
 where c.contype='f' and c.convalidated and not c.condeferrable
 and c.confrelid='auth.users'::regclass and a.attname='user_id'
 and target.attname='id' and cardinality(c.conkey)=1 and cardinality(c.confkey)=1
 and c.conrelid in ('auth.sessions'::regclass,'auth.mfa_factors'::regclass);
end;$$;
revoke all on function maintenance_private.closure_review_pin_constraints() from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_pin_constraints() to ouchi_closure_review_executor;

create function maintenance_private.closure_review_pin_user(user_id uuid) returns table(id uuid)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.closure_review_assert_actor($1);
 return query select u.id from auth.users u where u.id=$1 for update;
end;$$;
revoke all on function maintenance_private.closure_review_pin_user(uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_pin_user(uuid) to ouchi_closure_review_executor;

create function maintenance_private.closure_review_pin_session(session_id uuid,user_id uuid) returns table(id uuid)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.closure_review_assert_actor($2);
 return query select s.id from auth.sessions s where s.id=$1 and s.user_id=$2 for update;
end;$$;
revoke all on function maintenance_private.closure_review_pin_session(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_pin_session(uuid,uuid) to ouchi_closure_review_executor;

create function maintenance_private.closure_review_pin_factors(user_id uuid) returns table(id uuid)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.closure_review_assert_actor($1);
 return query select f.id from auth.mfa_factors f where f.user_id=$1 order by f.id for update;
end;$$;
revoke all on function maintenance_private.closure_review_pin_factors(uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_pin_factors(uuid) to ouchi_closure_review_executor;

create function maintenance_private.closure_review_pin_enrollment(user_id uuid,session_id uuid) returns table(epoch_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.closure_review_assert_actor($1);
 return query select e.epoch_id
 from maintenance_private.app_epochs e
 join maintenance_private.account_access a on a.user_id=e.user_id
 join maintenance_private.app_session_epochs b on b.user_id=e.user_id and b.epoch_id=e.epoch_id
 where e.user_id=$1::uuid and b.session_id=$2::uuid and e.enabled and a.enabled
 for update of e,a,b;
end;$$;
revoke all on function maintenance_private.closure_review_pin_enrollment(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_pin_enrollment(uuid,uuid) to ouchi_closure_review_executor;

create function maintenance_private.closure_review_actor_lock(user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.closure_review_assert_actor($1);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext($1::text));
end;$$;
revoke all on function maintenance_private.closure_review_actor_lock(uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_actor_lock(uuid) to ouchi_closure_review_executor;

create function maintenance_private.closure_review_auth_state(user_id uuid) returns table(reauthentication_state jsonb)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.closure_review_assert_actor($1);
 return query select pg_catalog.jsonb_build_object(
 'userID',u.id,'email',u.email,
 'password',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(u.encrypted_password,''),'UTF8')),'hex'),
 'bannedUntil',pg_catalog.to_jsonb(u)->'banned_until','deletedAt',pg_catalog.to_jsonb(u)->'deleted_at',
 'factors',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('digest',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.to_jsonb(f)::text,'UTF8')),'hex')) order by f.id) from auth.mfa_factors f where f.user_id=u.id),'[]'::jsonb)
) from auth.users u where u.id=$1;
end;$$;
revoke all on function maintenance_private.closure_review_auth_state(uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_auth_state(uuid) to ouchi_closure_review_executor;

create function maintenance_private.closure_review_execute(action text,user_id uuid,session_id uuid,epoch_id uuid,submission_id uuid) returns table(receipt jsonb)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.closure_review_assert_actor($2);
 if $1='request' then return query select public.request_maintenance_closure_review($2,$3,$4,$5);
 elsif $1='read' then return query select public.read_maintenance_closure_review($2,$3,$4,$5);
 elsif $1='cancel' then return query select public.cancel_maintenance_closure_review($2,$3,$4,$5);
 else raise exception 'Unsupported review action'; end if;
end;$$;
revoke all on function maintenance_private.closure_review_execute(text,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_execute(text,uuid,uuid,uuid,uuid) to ouchi_closure_review_executor;

commit;
