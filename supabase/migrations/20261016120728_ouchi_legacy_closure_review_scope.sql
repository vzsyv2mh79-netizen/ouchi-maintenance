-- Dormant candidate. A confirmed legacy investigation context never grants access to the requester, proves authorship, or completes deletion.
begin;
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
  -- A live app account may request review even after leaving a shared home.
  -- Intake reveals no former family records and grants no household access.
  insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values(target_user,expected_epoch,expected_submission) returning * into prior;
 end if;
 return jsonb_build_object('kind','app-closure-review/v2','state',prior.state,'reviewRequestID',prior.review_request_id,'epochID',prior.app_epoch_id,'submissionID',prior.submission_id);
end;$$;
revoke all on function public.request_maintenance_closure_review(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_maintenance_closure_review(uuid,uuid,uuid,uuid) to service_role;
-- Bind confirmations to a server-created home incarnation, not a reusable UUID.
-- This metadata says nothing about authorship or personal-data subjects.
lock table public.homes in share row exclusive mode;
create table maintenance_private.closure_home_instances (
 home_id uuid primary key references public.homes(id) on delete cascade,
 instance_id uuid not null unique default gen_random_uuid()
);
alter table maintenance_private.closure_home_instances enable row level security;
revoke all on maintenance_private.closure_home_instances from public,anon,authenticated,service_role,ouchi_closure_operator;
insert into maintenance_private.closure_home_instances(home_id) select id from public.homes;
create function maintenance_private.capture_closure_home_instance() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_schema<>'public' or tg_table_name<>'homes' or tg_op<>'INSERT' then raise exception 'Invalid home source'; end if;
 insert into maintenance_private.closure_home_instances(home_id) values(new.id);
 return null;
end;$$;
revoke all on function maintenance_private.capture_closure_home_instance() from public,anon,authenticated,service_role,ouchi_closure_operator;
create trigger capture_closure_home_instance after insert on public.homes for each row execute function maintenance_private.capture_closure_home_instance();

-- Operator-confirmed investigation scope, NOT authorship or erasure clearance.
create table maintenance_private.closure_legacy_home_events (
 event_id uuid primary key,
 event_sequence bigint generated always as identity unique,
 review_request_id uuid not null references maintenance_private.account_closure_reviews(review_request_id) on delete restrict,
 user_id uuid not null, app_epoch_id uuid not null, home_id uuid not null, home_instance_id uuid not null,
 operator_principal name not null,
 action text not null check(action in ('confirmed','revoked')),
 evidence_digest text not null check(evidence_digest ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz not null default clock_timestamp()
);
alter table maintenance_private.closure_legacy_home_events enable row level security;
revoke all on maintenance_private.closure_legacy_home_events from public,anon,authenticated,service_role,ouchi_closure_operator;
revoke all on sequence maintenance_private.closure_legacy_home_events_event_sequence_seq from public,anon,authenticated,service_role,ouchi_closure_operator;
create index closure_legacy_home_review on maintenance_private.closure_legacy_home_events(review_request_id,home_id,event_sequence desc);

create function maintenance_private.record_closure_legacy_home_context(
 target_event uuid,target_review uuid,target_user uuid,target_epoch uuid,target_home uuid,target_action text,target_evidence_digest text
) returns uuid language plpgsql security definer set search_path='' as $$
declare review maintenance_private.account_closure_reviews; prior maintenance_private.closure_legacy_home_events; current_home_instance uuid;
begin
 if not exists(select 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled)
 then raise exception 'Authorized operator connection required'; end if;
 if target_event is null or target_event='00000000-0000-0000-0000-000000000000'::uuid
 or target_review is null or target_user is null or target_epoch is null or target_home is null
 or target_action is null or target_action not in ('confirmed','revoked')
 or target_evidence_digest is null or target_evidence_digest !~ '^[0-9a-f]{64}$'
 then raise exception 'Scoped legacy context required'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 select * into review from maintenance_private.account_closure_reviews where review_request_id=target_review for update;
 if not found or review.user_id<>target_user or review.app_epoch_id<>target_epoch or review.state<>'review_required'
 then raise exception 'Current matching review required'; end if;
 perform 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and enabled for share;
 if not found then raise exception 'Current matching enrollment required'; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=target_epoch)
 then raise exception 'Deletion status must be reconciled'; end if;
 select * into prior from maintenance_private.closure_legacy_home_events where event_id=target_event;
 if found then
  if prior.review_request_id<>target_review or prior.user_id<>target_user or prior.app_epoch_id<>target_epoch
   or prior.home_id<>target_home or prior.operator_principal<>session_user
   or prior.action<>target_action or prior.evidence_digest<>target_evidence_digest
  then raise exception 'Legacy context event conflict'; end if;
  -- Old confirmation retries must never revive a subsequently revoked context.
  return target_event;
 end if;
 perform 1 from public.homes where id=target_home for key share;
 select i.instance_id into current_home_instance from maintenance_private.closure_home_instances i where i.home_id=target_home;
 if current_home_instance is null and target_action='revoked' then
  select e.home_instance_id into current_home_instance from maintenance_private.closure_legacy_home_events e
  where e.review_request_id=target_review and e.home_id=target_home order by e.event_sequence desc limit 1;
 end if;
 if current_home_instance is null then raise exception 'Review home unavailable'; end if;
 insert into maintenance_private.closure_legacy_home_events(event_id,review_request_id,user_id,app_epoch_id,home_id,home_instance_id,operator_principal,action,evidence_digest)
 values(target_event,target_review,target_user,target_epoch,target_home,current_home_instance,session_user,target_action,target_evidence_digest);
 return target_event;
end;$$;
revoke all on function maintenance_private.record_closure_legacy_home_context(uuid,uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.record_closure_legacy_home_context(uuid,uuid,uuid,uuid,uuid,text,text) to ouchi_closure_operator;

-- Called only by the scoped definer reader, never a browser-supplied flag.
create function maintenance_private.closure_legacy_home_context_is_current(target_review uuid,target_user uuid,target_epoch uuid,target_home uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select e.action='confirmed' and exists(select 1 from maintenance_private.closure_home_instances i where i.home_id=e.home_id and i.instance_id=e.home_instance_id) from maintenance_private.closure_legacy_home_events e
 where e.review_request_id=target_review and e.user_id=target_user and e.app_epoch_id=target_epoch and e.home_id=target_home
 order by e.event_sequence desc limit 1),false);
$$;
revoke all on function maintenance_private.closure_legacy_home_context_is_current(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;

create or replace function maintenance_private.read_closure_redaction_field(
 target_review uuid,target_user uuid,target_epoch uuid,target_relation text,target_record uuid,target_field text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare review maintenance_private.account_closure_reviews; home_id uuid; product_id uuid; task_id uuid;
 locked_id uuid; home_owner uuid; payload jsonb; digest text;
begin
 if not exists(select 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled)
 then raise exception 'Authorized operator connection required'; end if;
 if target_review is null or target_user is null or target_epoch is null or target_record is null
 or target_relation is null or target_field is null
 or not ((target_relation='homes' and target_field='name')
  or(target_relation='products' and target_field in ('name','maker','modelNumber','memo'))
  or(target_relation='maintenance_tasks' and target_field in ('name','sourceUrl','sourceNote','sourceFrequency'))
  or(target_relation='maintenance_history' and target_field='note'))
 then raise exception 'Allowed scoped text field required'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 select * into review from maintenance_private.account_closure_reviews where review_request_id=target_review for update;
 if not found or review.user_id<>target_user or review.app_epoch_id<>target_epoch or review.state<>'review_required'
 then raise exception 'Current matching review required'; end if;
 perform 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and enabled for share;
 if not found then raise exception 'Current matching enrollment required'; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=target_epoch)
 then raise exception 'Deletion status must be reconciled'; end if;
 if target_relation='homes' then home_id:=target_record;
 elsif target_relation='products' then
  select p."homeId",p.id into home_id,product_id from public.products p where p.id=target_record;
 elsif target_relation='maintenance_tasks' then
  select p."homeId",p.id,t.id into home_id,product_id,task_id from public.maintenance_tasks t join public.products p on p.id=t."productId" where t.id=target_record;
 else
  select p."homeId",p.id,h."taskId" into home_id,product_id,task_id from public.maintenance_history h join public.products p on p.id=h."productId" where h.id=target_record;
 end if;
 select h.owner_id into home_owner from public.homes h where h.id=home_id for update;
 if not found then raise exception 'Scoped record unavailable'; end if;
 if home_owner<>target_user then
  perform 1 from public.home_members m where m."homeId"=home_id and m.user_id=target_user for share;
  if not found and not maintenance_private.closure_legacy_home_context_is_current(target_review,target_user,target_epoch,home_id)
  then raise exception 'Scoped record unavailable'; end if;
 end if;
 if product_id is not null then
  select p."homeId" into locked_id from public.products p where p.id=product_id for update;
  if not found or locked_id<>home_id then raise exception 'Scoped record changed'; end if;
 end if;
 if task_id is not null then
  select t."productId" into locked_id from public.maintenance_tasks t where t.id=task_id for update;
  if not found or locked_id<>product_id then raise exception 'Scoped record changed'; end if;
 end if;
 execute format('select to_jsonb(t) from public.%I t where t.id=$1 for update',target_relation) into payload using target_record;
 if payload is null then raise exception 'Scoped record unavailable'; end if;
 if target_relation='maintenance_history' and ((payload->>'productId')::uuid<>product_id or (payload->>'taskId')::uuid<>task_id)
 then raise exception 'Scoped record changed'; end if;
 digest:=encode(sha256(convert_to((payload->target_field)::text,'UTF8')),'hex');
 return jsonb_build_object('value',payload->target_field,'digest',digest);
end;$$;
revoke all on function maintenance_private.read_closure_redaction_field(uuid,uuid,uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.read_closure_redaction_field(uuid,uuid,uuid,text,uuid,text) to ouchi_closure_operator;

commit;
