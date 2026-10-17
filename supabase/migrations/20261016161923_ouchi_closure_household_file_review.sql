-- Dormant operator evidence for household files. No activation, removal,
-- source cleanup, subject inference or retirement-completion authority.
begin;
create index household_attachments_home_review on maintenance_private.household_attachments(home_id,id);
create function maintenance_private.closure_review_household_files(target_review uuid,target_user uuid,target_epoch uuid)
returns table(attachment_id uuid,home_id uuid,home_instance_id uuid,product_id uuid,size_bytes bigint,mime text,file_state text,write_state text,removal_pending boolean,metadata_digest text,descriptor jsonb)
language sql stable security invoker set search_path='' as $$
 with scoped_homes as (
  select h.id from public.homes h where h.owner_id=target_user
  union select m."homeId" from public.home_members m where m.user_id=target_user
  union select e.home_id from maintenance_private.closure_legacy_home_events e
   where e.review_request_id=target_review and e.user_id=target_user and e.app_epoch_id=target_epoch
   and maintenance_private.closure_legacy_home_context_is_current(target_review,target_user,target_epoch,e.home_id)
 ), candidates as (
  select f.*,case when w.phase='acknowledged' then 'settled' when w.phase='issued' then 'started' else 'untracked' end as current_write_state,
   jsonb_build_object('attachment',to_jsonb(f),'homeInstanceID',h.instance_id,
    'copyIntentID',c.intent_id,'copyState',c.state,'copyVerifiedAt',c.copied_at,
    'writeAttemptID',w.attempt_id,'writerPhase',w.phase,'acknowledgedAt',w.acknowledged_at) as source
  from maintenance_private.household_attachments f
  join maintenance_private.closure_home_instances h on h.home_id=f.home_id and h.instance_id=f.home_instance_id
  join public.products p on p.id=f.product_id and p."homeId"=f.home_id
  left join maintenance_private.household_copy_intents c on c.household_attachment_id=f.id
  left join maintenance_private.household_copy_writes w on w.intent_id=c.intent_id and w.phase<>'not_dispatched'
  where f.home_id in(select id from scoped_homes)
   or exists(select 1 from maintenance_private.household_copy_intents linked where linked.household_attachment_id=f.id
    and (linked.user_id=target_user or linked.source_uploader_id=target_user or linked.source_captured_owner_id=target_user))
 )
 select f.id,f.home_id,f.home_instance_id,f.product_id,f.size_bytes,f.mime,f.state,f.current_write_state,f.removal_pending,
 encode(sha256(convert_to(f.source::text,'UTF8')),'hex'),
 jsonb_build_object('attachmentID',f.id,'productID',f.product_id,'homeID',f.home_id,'homeInstanceID',f.home_instance_id,
  'bucket','ouchi-product-attachments','objectPath',f.object_path,'sizeBytes',f.size_bytes,'mime',f.mime,'state',f.state,
  'writeState',f.current_write_state,'removalPending',f.removal_pending,'sha256',f.sha256,'expectedSHA256',f.sha256,'subjectConfirmed',false)
 from candidates f;
