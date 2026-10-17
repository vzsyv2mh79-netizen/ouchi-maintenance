-- Dormant copy-only preparation/verification. No activation, source removal,
-- scheduler or production Storage call. Unknown copies retain capacity/scope.
begin;
create table maintenance_private.household_copy_intents(
 intent_id uuid primary key,review_request_id uuid not null references maintenance_private.account_closure_reviews(review_request_id) on delete restrict,
 user_id uuid not null,app_epoch_id uuid not null,operator_principal name not null,
 decision_id uuid not null references maintenance_private.closure_file_decisions(decision_id) on delete restrict,
 inspection_id uuid not null references maintenance_private.closure_file_inspections(inspection_id) on delete restrict,
 source_attachment_id uuid not null unique,source_uploader_id uuid not null,source_captured_owner_id uuid not null,
 household_attachment_id uuid not null unique references maintenance_private.household_attachments(id) on delete restrict,
 capacity_claim_id uuid not null unique references maintenance_private.attachment_capacity_claims(claim_id) on delete restrict,
 metadata_digest text not null,source_descriptor jsonb not null,
 state text not null default 'reserved' check(state in('reserved','copy_verified','completed')),
 created_at timestamptz not null default clock_timestamp(),copied_at timestamptz,
 check((state='reserved')=(copied_at is null))
);
alter table maintenance_private.household_copy_intents enable row level security;
revoke all on maintenance_private.household_copy_intents from public,anon,authenticated,service_role,ouchi_closure_operator;
grant select on maintenance_private.household_copy_intents to service_role;

