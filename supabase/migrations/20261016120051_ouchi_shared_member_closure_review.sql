-- Dormant additive candidate. Current shared members may request operator review.
-- Former memberships and legacy subject discovery are NOT proved by this rule.
begin;
create function maintenance_private.participates_in_other_home(target_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.home_members m join public.homes h on h.id=m."homeId"
 where m.user_id=target_user and h.owner_id<>target_user);
$$;
revoke all on function maintenance_private.participates_in_other_home(uuid) from public,anon,authenticated;
grant execute on function maintenance_private.participates_in_other_home(uuid) to service_role;
create or replace function public.request_maintenance_closure_review(target_user uuid,verified_session uuid,expected_epoch uuid,expected_submission uuid)
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
  -- Current members can also leave personal information in shared records.
  -- Membership scopes review intake, never authorship or blanket erasure.
  if maintenance_private.owned_homes_have_no_other_members(target_user)
   and not maintenance_private.participates_in_other_home(target_user)
  then raise exception 'Shared review not required'; end if;
  insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values(target_user,expected_epoch,expected_submission) returning * into prior;
 end if;
 return jsonb_build_object('kind','app-closure-review/v2','state',prior.state,'reviewRequestID',prior.review_request_id,'epochID',prior.app_epoch_id,'submissionID',prior.submission_id);
end;$$;
revoke all on function public.request_maintenance_closure_review(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_maintenance_closure_review(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.request_maintenance_account_deletion(target_user uuid,verified_session uuid,target_epoch uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare current_epoch uuid; request_id uuid;
begin
 if target_user is null or verified_session is null or target_epoch is null then raise exception 'Invalid deletion identity'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 current_epoch:=public.current_maintenance_purchase_account(target_user,verified_session);
 if current_epoch is null or current_epoch<>target_epoch then raise exception 'Live app session required'; end if;
 if exists(select 1 from maintenance_private.account_closure_reviews c where c.user_id=target_user and c.app_epoch_id=target_epoch and c.state='review_required')
 then raise exception 'Family review required'; end if;
 if not maintenance_private.owned_homes_have_no_other_members(target_user) then raise exception 'Family handoff required'; end if;
 if maintenance_private.participates_in_other_home(target_user) then raise exception 'Family review required'; end if;
 insert into maintenance_private.account_deletion_requests(user_id,app_epoch_id)
 values(target_user,target_epoch) on conflict(user_id,app_epoch_id) do nothing;
 select id into request_id from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=target_epoch;
 return request_id;
end;$$;
revoke all on function public.request_maintenance_account_deletion(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_maintenance_account_deletion(uuid,uuid,uuid) to service_role;
commit;
