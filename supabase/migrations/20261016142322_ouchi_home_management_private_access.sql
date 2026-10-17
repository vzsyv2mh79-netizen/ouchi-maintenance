-- Dormant backend boundary. Creates NOLOGIN executor only, no login/membership,
-- credential, live policy, household detachment or shared Auth mutation.
begin;
create role ouchi_home_management_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema maintenance_private to ouchi_home_management_executor;

create function maintenance_private.home_management_assert_actor(target_user uuid,target_session uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if target_user is null or target_session is null or auth.uid() is distinct from target_user
 or (auth.jwt()->>'session_id') is distinct from target_session::text
 or public.read_maintenance_explicit_enrollment(target_user,target_session) is null
 then raise exception 'Verified current management actor required'; end if;
end;$$;
revoke all on function maintenance_private.home_management_assert_actor(uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;

-- Existing private pin helpers perform their established row locks, but this
-- executor cannot invoke them directly or acquire review/cancel permissions.
create function maintenance_private.home_management_session(session_id uuid,user_id uuid,timebox bigint,inactivity bigint)
returns table(verified_at numeric,epoch_id uuid,session_aal text,has_verified_factor boolean,session_current boolean)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.home_management_assert_actor($2,$1);
 return query select * from maintenance_private.closure_review_session($1,$2,$3,$4);
end;$$;
create function maintenance_private.home_management_pin_constraints() returns table(supported boolean)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.home_management_assert_actor(auth.uid(),(auth.jwt()->>'session_id')::uuid);
 return query select * from maintenance_private.closure_review_pin_constraints();
end;$$;
create function maintenance_private.home_management_pin_user(user_id uuid) returns table(id uuid)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.home_management_assert_actor($1,(auth.jwt()->>'session_id')::uuid);
 return query select * from maintenance_private.closure_review_pin_user($1);
end;$$;
create function maintenance_private.home_management_pin_session(session_id uuid,user_id uuid) returns table(id uuid)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.home_management_assert_actor($2,$1);
 return query select * from maintenance_private.closure_review_pin_session($1,$2);
end;$$;
create function maintenance_private.home_management_pin_factors(user_id uuid) returns table(id uuid)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.home_management_assert_actor($1,(auth.jwt()->>'session_id')::uuid);
 return query select * from maintenance_private.closure_review_pin_factors($1);
end;$$;
create function maintenance_private.home_management_pin_enrollment(user_id uuid,session_id uuid) returns table(epoch_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.home_management_assert_actor($1,$2);
 return query select * from maintenance_private.closure_review_pin_enrollment($1,$2);
end;$$;

-- Hash credential/factor state inside PostgreSQL. Return no email, password
-- hash, factor secret, refresh token or editable user_metadata to this backend.
create function maintenance_private.home_management_auth_snapshot(user_id uuid,session_id uuid) returns table(auth_state jsonb)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.home_management_assert_actor($1,$2);
 return query select pg_catalog.jsonb_build_object(
 'userDigest',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
  'id',u.id,'password',pg_catalog.to_jsonb(u)->'encrypted_password',
  'bannedUntil',pg_catalog.to_jsonb(u)->'banned_until','deletedAt',pg_catalog.to_jsonb(u)->'deleted_at')::text,'UTF8')),'hex'),
 'sessionDigest',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
  'id',s.id,'userID',s.user_id,'aal',s.aal,'createdAt',s.created_at,'notAfter',s.not_after)::text,'UTF8')),'hex'),
 'factorDigests',coalesce((select pg_catalog.jsonb_agg(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.to_jsonb(f)::text,'UTF8')),'hex') order by f.id)
  from auth.mfa_factors f where f.user_id=u.id),'[]'::jsonb))
 from auth.users u join auth.sessions s on s.user_id=u.id where u.id=$1 and s.id=$2;
end;$$;

create function maintenance_private.home_management_execute(action text,user_id uuid,session_id uuid,epoch_id uuid,home_id uuid,request_id uuid,generation uuid)
returns table(receipt jsonb) language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.home_management_assert_actor($2,$3);
 if public.read_maintenance_explicit_enrollment($2,$3) is distinct from $4 then raise exception 'Matching management enrollment required'; end if;
 if $1='status' and $6 is null and $7 is null then
  return query select maintenance_private.read_ownerless_home_status($5,$2,$3,$4);
 elsif $1='read' and $6 is not null and $7 is not null then
  return query select maintenance_private.read_ownerless_home_claim($6,$5,$7,$2,$3,$4);
 elsif $1='claim' and $6 is not null and $7 is not null then
  return query select maintenance_private.claim_ownerless_home($6,$5,$7,$2,$3,$4);
 else raise exception 'Unsupported management operation'; end if;
end;$$;

revoke all on function maintenance_private.home_management_session(uuid,uuid,bigint,bigint),maintenance_private.home_management_pin_constraints(),
 maintenance_private.home_management_pin_user(uuid),maintenance_private.home_management_pin_session(uuid,uuid),
 maintenance_private.home_management_pin_factors(uuid),maintenance_private.home_management_pin_enrollment(uuid,uuid),
 maintenance_private.home_management_auth_snapshot(uuid,uuid),maintenance_private.home_management_execute(text,uuid,uuid,uuid,uuid,uuid,uuid)
 from public,anon,authenticated,service_role,ouchi_closure_operator;
grant execute on function maintenance_private.home_management_session(uuid,uuid,bigint,bigint),maintenance_private.home_management_pin_constraints(),
 maintenance_private.home_management_pin_user(uuid),maintenance_private.home_management_pin_session(uuid,uuid),
 maintenance_private.home_management_pin_factors(uuid),maintenance_private.home_management_pin_enrollment(uuid,uuid),
 maintenance_private.home_management_auth_snapshot(uuid,uuid),maintenance_private.home_management_execute(text,uuid,uuid,uuid,uuid,uuid,uuid)
 to ouchi_home_management_executor;

-- Old, unused invitation links must not become valid under a new manager.
-- Exact receipt replay does not update homes, so it preserves the new owner's
-- subsequently created invitations. Existing members are never removed here.
create function maintenance_private.revoke_ownerless_home_invites() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.owner_id is null and new.owner_id is not null then
  update public.home_invites set revoked=true where "homeId"=old.id and used_at is null and not revoked;
 end if;
 return new;
end;$$;
revoke all on function maintenance_private.revoke_ownerless_home_invites() from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_home_management_executor;
create trigger revoke_ownerless_home_invites before update of owner_id on public.homes
 for each row execute function maintenance_private.revoke_ownerless_home_invites();
commit;