create function maintenance_private.require_household_copy_source(target_decision uuid,target_review uuid,target_user uuid,target_epoch uuid,target_file uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d maintenance_private.closure_file_decisions; inspected maintenance_private.closure_file_inspections; f maintenance_private.product_attachments; current_decision jsonb; descriptor jsonb; participant uuid; initial_uploader uuid; initial_owner uuid;
begin
 if to_regclass('maintenance_private.household_write_routes') is not null then raise exception 'Shared retirement contract upgrade required';end if;
 select user_id,captured_owner_id into initial_uploader,initial_owner from maintenance_private.product_attachments where id=target_file;
 if initial_uploader is null or initial_owner is null then raise exception 'Current copy source required';end if;
 -- Capacity preparation takes its global budget lock before these sorted actor
 -- locks. Execution never requests that global lock while holding actors.
 for participant in select distinct p from unnest(array[target_user,initial_uploader,initial_owner]) p order by p loop perform pg_advisory_xact_lock(hashtext(participant::text));end loop;
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 select * into d from maintenance_private.closure_file_decisions where decision_id=target_decision and review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and attachment_id=target_file and operator_principal=session_user;
 if not found or d.action<>'retain_family_copy' then raise exception 'Own retention decision required';end if;
 select * into inspected from maintenance_private.closure_file_inspections where inspection_id=d.inspection_id and operator_principal=session_user;
 if not found then raise exception 'Own inspected source required';end if;
 current_decision:=maintenance_private.read_closure_file_decision(target_review,target_user,target_epoch,target_file,inspected.metadata_digest);
 if current_decision->>'decisionID' is distinct from target_decision::text or current_decision->>'action'<>'retain_family_copy' or not (current_decision->>'current')::boolean then raise exception 'Latest current retention decision required';end if;
 descriptor:=maintenance_private.read_closure_review_file(target_review,target_user,target_epoch,target_file,inspected.metadata_digest)->'file';
 select * into f from maintenance_private.product_attachments where id=target_file for update;
 if f.user_id is distinct from initial_uploader or f.captured_owner_id is distinct from initial_owner
 or descriptor->>'homeID' is null or descriptor->>'homeInstanceID' is null
 or not maintenance_private.attachment_write_is_quiet(target_file)
 or not exists(select 1 from maintenance_private.attachment_write_attempts w where w.attachment_id=f.id and w.uploader_id=f.user_id and w.owner_id=f.captured_owner_id and w.app_epoch_id=f.app_epoch_id and w.state='settled')
 then raise exception 'Settled matching copy source required';end if;
 for participant in select distinct p from unnest(array[target_user,f.user_id,f.captured_owner_id]) p order by p loop
  perform 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id where e.user_id=participant and e.enabled and a.enabled for share of e,a;
  if not found or exists(select 1 from maintenance_private.account_deletion_requests where user_id=participant and state<>'complete') then raise exception 'Copy participant retirement must be reconciled';end if;
 end loop;
 return jsonb_build_object('file',descriptor,'metadataDigest',inspected.metadata_digest,'inspectionID',inspected.inspection_id,'capturedOwnerID',f.captured_owner_id);
end;$$;
revoke all on function maintenance_private.require_household_copy_source(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;

create function maintenance_private.lock_household_copy_intent(target_intent uuid,target_review uuid,target_user uuid,target_epoch uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.household_copy_intents; source jsonb; destination maintenance_private.household_attachments;
begin
 select * into prior from maintenance_private.household_copy_intents where intent_id=target_intent and review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and operator_principal=session_user;
 if not found then raise exception 'Own matching copy intent required';end if;
 source:=maintenance_private.require_household_copy_source(prior.decision_id,target_review,target_user,target_epoch,prior.source_attachment_id);
 perform 1 from maintenance_private.household_copy_intents where intent_id=target_intent for update;
 if source->'file' is distinct from prior.source_descriptor or source->>'metadataDigest' is distinct from prior.metadata_digest then raise exception 'Copy source scope changed';end if;
 select * into destination from maintenance_private.household_attachments where id=prior.household_attachment_id for update;
 if not found or destination.state<>'staged' or destination.removal_pending
 or destination.home_id is distinct from (prior.source_descriptor->>'homeID')::uuid or destination.home_instance_id is distinct from (prior.source_descriptor->>'homeInstanceID')::uuid
 or destination.mime is distinct from prior.source_descriptor->>'mime' or destination.product_id is distinct from (prior.source_descriptor->>'productID')::uuid or destination.size_bytes is distinct from (prior.source_descriptor->>'sizeBytes')::bigint or destination.sha256 is distinct from prior.source_descriptor->>'sha256'
 then raise exception 'Staged copy destination required';end if;
 perform 1 from maintenance_private.attachment_app_budget_policy where id=1 and enabled and writer_coverage_verified for share;
 if not found or not exists(select 1 from maintenance_private.attachment_capacity_claims where claim_id=prior.capacity_claim_id and object_path=destination.object_path and size_bytes=destination.size_bytes and purpose='household-copy') then raise exception 'Held copy capacity required';end if;
 return jsonb_build_object('kind','household-copy/v1','intentID',prior.intent_id,'reviewRequestID',prior.review_request_id,'userID',prior.user_id,'epochID',prior.app_epoch_id,'decisionID',prior.decision_id,'inspectionID',prior.inspection_id,'metadataDigest',prior.metadata_digest,'source',prior.source_descriptor,
 'destination',jsonb_build_object('id',destination.id,'homeID',destination.home_id,'homeInstanceID',destination.home_instance_id,'productID',destination.product_id,'size',destination.size_bytes,'mime',destination.mime,'sha256',destination.sha256,'objectPath',destination.object_path),
 'capacityClaimID',prior.capacity_claim_id,'state',prior.state);
end;$$;
revoke all on function maintenance_private.lock_household_copy_intent(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.lock_household_copy_intent(uuid,uuid,uuid,uuid) to ouchi_closure_operator;

create function maintenance_private.prepare_household_copy(target_intent uuid,target_decision uuid,target_review uuid,target_user uuid,target_epoch uuid,target_file uuid,target_destination uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source jsonb; f jsonb; prior maintenance_private.household_copy_intents; destination_path text;
begin
 if target_intent is null or target_destination is null or '00000000-0000-0000-0000-000000000000'::uuid=any(array[target_intent,target_destination]) then raise exception 'Exact copy IDs required';end if;
 perform maintenance_private.lock_attachment_app_budget();
 source:=maintenance_private.require_household_copy_source(target_decision,target_review,target_user,target_epoch,target_file);f:=source->'file';
 select * into prior from maintenance_private.household_copy_intents where intent_id=target_intent;
 if found then
  if row(prior.decision_id,prior.review_request_id,prior.user_id,prior.app_epoch_id,prior.source_attachment_id,prior.household_attachment_id,prior.operator_principal)
  is distinct from row(target_decision,target_review,target_user,target_epoch,target_file,target_destination,session_user) then raise exception 'Copy intent conflict';end if;
 else
  if exists(select 1 from maintenance_private.household_copy_intents where source_attachment_id=target_file) then raise exception 'Existing source copy must be reconciled';end if;
  if not exists(select 1 from maintenance_private.attachment_capacity_claims where object_path=f->>'objectPath' and size_bytes=(f->>'sizeBytes')::bigint and purpose in('upload','transfer-copy')) then raise exception 'Original physical capacity must be accounted';end if;
  destination_path:='households/'||(f->>'homeInstanceID')||'/'||target_destination::text||'.'||case f->>'mime' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'pdf' end;
  perform maintenance_private.reserve_attachment_capacity(target_intent,destination_path,(f->>'sizeBytes')::bigint,'household-copy');
  insert into maintenance_private.household_attachments(id,home_id,home_instance_id,product_id,size_bytes,mime,sha256)
  values(target_destination,(f->>'homeID')::uuid,(f->>'homeInstanceID')::uuid,(f->>'productID')::uuid,(f->>'sizeBytes')::bigint,f->>'mime',f->>'sha256');
  insert into maintenance_private.household_copy_intents(intent_id,review_request_id,user_id,app_epoch_id,operator_principal,decision_id,inspection_id,source_attachment_id,source_uploader_id,source_captured_owner_id,household_attachment_id,capacity_claim_id,metadata_digest,source_descriptor)
  values(target_intent,target_review,target_user,target_epoch,session_user,target_decision,(source->>'inspectionID')::uuid,target_file,(f->>'uploaderID')::uuid,(source->>'capturedOwnerID')::uuid,target_destination,target_intent,source->>'metadataDigest',f);
 end if;
 return maintenance_private.lock_household_copy_intent(target_intent,target_review,target_user,target_epoch);
end;$$;
revoke all on function maintenance_private.prepare_household_copy(uuid,uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.prepare_household_copy(uuid,uuid,uuid,uuid,uuid,uuid,uuid) to ouchi_closure_operator;

-- Receipt facts remain readable after review cancellation/policy withdrawal.
-- They never authorize new bytes, activation, source erasure or account closure.
create function maintenance_private.read_household_copy_status(target_intent uuid,target_review uuid,target_user uuid,target_epoch uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.household_copy_intents;
begin
 perform 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized operator connection required';end if;
 select * into prior from maintenance_private.household_copy_intents where intent_id=target_intent and review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and operator_principal=session_user;
 if not found then raise exception 'Own matching copy intent required';end if;
 return jsonb_build_object('kind','household-copy-status/v1','intentID',prior.intent_id,'reviewRequestID',prior.review_request_id,'userID',prior.user_id,'epochID',prior.app_epoch_id,'destinationID',prior.household_attachment_id,'capacityClaimID',prior.capacity_claim_id,'state',prior.state,'activationConfirmed',false,'sourceEraseConfirmed',false,'accountErasureConfirmed',false);
end;$$;
revoke all on function maintenance_private.read_household_copy_status(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.read_household_copy_status(uuid,uuid,uuid,uuid) to ouchi_closure_operator;

create function maintenance_private.confirm_household_copy_bytes(target_intent uuid,target_review uuid,target_user uuid,target_epoch uuid,measured_sha256 text,measured_size bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare manifest jsonb;
begin
 manifest:=maintenance_private.lock_household_copy_intent(target_intent,target_review,target_user,target_epoch);
 if measured_sha256 is null or measured_sha256 is distinct from manifest->'destination'->>'sha256' or measured_size is distinct from (manifest->'destination'->>'size')::bigint then raise exception 'Measured destination bytes required';end if;
 update maintenance_private.household_copy_intents set state='copy_verified',copied_at=coalesce(copied_at,clock_timestamp()) where intent_id=target_intent and state in('reserved','copy_verified');
 return maintenance_private.lock_household_copy_intent(target_intent,target_review,target_user,target_epoch);
end;$$;
revoke all on function maintenance_private.confirm_household_copy_bytes(uuid,uuid,uuid,uuid,text,bigint) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.confirm_household_copy_bytes(uuid,uuid,uuid,uuid,text,bigint) to ouchi_closure_operator;

create function maintenance_private.guard_pending_household_copy_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from maintenance_private.household_copy_intents where source_attachment_id=old.id and state<>'completed') then
  if tg_op='DELETE' or to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'Pending household copy must be reconciled';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function maintenance_private.guard_pending_household_copy_source() from public,anon,authenticated,service_role,ouchi_closure_operator;
create trigger pending_household_copy_source before update or delete on maintenance_private.product_attachments for each row execute function maintenance_private.guard_pending_household_copy_source();

-- Stop old deletion stages before any physical source erasure while another
-- participant has a pending copy, and fence all identifying intent metadata.
create or replace function public.maintenance_deletion_lease_is_current(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.account_deletion_requests r
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch and r.lease_token=target_lease and r.state='running' and r.lease_until>now()
 and not exists(select 1 from maintenance_private.app_epochs a where a.user_id=r.user_id and a.epoch_id<>r.app_epoch_id)
 and not exists(select 1 from maintenance_private.account_closure_reviews c where c.user_id=r.user_id and c.app_epoch_id=r.app_epoch_id and c.state='review_required')
 and not exists(select 1 from maintenance_private.household_copy_intents i where i.state<>'completed' and (i.user_id=r.user_id or i.source_uploader_id=r.user_id or i.source_captured_owner_id=r.user_id)));
$$;
create or replace function public.maintenance_deletion_completion_is_confirmed(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.account_deletion_requests r
 join maintenance_private.deletion_retention_checks c on c.request_id=r.id
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch
 and r.state='complete' and r.completion_lease=target_lease and r.receipt_expires_at>statement_timestamp()
 and r.identity_erased and r.records_erased and r.inventory_captured and r.receipt_sessions_captured
 and c.checked_at<=r.updated_at and c.confirmed_until>r.updated_at
 and r.receipt_expires_at=r.updated_at+make_interval(secs=>c.receipt_lifetime_seconds))
 and exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 and not exists(select 1 from maintenance_private.restore_transfer_jobs where user_id=target_user)
 and not exists(select 1 from maintenance_private.attest_registration_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_attested_keys where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.ownerless_home_claims where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_file_inspections where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_file_decisions where user_id=target_user)
 and not exists(select 1 from maintenance_private.attachment_capacity_claims where split_part(object_path,'/',1)=target_user::text)
 and not exists(select 1 from maintenance_private.household_copy_intents where user_id=target_user or source_uploader_id=target_user or source_captured_owner_id=target_user)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
create or replace function public.complete_maintenance_account_deletion(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare receipt_seconds integer;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if exists(select 1 from maintenance_private.ownerless_home_claims where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_file_inspections where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_file_decisions where user_id=target_user)
 or exists(select 1 from maintenance_private.attachment_capacity_claims where split_part(object_path,'/',1)=target_user::text)
 or exists(select 1 from maintenance_private.household_copy_intents where user_id=target_user or source_uploader_id=target_user or source_captured_owner_id=target_user) then return false; end if;
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 perform 1 from maintenance_private.enrollment_policy where id=1 and require_explicit for share;
 if not found then return false; end if;
 -- Idempotent acknowledgement never extends expiry or changes timestamps.
 if public.maintenance_deletion_completion_is_confirmed(target_request,target_user,target_epoch,target_lease) then return true; end if;
 if not public.maintenance_deletion_identity_is_erased(target_request,target_user,target_epoch,target_lease)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request)
 or not exists(select 1 from maintenance_private.deletion_receipt_sessions where request_id=target_request) then return false; end if;
 select c.receipt_lifetime_seconds into receipt_seconds from maintenance_private.deletion_retention_checks c
 where c.request_id=target_request and c.checked_at<=statement_timestamp() and c.confirmed_until>statement_timestamp() for share;
 if not found then return false; end if;
 update maintenance_private.account_deletion_requests set state='complete',completion_lease=target_lease,
 lease_token=null,lease_until=null,updated_at=statement_timestamp(),receipt_expires_at=statement_timestamp()+make_interval(secs=>receipt_seconds)
 where id=target_request;
 return public.maintenance_deletion_completion_is_confirmed(target_request,target_user,target_epoch,target_lease);
end;$$;
commit;
