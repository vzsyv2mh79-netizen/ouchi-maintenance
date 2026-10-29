-- Local candidate. No homes are detached and no live policy is enabled here.
-- Final reviewed retirement must detach only inside its atomic dispatcher.
-- A later member claim does not transfer purchases, files or authorship.
begin;
alter table public.homes alter column owner_id drop not null;

create table maintenance_private.ownerless_home_policy (
 id smallint primary key check(id=1), enabled boolean not null default false
);
insert into maintenance_private.ownerless_home_policy values(1,false);
create table maintenance_private.ownerless_home_generations (
 home_id uuid primary key references public.homes(id) on delete cascade,
 generation uuid not null default gen_random_uuid(),
 opened_at timestamptz not null default clock_timestamp()
);
create table maintenance_private.ownerless_home_claims (
 request_id uuid primary key,
 home_id uuid not null,
 home_instance uuid not null,
 generation uuid not null,
 user_id uuid not null,
 app_epoch_id uuid not null,
 claimed_at timestamptz not null default clock_timestamp(),
 unique(home_id,generation)
);
alter table maintenance_private.ownerless_home_policy enable row level security;
alter table maintenance_private.ownerless_home_generations enable row level security;
alter table maintenance_private.ownerless_home_claims enable row level security;
revoke all on maintenance_private.ownerless_home_policy,maintenance_private.ownerless_home_generations,maintenance_private.ownerless_home_claims from public,anon,authenticated,service_role,ouchi_closure_operator;
grant select on maintenance_private.ownerless_home_policy,maintenance_private.ownerless_home_generations to service_role;
grant select,insert on maintenance_private.ownerless_home_claims to service_role;
grant select(home_id,instance_id) on maintenance_private.closure_home_instances to service_role;

create function maintenance_private.track_ownerless_home_generation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.owner_id is null then
  if tg_op='INSERT' or old.owner_id is not null then
   insert into maintenance_private.ownerless_home_generations(home_id) values(new.id)
   on conflict(home_id) do update set generation=gen_random_uuid(),opened_at=clock_timestamp();
  end if;
 elsif tg_op='UPDATE' then
  -- Preserve the claimed generation for exact retry/status checks. A different
  -- later handoff invalidates it; a later retirement creates a new generation.
  if old.owner_id is not null and new.owner_id is distinct from old.owner_id then
   delete from maintenance_private.ownerless_home_generations where home_id=new.id;
  end if;
 end if;
 return new;
end;$$;
revoke all on function maintenance_private.track_ownerless_home_generation() from public,anon,authenticated,service_role,ouchi_closure_operator;
create trigger track_ownerless_home_generation after insert or update of owner_id on public.homes
 for each row execute function maintenance_private.track_ownerless_home_generation();

-- SQL NULL must never bypass the existing shared-home deletion protection.
create or replace function maintenance_private.guard_shared_home_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.home_members where "homeId"=old.id order by user_id for update;
 if exists(select 1 from public.home_members where "homeId"=old.id and user_id is distinct from old.owner_id)
 then raise exception using errcode='P0001',message='Family handoff required'; end if;
 return old;
end;$$;

-- Ownerless homes retain membership-based records access. There is no owner
-- who can issue/redeem new invitations until a current member claims management.
-- Existing membership insertion guard already rejects a NULL owner.
create or replace function maintenance_private.participates_in_other_home(target_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.home_members m join public.homes h on h.id=m."homeId"
 where m.user_id=target_user and h.owner_id is distinct from target_user);
$$;

-- Backend-only primitive. Shipping caller must verify exact bearer, recent
-- authentication/current AAL and pin Auth/factor/enrollment state in this SAME
-- transaction through COMMIT. User/session arguments are never client identity.
create function maintenance_private.claim_ownerless_home(
 target_request uuid,target_home uuid,expected_generation uuid,
 target_user uuid,verified_session uuid,expected_epoch uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.homes; prior maintenance_private.ownerless_home_claims; incarnation uuid; live_epoch uuid;
begin
 if target_request is null or target_home is null or expected_generation is null or target_user is null
 or verified_session is null or expected_epoch is null
 or '00000000-0000-0000-0000-000000000000'::uuid=any(array[target_request,target_home,expected_generation,target_user,verified_session,expected_epoch])
 then raise exception 'Scoped management claim required'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not exists(select 1 from maintenance_private.ownerless_home_policy where id=1 and enabled)
 or not exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 then raise exception 'Management claim unavailable'; end if;
 -- The paired-controller prototype binds routes/files to a non-null owner.
 -- Do not bypass those guards or implicitly call its old handoff stages. A
 -- separate reviewed contract upgrade must remove this refusal deliberately.
 if to_regclass('maintenance_private.household_write_routes') is not null then
  raise exception 'Shared retirement integration unavailable';
 end if;
 live_epoch:=public.current_maintenance_purchase_account(target_user,verified_session);
 if live_epoch is distinct from expected_epoch then raise exception 'Current matching app session required'; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=expected_epoch)
 or exists(select 1 from maintenance_private.account_closure_reviews where user_id=target_user and app_epoch_id=expected_epoch and state='review_required')
 then raise exception 'Account retirement pending'; end if;
 -- Home lock serializes competing claims and membership INSERT/DELETE. The
 -- selected member lock also prevents withdrawal from racing the claim.
 select * into h from public.homes where id=target_home for update;
 if not found then raise exception 'Home unavailable'; end if;
 select instance_id into incarnation from maintenance_private.closure_home_instances where home_id=target_home;
 if incarnation is null then raise exception 'Home incarnation unavailable'; end if;
 select * into prior from maintenance_private.ownerless_home_claims where request_id=target_request;
 if found then
  if row(prior.home_id,prior.home_instance,prior.generation,prior.user_id,prior.app_epoch_id)
    is distinct from row(target_home,incarnation,expected_generation,target_user,expected_epoch)
  then raise exception 'Management claim event conflict'; end if;
  -- Replaying a successful old receipt never claims a later ownerless period.
  return jsonb_build_object('kind','ownerless-home-claim/v1','requestID',prior.request_id,'homeID',prior.home_id,
   'generation',prior.generation,'epochID',prior.app_epoch_id,
   'state',case when h.owner_id=target_user and exists(select 1 from maintenance_private.ownerless_home_generations
    where home_id=target_home and generation=expected_generation) then 'claimed' else 'superseded' end);
 end if;
 if h.owner_id is not null or not exists(select 1 from maintenance_private.ownerless_home_generations
  where home_id=target_home and generation=expected_generation) then raise exception 'Management state changed'; end if;
 perform 1 from public.home_members where "homeId"=target_home and user_id=target_user for update;
 if not found then raise exception 'Existing family membership required'; end if;
 insert into maintenance_private.ownerless_home_claims(request_id,home_id,home_instance,generation,user_id,app_epoch_id)
 values(target_request,target_home,incarnation,expected_generation,target_user,expected_epoch);
 update public.homes set owner_id=target_user where id=target_home and owner_id is null;
 if not found then raise exception 'Management state changed'; end if;
 return jsonb_build_object('kind','ownerless-home-claim/v1','requestID',target_request,'homeID',target_home,
  'generation',expected_generation,'epochID',expected_epoch,'state','claimed');
end;$$;
revoke all on function maintenance_private.claim_ownerless_home(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,ouchi_closure_operator;
grant execute on function maintenance_private.claim_ownerless_home(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
commit;
