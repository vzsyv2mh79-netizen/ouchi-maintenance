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
 user_id uuid not null, app_epoch_id uuid not null, submission_id uuid not null,
 state text not null default 'review_required' check(state in ('review_required','cancelled')),
 requested_at timestamptz not null default clock_timestamp(),
 cancelled_at timestamptz,
 check ((state='cancelled')=(cancelled_at is not null)),
 unique(user_id,app_epoch_id,submission_id)
);
create unique index account_closure_one_pending on maintenance_private.account_closure_reviews(user_id,app_epoch_id) where state='review_required';
alter table maintenance_private.account_closure_reviews enable row level security;
revoke all on maintenance_private.account_closure_reviews from public,anon,authenticated,service_role;
grant select,insert,update(state,cancelled_at) on maintenance_private.account_closure_reviews to service_role;

create function public.request_maintenance_closure_review(target_user uuid,verified_session uuid,expected_epoch uuid,expected_submission uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior maintenance_private.account_closure_reviews; current_epoch uuid;
begin
 if target_user is null or verified_session is null or expected_epoch is null or expected_submission is null or expected_submission='00000000-0000-0000-0000-000000000000'::uuid
 or target_user='00000000-0000-0000-0000-000000000000'::uuid
 or verified_session='00000000-0000-0000-0000-000000000000'::uuid
 or expected_epoch='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Invalid review identity'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 current_epoch:=public.current_maintenance_purchase_account(target_user,verified_session);
 if current_epoch is null or current_epoch<>expected_epoch then raise exception 'Current app session required'; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=expected_epoch) then raise exception 'Deletion already requested; read status'; end if;
 -- A lost intake response can recover the original fact even after disabling
 -- new intake. Its timestamp and identity are never silently renewed.
 select * into prior from maintenance_private.account_closure_reviews where user_id=target_user and app_epoch_id=expected_epoch and submission_id=expected_submission;
 if not found then
  if not exists(select 1 from maintenance_private.account_closure_review_policy where id=1 and enabled) then raise exception 'Review intake unavailable'; end if;
  -- Only the currently refused shared-owner case belongs to this candidate.
  -- A normal unshared deletion continues through the existing job pathway.
  if maintenance_private.owned_homes_have_no_other_members(target_user) then raise exception 'Shared review not required'; end if;
  insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values(target_user,expected_epoch,expected_submission) returning * into prior;
 end if;
 return jsonb_build_object('kind','app-closure-review/v2','state',prior.state,'reviewRequestID',prior.review_request_id,'epochID',prior.app_epoch_id,'submissionID',prior.submission_id);
end;$$;
revoke all on function public.request_maintenance_closure_review(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_maintenance_closure_review(uuid,uuid,uuid,uuid) to service_role;

create function public.read_maintenance_closure_review(target_user uuid,verified_session uuid,expected_epoch uuid,expected_submission uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior maintenance_private.account_closure_reviews; current_epoch uuid;
begin
 if target_user is null or verified_session is null or expected_epoch is null or expected_submission is null or expected_submission='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Invalid review identity'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 current_epoch:=public.current_maintenance_purchase_account(target_user,verified_session);
 if current_epoch is null or current_epoch<>expected_epoch then raise exception 'Current app session required'; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=expected_epoch) then raise exception 'Deletion already requested; read status'; end if;
 select * into prior from maintenance_private.account_closure_reviews where user_id=target_user and app_epoch_id=expected_epoch and submission_id=expected_submission;
 if not found then return null; end if;
 return jsonb_build_object('kind','app-closure-review/v2','state',prior.state,'reviewRequestID',prior.review_request_id,'epochID',prior.app_epoch_id,'submissionID',prior.submission_id);
end;$$;
revoke all on function public.read_maintenance_closure_review(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_closure_review(uuid,uuid,uuid,uuid) to service_role;

-- Only a verified current session may move a pending row to cancelled.
-- Column grants plus this invoker trigger preserve immutable intake evidence.
create function maintenance_private.guard_closure_review_cancel() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.review_request_id<>old.review_request_id or new.user_id<>old.user_id
 or new.app_epoch_id<>old.app_epoch_id or new.submission_id<>old.submission_id
 or new.requested_at<>old.requested_at or old.state<>'review_required'
 or new.state<>'cancelled' or new.cancelled_at is null
 or public.current_maintenance_purchase_account(old.user_id,
 nullif(current_setting('maintenance.closure_cancel_session',true),'')::uuid)
 is distinct from old.app_epoch_id then raise exception 'Verified cancellation required'; end if;
 return new;
end;$$;
revoke all on function maintenance_private.guard_closure_review_cancel() from public,anon,authenticated;
create trigger closure_review_cancel_guard before update on maintenance_private.account_closure_reviews
for each row execute function maintenance_private.guard_closure_review_cancel();

create function public.cancel_maintenance_closure_review(target_user uuid,verified_session uuid,expected_epoch uuid,expected_submission uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior jsonb; saved text;
begin
 -- The read uses the same participant lock and rejects an existing deletion job.
 prior:=public.read_maintenance_closure_review(target_user,verified_session,expected_epoch,expected_submission);
 if prior is null or prior->>'state'='cancelled' then return prior; end if;
 saved:=current_setting('maintenance.closure_cancel_session',true);
 perform set_config('maintenance.closure_cancel_session',verified_session::text,true);
 update maintenance_private.account_closure_reviews set state='cancelled',cancelled_at=clock_timestamp()
 where user_id=target_user and app_epoch_id=expected_epoch and submission_id=expected_submission and state='review_required';
 perform set_config('maintenance.closure_cancel_session',coalesce(saved,''),true);
 return public.read_maintenance_closure_review(target_user,verified_session,expected_epoch,expected_submission);
end;$$;
revoke all on function public.cancel_maintenance_closure_review(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_maintenance_closure_review(uuid,uuid,uuid,uuid) to service_role;
