-- Dormant write issuance/ack journal. No timer can close an uncertain writer.
-- No activation, source erasure, capacity release or provider reconciliation.
begin;
create table maintenance_private.household_copy_writes(
 attempt_id uuid primary key,intent_id uuid not null references maintenance_private.household_copy_intents(intent_id) on delete restrict,
 writer_nonce uuid,phase text not null check(phase in('issued','acknowledged','not_dispatched','legacy_unknown')),
 issued_at timestamptz not null default clock_timestamp(),acknowledged_at timestamptz,closed_at timestamptz,
 check((phase='legacy_unknown')=(writer_nonce is null)),
 check((phase='acknowledged')=(acknowledged_at is not null)),check((phase='not_dispatched')=(closed_at is not null))
);
create unique index household_copy_one_writer on maintenance_private.household_copy_writes(intent_id) where phase<>'not_dispatched';
alter table maintenance_private.household_copy_writes enable row level security;
revoke all on maintenance_private.household_copy_writes from public,anon,authenticated,service_role,ouchi_closure_operator;
-- Never interpret earlier byte observations as proof of writer termination.
insert into maintenance_private.household_copy_writes(attempt_id,intent_id,phase)
 select gen_random_uuid(),intent_id,'legacy_unknown' from maintenance_private.household_copy_intents;