$$;
revoke all on function maintenance_private.closure_review_household_files(uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;
create function maintenance_private.closure_review_household_file_inventory(target_review uuid,target_user uuid,target_epoch uuid,after_file uuid default null)
returns table(attachment_id uuid,home_id uuid,home_instance_id uuid,product_id uuid,size_bytes bigint,mime text,file_state text,write_state text,removal_pending boolean,metadata_digest text)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 if after_file='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Scoped file cursor required';end if;
 return query select f.attachment_id,f.home_id,f.home_instance_id,f.product_id,f.size_bytes,f.mime,f.file_state,f.write_state,f.removal_pending,f.metadata_digest
 from maintenance_private.closure_review_household_files(target_review,target_user,target_epoch) f
 where after_file is null or f.attachment_id>after_file order by f.attachment_id limit 51;
end;$$;
revoke all on function maintenance_private.closure_review_household_file_inventory(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_household_file_inventory(uuid,uuid,uuid,uuid) to ouchi_closure_operator;
create function maintenance_private.read_closure_review_household_file(target_review uuid,target_user uuid,target_epoch uuid,target_file uuid,expected_metadata_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f record;home_key uuid;product_key uuid;intent_key uuid;
begin
 perform 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized operator connection required';end if;
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 if target_file is null or target_file='00000000-0000-0000-0000-000000000000'::uuid
 or expected_metadata_digest is null or expected_metadata_digest !~ '^[0-9a-f]{64}$' then raise exception 'Scoped reviewed file required';end if;
 select a.home_id,a.product_id,c.intent_id into home_key,product_key,intent_key from maintenance_private.household_attachments a
 left join maintenance_private.household_copy_intents c on c.household_attachment_id=a.id where a.id=target_file;
 perform 1 from public.homes where id=home_key for update;
 perform 1 from public.home_members where "homeId"=home_key and user_id=target_user for share;
 perform 1 from public.products where id=product_key for update;
 perform 1 from maintenance_private.household_copy_intents where intent_id=intent_key for update;
 perform 1 from maintenance_private.household_attachments where id=target_file for update;
 perform 1 from maintenance_private.household_copy_writes where intent_id=intent_key for update;
 select * into f from maintenance_private.closure_review_household_files(target_review,target_user,target_epoch) where attachment_id=target_file;
 if not found then raise exception 'Scoped household file unavailable';end if;
 if f.metadata_digest is distinct from expected_metadata_digest then raise exception 'Household file metadata changed';end if;
 return jsonb_build_object('metadataDigest',f.metadata_digest,'file',f.descriptor,'accountErasureConfirmed',false);
end;$$;
revoke all on function maintenance_private.read_closure_review_household_file(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.read_closure_review_household_file(uuid,uuid,uuid,uuid,text) to ouchi_closure_operator;
create table maintenance_private.closure_household_file_inspections(
 inspection_id uuid primary key,
 review_request_id uuid not null references maintenance_private.account_closure_reviews(review_request_id) on delete cascade,
 user_id uuid not null,app_epoch_id uuid not null,attachment_id uuid not null,
 operator_principal name not null,metadata_digest text not null check(metadata_digest ~ '^[0-9a-f]{64}$'),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),size_bytes bigint not null check(size_bytes between 1 and 5242880),
 inspected_at timestamptz not null default clock_timestamp()
);
create table maintenance_private.closure_household_file_decisions(
 decision_id uuid primary key,decision_sequence bigint generated always as identity unique,
 review_request_id uuid not null references maintenance_private.account_closure_reviews(review_request_id) on delete cascade,
 inspection_id uuid not null references maintenance_private.closure_household_file_inspections(inspection_id) on delete cascade,
 user_id uuid not null,app_epoch_id uuid not null,attachment_id uuid not null,operator_principal name not null,
 action text not null check(action in('needs_review','erase_personal_file','retain_household_file')),
 evidence_digest text not null check(evidence_digest ~ '^[0-9a-f]{64}$'),recorded_at timestamptz not null default clock_timestamp()
);
create index closure_household_inspection_scope on maintenance_private.closure_household_file_inspections(review_request_id,attachment_id);
create index closure_household_file_latest_decision on maintenance_private.closure_household_file_decisions(review_request_id,attachment_id,decision_sequence desc);
alter table maintenance_private.closure_household_file_inspections enable row level security;
alter table maintenance_private.closure_household_file_decisions enable row level security;
revoke all on maintenance_private.closure_household_file_inspections,maintenance_private.closure_household_file_decisions from public,anon,authenticated,service_role,ouchi_closure_operator;
grant select on maintenance_private.closure_household_file_inspections,maintenance_private.closure_household_file_decisions to service_role;

-- Backend supplies measured bytes/hash only after same-transaction inspection.
-- Dedicated operator credentials never enter the browser or a caller's JWT.
create function maintenance_private.record_closure_household_file_inspection(target_inspection uuid,target_review uuid,target_user uuid,target_epoch uuid,target_file uuid,expected_metadata_digest text,measured_sha256 text,measured_size bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.closure_household_file_inspections; item jsonb;
begin
 if target_inspection is null or target_inspection='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Scoped inspection ID required';end if;
 item:=maintenance_private.read_closure_review_household_file(target_review,target_user,target_epoch,target_file,expected_metadata_digest)->'file';
 if item->>'state'<>'active' or item->>'writeState'<>'settled' or (item->>'removalPending')::boolean
 or measured_sha256 is null or measured_sha256 is distinct from item->>'sha256' or measured_sha256 is distinct from item->>'expectedSHA256'
 or measured_size is null or measured_size is distinct from (item->>'sizeBytes')::bigint then raise exception 'Verified file inspection required';end if;
 select * into prior from maintenance_private.closure_household_file_inspections where inspection_id=target_inspection;
 if found then
  if row(prior.review_request_id,prior.user_id,prior.app_epoch_id,prior.attachment_id,prior.operator_principal,prior.metadata_digest,prior.sha256,prior.size_bytes)
  is distinct from row(target_review,target_user,target_epoch,target_file,session_user,expected_metadata_digest,measured_sha256,measured_size) then raise exception 'Inspection event conflict';end if;
  return prior.inspection_id;
 end if;
 insert into maintenance_private.closure_household_file_inspections(inspection_id,review_request_id,user_id,app_epoch_id,attachment_id,operator_principal,metadata_digest,sha256,size_bytes)
 values(target_inspection,target_review,target_user,target_epoch,target_file,session_user,expected_metadata_digest,measured_sha256,measured_size);
 return target_inspection;
end;$$;

create function maintenance_private.record_closure_household_file_decision(target_decision uuid,target_inspection uuid,target_review uuid,target_user uuid,target_epoch uuid,target_file uuid,target_action text,target_evidence_digest text)
returns uuid language plpgsql security definer set search_path='' as $$
declare inspected maintenance_private.closure_household_file_inspections; prior maintenance_private.closure_household_file_decisions; item jsonb; home_key uuid;
begin
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 if target_decision is null or target_decision='00000000-0000-0000-0000-000000000000'::uuid
 or target_action is null or target_action not in('needs_review','erase_personal_file','retain_household_file')
 or target_evidence_digest is null or target_evidence_digest !~ '^[0-9a-f]{64}$' then raise exception 'Explicit scoped file decision required';end if;
 select * into inspected from maintenance_private.closure_household_file_inspections where inspection_id=target_inspection and review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and attachment_id=target_file and operator_principal=session_user;
 if not found then raise exception 'Own matching file inspection required';end if;
 item:=maintenance_private.read_closure_review_household_file(target_review,target_user,target_epoch,target_file,inspected.metadata_digest)->'file';
 if item->>'state'<>'active' or item->>'writeState'<>'settled' or (item->>'removalPending')::boolean or item->>'sha256' is distinct from inspected.sha256 then raise exception 'Current inspected file required';end if;
 home_key:=(item->>'homeID')::uuid;
 if target_action='retain_household_file' and (home_key is null or not (
  exists(select 1 from public.homes h where h.id=home_key and h.owner_id is not null and h.owner_id<>target_user)
  or exists(select 1 from public.home_members m where m."homeId"=home_key and m.user_id<>target_user))) then raise exception 'Remaining family required';end if;
 select * into prior from maintenance_private.closure_household_file_decisions where decision_id=target_decision;
 if found then
  if row(prior.inspection_id,prior.review_request_id,prior.user_id,prior.app_epoch_id,prior.attachment_id,prior.operator_principal,prior.action,prior.evidence_digest)
  is distinct from row(target_inspection,target_review,target_user,target_epoch,target_file,session_user,target_action,target_evidence_digest) then raise exception 'File decision event conflict';end if;
  return prior.decision_id;
 end if;
 insert into maintenance_private.closure_household_file_decisions(decision_id,inspection_id,review_request_id,user_id,app_epoch_id,attachment_id,operator_principal,action,evidence_digest)
 values(target_decision,target_inspection,target_review,target_user,target_epoch,target_file,session_user,target_action,target_evidence_digest);
 return target_decision;
end;$$;

create function maintenance_private.read_closure_household_file_decision(target_review uuid,target_user uuid,target_epoch uuid,target_file uuid,expected_metadata_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.closure_household_file_decisions; inspected maintenance_private.closure_household_file_inspections; item jsonb; is_current boolean:=false;
begin
 item:=maintenance_private.read_closure_review_household_file(target_review,target_user,target_epoch,target_file,expected_metadata_digest)->'file';
 select * into prior from maintenance_private.closure_household_file_decisions where review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and attachment_id=target_file order by decision_sequence desc limit 1;
 if found then
  select * into inspected from maintenance_private.closure_household_file_inspections where inspection_id=prior.inspection_id;
  is_current:=inspected.metadata_digest=expected_metadata_digest and inspected.sha256=item->>'sha256' and item->>'state'='active' and item->>'writeState'='settled' and not (item->>'removalPending')::boolean
   and (prior.action<>'retain_household_file' or exists(select 1 from public.homes h where h.id=(item->>'homeID')::uuid and h.owner_id is not null and h.owner_id<>target_user) or exists(select 1 from public.home_members m where m."homeId"=(item->>'homeID')::uuid and m.user_id<>target_user));
 end if;
 return jsonb_build_object('kind','closure-household-file-decision/v1','fileID',target_file,'metadataDigest',expected_metadata_digest,'decisionID',prior.decision_id,'inspectionID',prior.inspection_id,'action',prior.action,'current',coalesce(is_current,false),'householdRetentionExecuted',false,'accountErasureConfirmed',false);
end;$$;
revoke all on function maintenance_private.record_closure_household_file_inspection(uuid,uuid,uuid,uuid,uuid,text,text,bigint),maintenance_private.record_closure_household_file_decision(uuid,uuid,uuid,uuid,uuid,uuid,text,text),maintenance_private.read_closure_household_file_decision(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.record_closure_household_file_inspection(uuid,uuid,uuid,uuid,uuid,text,text,bigint),maintenance_private.record_closure_household_file_decision(uuid,uuid,uuid,uuid,uuid,uuid,text,text),maintenance_private.read_closure_household_file_decision(uuid,uuid,uuid,uuid,text) to ouchi_closure_operator;

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
 and not exists(select 1 from maintenance_private.closure_household_file_inspections where user_id=target_user)
 and not exists(select 1 from maintenance_private.closure_household_file_decisions where user_id=target_user)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
create or replace function public.complete_maintenance_account_deletion(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare receipt_seconds integer;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if exists(select 1 from maintenance_private.closure_household_file_inspections where user_id=target_user)
 or exists(select 1 from maintenance_private.closure_household_file_decisions where user_id=target_user)
 or exists(select 1 from maintenance_private.ownerless_home_claims where user_id=target_user)
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
