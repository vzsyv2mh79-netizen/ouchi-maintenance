-- Dormant operator assessment, not an erasure authorization or production rollout.
-- No operator login, membership, principal or live policy is provisioned.
begin;
create role ouchi_closure_operator nologin noinherit;
grant usage on schema maintenance_private to ouchi_closure_operator;
create table maintenance_private.closure_operator_principals (
 principal name primary key,
 enabled boolean not null default false
);
alter table maintenance_private.closure_operator_principals enable row level security;
revoke all on maintenance_private.closure_operator_principals from public,anon,authenticated,service_role,ouchi_closure_operator;

create table maintenance_private.closure_operator_assessments (
 event_id uuid primary key,
 assessment_sequence bigint generated always as identity unique,
 review_request_id uuid not null references maintenance_private.account_closure_reviews(review_request_id) on delete restrict,
 user_id uuid not null,
 app_epoch_id uuid not null,
 operator_principal name not null,
 outcome text not null check(outcome in ('needs_review','assessment_recorded','revoked')),
 -- Fingerprint of the separately protected evidence/plan; never raw family content.
 evidence_digest text not null check(evidence_digest ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz not null default clock_timestamp()
);
revoke all on sequence maintenance_private.closure_operator_assessments_assessment_sequence_seq from public,anon,authenticated,service_role,ouchi_closure_operator;
create index closure_operator_assessments_review on maintenance_private.closure_operator_assessments(review_request_id,assessment_sequence desc);
alter table maintenance_private.closure_operator_assessments enable row level security;
revoke all on maintenance_private.closure_operator_assessments from public,anon,authenticated,service_role,ouchi_closure_operator;

create function maintenance_private.record_closure_operator_assessment(
 target_event uuid,target_review uuid,target_user uuid,target_epoch uuid,
 target_outcome text,target_evidence_digest text
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.closure_operator_assessments; review maintenance_private.account_closure_reviews;
begin
 -- session_user comes from the authenticated database connection, not SET ROLE,
 -- JWT user_metadata, request JSON or a caller-controlled session setting.
 if not exists(select 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled)
 then raise exception 'Authorized operator connection required'; end if;
 if target_event is null or target_event='00000000-0000-0000-0000-000000000000'::uuid
 or target_review is null or target_user is null or target_epoch is null
 or target_outcome is null or target_outcome not in ('needs_review','assessment_recorded','revoked')
 or target_evidence_digest is null or target_evidence_digest !~ '^[0-9a-f]{64}$'
 then raise exception 'Scoped assessment required'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 select * into review from maintenance_private.account_closure_reviews where review_request_id=target_review for update;
 if not found or review.user_id<>target_user or review.app_epoch_id<>target_epoch or review.state<>'review_required'
 then raise exception 'Current matching review required'; end if;
 if not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and enabled)
 then raise exception 'Current matching enrollment required'; end if;
 -- A fresh event is not accepted after the request has entered the independent
 -- erasure path. Operator assessment never creates or approves that job.
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=target_epoch)
 then raise exception 'Deletion status must be reconciled'; end if;
 select * into prior from maintenance_private.closure_operator_assessments where event_id=target_event;
 if found then
  if prior.review_request_id<>target_review or prior.user_id<>target_user or prior.app_epoch_id<>target_epoch
   or prior.operator_principal<>session_user or prior.outcome<>target_outcome or prior.evidence_digest<>target_evidence_digest
  then raise exception 'Assessment event conflict'; end if;
  return prior.event_id;
 end if;
 insert into maintenance_private.closure_operator_assessments(event_id,review_request_id,user_id,app_epoch_id,operator_principal,outcome,evidence_digest)
 values(target_event,target_review,target_user,target_epoch,session_user,target_outcome,target_evidence_digest);
 return target_event;
end;$$;
revoke all on function maintenance_private.record_closure_operator_assessment(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.record_closure_operator_assessment(uuid,uuid,uuid,uuid,text,text) to ouchi_closure_operator;

-- Minimal queue: no email, product names, free text, credentials or member data.
-- Stable keyset pagination; a cursor is a review UUID from the prior page.
create function maintenance_private.closure_operator_queue(after_review uuid default null)
returns table(review_request_id uuid,user_id uuid,app_epoch_id uuid,requested_at timestamptz,latest_event_id uuid,latest_outcome text,latest_recorded_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled)
 then raise exception 'Authorized operator connection required'; end if;
 return query select r.review_request_id,r.user_id,r.app_epoch_id,r.requested_at,a.event_id,a.outcome,a.recorded_at
 from maintenance_private.account_closure_reviews r
 left join lateral (select e.event_id,e.outcome,e.recorded_at from maintenance_private.closure_operator_assessments e
 where e.review_request_id=r.review_request_id order by e.assessment_sequence desc limit 1) a on true
 where r.state='review_required'
 and exists(select 1 from maintenance_private.app_epochs e where e.user_id=r.user_id and e.epoch_id=r.app_epoch_id and e.enabled)
 and (after_review is null or r.review_request_id>after_review)
 and not exists(select 1 from maintenance_private.account_deletion_requests d where d.user_id=r.user_id and d.app_epoch_id=r.app_epoch_id)
 order by r.review_request_id limit 50;
end;$$;
revoke all on function maintenance_private.closure_operator_queue(uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_operator_queue(uuid) to ouchi_closure_operator;
-- The existing worker checks this lease gate before each stage, including
-- object/device cleanup. Assessment alone cannot bypass an outstanding review.
-- A future reviewed dispatcher must atomically reconcile the request and its
-- erasure plan; this candidate deliberately does not implement that transition.
create or replace function public.maintenance_deletion_lease_is_current(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.account_deletion_requests r
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch and r.lease_token=target_lease and r.state='running' and r.lease_until>now()
 and not exists(select 1 from maintenance_private.app_epochs a where a.user_id=r.user_id and a.epoch_id<>r.app_epoch_id)
 and not exists(select 1 from maintenance_private.account_closure_reviews c where c.user_id=r.user_id and c.app_epoch_id=r.app_epoch_id and c.state='review_required'));
$$;
revoke all on function public.maintenance_deletion_lease_is_current(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.maintenance_deletion_lease_is_current(uuid,uuid,uuid,uuid) to service_role;
commit;
