-- Disposable candidate only. No migration, endpoint, worker or erasure enabled.
create table maintenance_private.account_closure_review_policy (
 id integer primary key check(id=1), enabled boolean not null default false
);
insert into maintenance_private.account_closure_review_policy values(1,false);
alter table maintenance_private.account_closure_review_policy enable row level security;
revoke all on maintenance_private.account_closure_review_policy from public,anon,authenticated,service_role;
grant select on maintenance_private.account_closure_review_policy to service_role;

-- Separate IDs and states from deletion jobs. This records an intention only.
create table maintenance_private.account_closure_reviews (
 review_request_id uuid primary key default gen_random_uuid(),
 user_id uuid not null, app_epoch_id uuid not null,
 state text not null default 'review_required' check(state='review_required'),
 requested_at timestamptz not null default clock_timestamp(),
 unique(user_id,app_epoch_id)
);
alter table maintenance_private.account_closure_reviews enable row level security;
revoke all on maintenance_private.account_closure_reviews from public,anon,authenticated,service_role;
grant select,insert on maintenance_private.account_closure_reviews to service_role;

create function public.request_maintenance_closure_review(target_user uuid,verified_session uuid,expected_epoch uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior maintenance_private.account_closure_reviews; current_epoch uuid;
begin
 if target_user is null or verified_session is null or expected_epoch is null
 or target_user='00000000-0000-0000-0000-000000000000'::uuid
 or verified_session='00000000-0000-0000-0000-000000000000'::uuid
 or expected_epoch='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Invalid review identity'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 current_epoch:=public.current_maintenance_purchase_account(target_user,verified_session);
 if current_epoch is null or current_epoch<>expected_epoch then raise exception 'Current app session required'; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=expected_epoch) then raise exception 'Deletion already requested; read status'; end if;
 -- A lost intake response can recover the original fact even after disabling
 -- new intake. Its timestamp and identity are never silently renewed.
 select * into prior from maintenance_private.account_closure_reviews where user_id=target_user and app_epoch_id=expected_epoch;
 if not found then
  if not exists(select 1 from maintenance_private.account_closure_review_policy where id=1 and enabled) then raise exception 'Review intake unavailable'; end if;
  -- Only the currently refused shared-owner case belongs to this candidate.
  -- A normal unshared deletion continues through the existing job pathway.
  if maintenance_private.owned_homes_have_no_other_members(target_user) then raise exception 'Shared review not required'; end if;
  insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id) values(target_user,expected_epoch) returning * into prior;
 end if;
 return jsonb_build_object('kind','app-closure-review/v1','state',prior.state,'reviewRequestID',prior.review_request_id,'epochID',prior.app_epoch_id);
end;$$;
revoke all on function public.request_maintenance_closure_review(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_maintenance_closure_review(uuid,uuid,uuid) to service_role;

create function public.read_maintenance_closure_review(target_user uuid,verified_session uuid,expected_epoch uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior maintenance_private.account_closure_reviews; current_epoch uuid;
begin
 if target_user is null or verified_session is null or expected_epoch is null then raise exception 'Invalid review identity'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 current_epoch:=public.current_maintenance_purchase_account(target_user,verified_session);
 if current_epoch is null or current_epoch<>expected_epoch then raise exception 'Current app session required'; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=expected_epoch) then raise exception 'Deletion already requested; read status'; end if;
 select * into prior from maintenance_private.account_closure_reviews where user_id=target_user and app_epoch_id=expected_epoch;
 if not found then return null; end if;
 return jsonb_build_object('kind','app-closure-review/v1','state',prior.state,'reviewRequestID',prior.review_request_id,'epochID',prior.app_epoch_id);
end;$$;
revoke all on function public.read_maintenance_closure_review(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_closure_review(uuid,uuid,uuid) to service_role;