create or replace function maintenance_private.lock_household_copy_intent(target_intent uuid,target_review uuid,target_user uuid,target_epoch uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.household_copy_intents; source jsonb; destination maintenance_private.household_attachments; writer maintenance_private.household_copy_writes;
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
 select * into writer from maintenance_private.household_copy_writes where intent_id=target_intent and phase<>'not_dispatched';
 return jsonb_build_object('kind','household-copy/v1','intentID',prior.intent_id,'reviewRequestID',prior.review_request_id,'userID',prior.user_id,'epochID',prior.app_epoch_id,'decisionID',prior.decision_id,'inspectionID',prior.inspection_id,'metadataDigest',prior.metadata_digest,'source',prior.source_descriptor,
 'destination',jsonb_build_object('id',destination.id,'homeID',destination.home_id,'homeInstanceID',destination.home_instance_id,'productID',destination.product_id,'size',destination.size_bytes,'mime',destination.mime,'sha256',destination.sha256,'objectPath',destination.object_path),
 'capacityClaimID',prior.capacity_claim_id,'state',prior.state,'writerState',coalesce(writer.phase,'unissued'),'writeAttemptID',writer.attempt_id);
end;$$;
create or replace function maintenance_private.read_household_copy_status(target_intent uuid,target_review uuid,target_user uuid,target_epoch uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.household_copy_intents; writer maintenance_private.household_copy_writes;
begin
 perform 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized operator connection required';end if;
 select * into prior from maintenance_private.household_copy_intents where intent_id=target_intent and review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and operator_principal=session_user;
 if not found then raise exception 'Own matching copy intent required';end if;
 select * into writer from maintenance_private.household_copy_writes where intent_id=target_intent and phase<>'not_dispatched';
 return jsonb_build_object('kind','household-copy-status/v1','intentID',prior.intent_id,'reviewRequestID',prior.review_request_id,'userID',prior.user_id,'epochID',prior.app_epoch_id,'destinationID',prior.household_attachment_id,'capacityClaimID',prior.capacity_claim_id,'state',prior.state,'writerState',coalesce(writer.phase,'unissued'),'writeAttemptID',writer.attempt_id,'activationConfirmed',false,'sourceEraseConfirmed',false,'accountErasureConfirmed',false);
end;$$;
create or replace function maintenance_private.confirm_household_copy_bytes(target_intent uuid,target_review uuid,target_user uuid,target_epoch uuid,measured_sha256 text,measured_size bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare manifest jsonb;
begin
 manifest:=maintenance_private.lock_household_copy_intent(target_intent,target_review,target_user,target_epoch);
 if manifest->>'writerState' is distinct from 'acknowledged' then raise exception 'Acknowledged copy writer required';end if;
 if measured_sha256 is null or measured_sha256 is distinct from manifest->'destination'->>'sha256' or measured_size is distinct from (manifest->'destination'->>'size')::bigint then raise exception 'Measured destination bytes required';end if;
 update maintenance_private.household_copy_intents set state='copy_verified',copied_at=coalesce(copied_at,clock_timestamp()) where intent_id=target_intent and state in('reserved','copy_verified');
 return maintenance_private.lock_household_copy_intent(target_intent,target_review,target_user,target_epoch);
end;$$;
create function maintenance_private.issue_household_copy_write(target_intent uuid,target_review uuid,target_user uuid,target_epoch uuid,target_attempt uuid,target_nonce uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare manifest jsonb; prior maintenance_private.household_copy_writes;
begin
 if target_attempt is null or target_nonce is null or '00000000-0000-0000-0000-000000000000'::uuid=any(array[target_attempt,target_nonce]) then raise exception 'Private writer identity required';end if;
 manifest:=maintenance_private.lock_household_copy_intent(target_intent,target_review,target_user,target_epoch);
 select * into prior from maintenance_private.household_copy_writes where intent_id=target_intent and phase<>'not_dispatched';
 if found then
  return jsonb_build_object('kind','household-copy-writer/v1','intentID',target_intent,'attemptID',prior.attempt_id,'issued',false,'writerState',prior.phase);
 end if;
 insert into maintenance_private.household_copy_writes(attempt_id,intent_id,writer_nonce,phase) values(target_attempt,target_intent,target_nonce,'issued');
 return jsonb_build_object('kind','household-copy-writer/v1','intentID',target_intent,'attemptID',target_attempt,'issued',true,'writerState','issued');
end;$$;
create function maintenance_private.lock_household_copy_write(target_intent uuid,target_review uuid,target_user uuid,target_epoch uuid,target_attempt uuid,target_nonce uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare manifest jsonb;
begin
 manifest:=maintenance_private.lock_household_copy_intent(target_intent,target_review,target_user,target_epoch);
 perform 1 from maintenance_private.household_copy_writes where attempt_id=target_attempt and intent_id=target_intent and writer_nonce=target_nonce and phase='issued' for update;
 if not found then raise exception 'Own unused copy writer required';end if;
 return manifest;
end;$$;
-- ACK/no-dispatch are factual server callbacks for the private nonce holder.
-- They remain possible after cancellation; neither authorizes any further I/O.
create function maintenance_private.record_household_copy_write_fact(target_intent uuid,target_review uuid,target_user uuid,target_epoch uuid,target_attempt uuid,target_nonce uuid,target_fact text)
returns boolean language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.household_copy_writes;
begin
 perform 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized operator connection required';end if;
 perform 1 from maintenance_private.household_copy_intents where intent_id=target_intent and review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and operator_principal=session_user for update;
 if not found then raise exception 'Own matching copy intent required';end if;
 if target_fact is null or target_fact not in('acknowledged','not_dispatched') or target_nonce is null then raise exception 'Private writer fact required';end if;
 select * into prior from maintenance_private.household_copy_writes where attempt_id=target_attempt and intent_id=target_intent and writer_nonce=target_nonce for update;
 if not found then return false;end if;
 if prior.phase=target_fact then return true;end if;
 if prior.phase<>'issued' then return false;end if;
 update maintenance_private.household_copy_writes set phase=target_fact,
  acknowledged_at=case when target_fact='acknowledged' then clock_timestamp() else null end,
  closed_at=case when target_fact='not_dispatched' then clock_timestamp() else null end where attempt_id=target_attempt;
 return true;
end;$$;
revoke all on function maintenance_private.issue_household_copy_write(uuid,uuid,uuid,uuid,uuid,uuid),maintenance_private.lock_household_copy_write(uuid,uuid,uuid,uuid,uuid,uuid),maintenance_private.record_household_copy_write_fact(uuid,uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.issue_household_copy_write(uuid,uuid,uuid,uuid,uuid,uuid),maintenance_private.lock_household_copy_write(uuid,uuid,uuid,uuid,uuid,uuid),maintenance_private.record_household_copy_write_fact(uuid,uuid,uuid,uuid,uuid,uuid,text) to ouchi_closure_operator;
commit;
