begin;
-- Service-only, dormant until explicit policy and trusted reauthentication flow
-- are verified. Does not grant purchases, reopen deletion or change shared Auth.
create table maintenance_private.enrollment_consents (
 request_id uuid primary key,
 user_id uuid not null references auth.users(id),
 session_id uuid not null,
 reauthentication_session uuid not null unique,
 epoch_id uuid not null,
 expires_at timestamptz not null
);
create index enrollment_consents_expiry on maintenance_private.enrollment_consents(expires_at);
alter table maintenance_private.enrollment_consents enable row level security;
revoke all on maintenance_private.enrollment_consents from public,anon,authenticated;
grant select,insert,delete on maintenance_private.enrollment_consents to service_role;
-- PostgreSQL requires an UPDATE privilege for row-locking during bounded prune.
grant update(request_id) on maintenance_private.enrollment_consents to service_role;
-- Status never calls the legacy lazy initializer, even during policy rollout.
create function public.read_maintenance_explicit_enrollment(target_user uuid,verified_session uuid) returns uuid
language sql stable security invoker set search_path='' as $$
 select e.epoch_id from maintenance_private.app_epochs e
 join maintenance_private.account_access a on a.user_id=e.user_id and a.enabled
 join maintenance_private.app_session_epochs s on s.user_id=e.user_id and s.epoch_id=e.epoch_id
 join auth.sessions live on live.id=s.session_id and live.user_id=e.user_id
 where e.user_id=target_user and e.enabled and s.session_id=verified_session
 and (live.not_after is null or live.not_after>statement_timestamp())
 and exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit);
$$;
create function public.enroll_maintenance_app_with_consent(target_user uuid,verified_session uuid,reauthenticated_session uuid,target_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare current_epoch uuid; prior_epoch uuid; fresh_created timestamptz; consent maintenance_private.enrollment_consents;
begin
 if target_user is null or verified_session is null or reauthenticated_session is null or target_request is null
 or target_user='00000000-0000-0000-0000-000000000000'::uuid or verified_session='00000000-0000-0000-0000-000000000000'::uuid
 or reauthenticated_session='00000000-0000-0000-0000-000000000000'::uuid or target_request='00000000-0000-0000-0000-000000000000'::uuid
 or verified_session=reauthenticated_session then raise exception 'Invalid enrollment proof'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.enrollment_policy where id=1 and require_explicit for share;
 if not found then raise exception 'Explicit enrollment not enabled'; end if;
 if not exists(select 1 from auth.sessions where id=verified_session and user_id=target_user and (not_after is null or not_after>statement_timestamp())) then raise exception 'Live session required'; end if;
 select created_at into fresh_created from auth.sessions where id=reauthenticated_session and user_id=target_user and (not_after is null or not_after>statement_timestamp());
 if fresh_created is null or fresh_created>statement_timestamp() or fresh_created<=statement_timestamp()-interval '5 minutes' then raise exception 'Fresh reauthentication required'; end if;
 -- Disabled/partially erased states never authorize reopening, even if the
 -- request is marked complete before final identity erasure is implemented.
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and state<>'complete')
 or exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and not enabled) then raise exception 'Deletion not finalized'; end if;
 select * into consent from maintenance_private.enrollment_consents where request_id=target_request or reauthentication_session=reauthenticated_session;
 if found then
  if consent.request_id<>target_request or consent.user_id<>target_user or consent.session_id<>verified_session or consent.reauthentication_session<>reauthenticated_session or consent.expires_at<=statement_timestamp()
  then raise exception 'Enrollment proof already used'; end if;
  if public.current_maintenance_purchase_account(target_user,verified_session) is distinct from consent.epoch_id then raise exception 'Enrollment changed'; end if;
  return jsonb_build_object('userID',target_user,'sessionID',verified_session,'epochID',consent.epoch_id,'requestID',target_request);
 end if;
 select epoch_id into current_epoch from maintenance_private.app_epochs where user_id=target_user and enabled;
 if current_epoch is null then
  if exists(select 1 from maintenance_private.account_access where user_id=target_user)
  or exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user) then raise exception 'Partial enrollment unavailable'; end if;
  current_epoch:=gen_random_uuid();
  insert into maintenance_private.account_access(user_id,enabled) values(target_user,true);
  insert into maintenance_private.app_epochs(user_id,epoch_id,enabled) values(target_user,current_epoch,true);
 elsif not exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled) then raise exception 'Partial enrollment unavailable'; end if;
 select epoch_id into prior_epoch from maintenance_private.app_session_epochs where session_id=verified_session;
 if prior_epoch is not null then
  if prior_epoch<>current_epoch or not exists(select 1 from maintenance_private.app_session_epochs where session_id=verified_session and user_id=target_user) then raise exception 'Enrollment session mismatch'; end if;
 else
  insert into maintenance_private.app_session_epochs(session_id,user_id,epoch_id) values(verified_session,target_user,current_epoch);
 end if;
 insert into maintenance_private.enrollment_consents(request_id,user_id,session_id,reauthentication_session,epoch_id,expires_at)
 values(target_request,target_user,verified_session,reauthenticated_session,current_epoch,fresh_created+interval '5 minutes');
 return jsonb_build_object('userID',target_user,'sessionID',verified_session,'epochID',current_epoch,'requestID',target_request);
end;$$;
-- Expiry is not erasure. This bounded cleaner still needs a scheduler/monitor
-- and account-scoped final erasure before release; no timer is enabled here.
create function public.prune_maintenance_enrollment_consents(batch_limit integer default 500) returns integer
language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
 if batch_limit is null or batch_limit<1 or batch_limit>500 then raise exception 'Invalid cleanup bound'; end if;
 with selected as (select request_id from maintenance_private.enrollment_consents where expires_at<=statement_timestamp() order by expires_at,request_id limit batch_limit for update skip locked)
 delete from maintenance_private.enrollment_consents c using selected s where c.request_id=s.request_id;
 get diagnostics removed=row_count;return removed;
end;$$;
revoke all on function public.read_maintenance_explicit_enrollment(uuid,uuid),public.enroll_maintenance_app_with_consent(uuid,uuid,uuid,uuid),public.prune_maintenance_enrollment_consents(integer) from public,anon,authenticated;
grant execute on function public.read_maintenance_explicit_enrollment(uuid,uuid),public.enroll_maintenance_app_with_consent(uuid,uuid,uuid,uuid),public.prune_maintenance_enrollment_consents(integer) to service_role;
grant select(created_at) on auth.sessions to service_role;
commit;
