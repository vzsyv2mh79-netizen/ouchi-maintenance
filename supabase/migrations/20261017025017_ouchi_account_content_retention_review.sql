-- Dormant operator-only manual evidence. No automated authorship inference,
-- policy activation, credential creation, physical copy or account erasure.
-- Existing decisions remain unreviewed; there is no automatic backfill.
begin;
alter table maintenance_private.closure_coverage_text_decisions add column account_content_reviewed boolean not null default false;
alter table maintenance_private.closure_file_decisions add column account_content_reviewed boolean not null default false;
alter table maintenance_private.closure_household_file_decisions add column account_content_reviewed boolean not null default false;

create function maintenance_private.record_closure_account_content_text_decision(target_event uuid,target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid,target_key text,target_action text,target_evidence text,target_confirmation text)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 perform maintenance_private.require_closure_coverage_plan(target_plan,target_review,target_user,target_epoch);
 if target_confirmation is null or target_confirmation is distinct from (case target_action when 'retain_reviewed' then 'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION' when 'needs_review' then 'REQUIRE_ADDITIONAL_TEXT_REVIEW' else null end) then raise exception 'Explicit account-content decision confirmation required';end if;
 -- Reusing a pre-upgrade ID is not a new content review. Require a fresh event.
 if target_action='retain_reviewed' and exists(select 1 from maintenance_private.closure_coverage_text_decisions where event_id=target_event and not account_content_reviewed) then raise exception 'Fresh account-content review decision required';end if;
 saved:=maintenance_private.record_closure_coverage_text_decision(target_event,target_plan,target_review,target_user,target_epoch,target_key,target_action,target_evidence);
 if target_action='retain_reviewed' then update maintenance_private.closure_coverage_text_decisions set account_content_reviewed=true where event_id=saved and not account_content_reviewed;end if;
 return saved;
end;$$;
revoke all on function maintenance_private.record_closure_account_content_text_decision(uuid,uuid,uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role,ouchi_closure_operator;
grant execute on function maintenance_private.record_closure_account_content_text_decision(uuid,uuid,uuid,uuid,uuid,text,text,text,text) to ouchi_closure_operator;
revoke all on function maintenance_private.record_closure_coverage_text_decision(uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role,ouchi_closure_operator;

create function maintenance_private.record_closure_account_content_file_decision(target_decision uuid,target_inspection uuid,target_review uuid,target_user uuid,target_epoch uuid,target_file uuid,target_action text,target_evidence_digest text,target_confirmation text)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 if target_confirmation is null or target_confirmation is distinct from (case target_action when 'retain_family_copy' then 'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION' when 'needs_review' then 'REQUIRE_ADDITIONAL_FILE_REVIEW' when 'erase_personal_file' then 'ERASE_REVIEWED_PERSONAL_FILE' else null end) then raise exception 'Explicit account-content decision confirmation required';end if;
 -- Reusing a pre-upgrade ID is not a new content review. Require a fresh event.
 if target_action='retain_family_copy' and exists(select 1 from maintenance_private.closure_file_decisions where decision_id=target_decision and not account_content_reviewed) then raise exception 'Fresh account-content review decision required';end if;
 saved:=maintenance_private.record_closure_file_decision(target_decision,target_inspection,target_review,target_user,target_epoch,target_file,target_action,target_evidence_digest);
 if target_action='retain_family_copy' then update maintenance_private.closure_file_decisions set account_content_reviewed=true where decision_id=saved and not account_content_reviewed;end if;
 return saved;
end;$$;
revoke all on function maintenance_private.record_closure_account_content_file_decision(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role,ouchi_closure_operator;
grant execute on function maintenance_private.record_closure_account_content_file_decision(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text) to ouchi_closure_operator;
revoke all on function maintenance_private.record_closure_file_decision(uuid,uuid,uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role,ouchi_closure_operator;

create function maintenance_private.record_closure_account_content_household_file_decision(target_decision uuid,target_inspection uuid,target_review uuid,target_user uuid,target_epoch uuid,target_file uuid,target_action text,target_evidence_digest text,target_confirmation text)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 if target_confirmation is null or target_confirmation is distinct from (case target_action when 'retain_household_file' then 'RETAIN_REVIEWED_HOUSEHOLD_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION' when 'needs_review' then 'REQUIRE_ADDITIONAL_FILE_REVIEW' when 'erase_personal_file' then 'ERASE_REVIEWED_PERSONAL_FILE' else null end) then raise exception 'Explicit account-content decision confirmation required';end if;
 -- Reusing a pre-upgrade ID is not a new content review. Require a fresh event.
 if target_action='retain_household_file' and exists(select 1 from maintenance_private.closure_household_file_decisions where decision_id=target_decision and not account_content_reviewed) then raise exception 'Fresh account-content review decision required';end if;
 saved:=maintenance_private.record_closure_household_file_decision(target_decision,target_inspection,target_review,target_user,target_epoch,target_file,target_action,target_evidence_digest);
 if target_action='retain_household_file' then update maintenance_private.closure_household_file_decisions set account_content_reviewed=true where decision_id=saved and not account_content_reviewed;end if;
 return saved;
end;$$;
revoke all on function maintenance_private.record_closure_account_content_household_file_decision(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role,ouchi_closure_operator;
grant execute on function maintenance_private.record_closure_account_content_household_file_decision(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text) to ouchi_closure_operator;
revoke all on function maintenance_private.record_closure_household_file_decision(uuid,uuid,uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role,ouchi_closure_operator;

create or replace function maintenance_private.read_closure_file_decision(target_review uuid,target_user uuid,target_epoch uuid,target_file uuid,expected_metadata_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.closure_file_decisions; inspected maintenance_private.closure_file_inspections; item jsonb; is_current boolean:=false;
begin
 item:=maintenance_private.read_closure_review_file(target_review,target_user,target_epoch,target_file,expected_metadata_digest)->'file';
 select * into prior from maintenance_private.closure_file_decisions where review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and attachment_id=target_file order by decision_sequence desc limit 1;
 if found then
  select * into inspected from maintenance_private.closure_file_inspections where inspection_id=prior.inspection_id;
  is_current:=inspected.metadata_digest=expected_metadata_digest and inspected.sha256=item->>'sha256' and item->>'state'='stored' and item->>'writeState'='settled' and not (item->>'removalPending')::boolean
   and (prior.action<>'retain_family_copy' or prior.account_content_reviewed)
   and (prior.action<>'retain_family_copy' or exists(select 1 from public.homes h where h.id=(item->>'homeID')::uuid and h.owner_id is not null and h.owner_id<>target_user) or exists(select 1 from public.home_members m where m."homeId"=(item->>'homeID')::uuid and m.user_id<>target_user));
 end if;
 return jsonb_build_object('kind','closure-file-decision/v1','fileID',target_file,'metadataDigest',expected_metadata_digest,'decisionID',prior.decision_id,'inspectionID',prior.inspection_id,'action',prior.action,'current',coalesce(is_current,false),'familyRetentionExecuted',false,'accountErasureConfirmed',false);
end;$$;

create or replace function maintenance_private.read_closure_household_file_decision(target_review uuid,target_user uuid,target_epoch uuid,target_file uuid,expected_metadata_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.closure_household_file_decisions; inspected maintenance_private.closure_household_file_inspections; item jsonb; is_current boolean:=false;
begin
 item:=maintenance_private.read_closure_review_household_file(target_review,target_user,target_epoch,target_file,expected_metadata_digest)->'file';
 select * into prior from maintenance_private.closure_household_file_decisions where review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and attachment_id=target_file order by decision_sequence desc limit 1;
 if found then
  select * into inspected from maintenance_private.closure_household_file_inspections where inspection_id=prior.inspection_id;
  is_current:=inspected.metadata_digest=expected_metadata_digest and inspected.sha256=item->>'sha256' and item->>'state'='active' and item->>'writeState'='settled' and not (item->>'removalPending')::boolean
   and (prior.action<>'retain_household_file' or prior.account_content_reviewed)
   and (prior.action<>'retain_household_file' or exists(select 1 from public.homes h where h.id=(item->>'homeID')::uuid and h.owner_id is not null and h.owner_id<>target_user) or exists(select 1 from public.home_members m where m."homeId"=(item->>'homeID')::uuid and m.user_id<>target_user));
 end if;
 return jsonb_build_object('kind','closure-household-file-decision/v1','fileID',target_file,'metadataDigest',expected_metadata_digest,'decisionID',prior.decision_id,'inspectionID',prior.inspection_id,'action',prior.action,'current',coalesce(is_current,false),'householdRetentionExecuted',false,'accountErasureConfirmed',false);
end;$$;

create or replace function maintenance_private.prepared_household_copy_for_coverage(target_plan uuid,target_file uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('kind','verified-prepared-copy/v1','intentID',ci.intent_id,'sourceDecisionID',d.decision_id,'sourceInspectionID',i.inspection_id,'writeAttemptID',w.attempt_id,'capacityClaimID',ci.capacity_claim_id)
 from maintenance_private.closure_coverage_plans p
 join maintenance_private.household_copy_intents ci on ci.household_attachment_id=target_file and ci.review_request_id=p.review_request_id and ci.user_id=p.user_id and ci.app_epoch_id=p.app_epoch_id and ci.operator_principal=p.operator_principal
 join maintenance_private.household_attachments dest on dest.id=ci.household_attachment_id and dest.state='staged' and not dest.removal_pending
 join maintenance_private.closure_home_instances h on h.home_id=dest.home_id and h.instance_id=dest.home_instance_id
 join maintenance_private.household_copy_writes w on w.intent_id=ci.intent_id and w.phase='acknowledged' and w.acknowledged_at is not null
 cross join lateral maintenance_private.closure_review_files(p.review_request_id,p.user_id,p.app_epoch_id) source
 join maintenance_private.product_attachments original on original.id=source.attachment_id
 join lateral(select * from maintenance_private.closure_file_decisions d where d.review_request_id=p.review_request_id and d.user_id=p.user_id and d.app_epoch_id=p.app_epoch_id and d.attachment_id=ci.source_attachment_id order by decision_sequence desc limit 1) d on d.decision_id=ci.decision_id and d.inspection_id=ci.inspection_id and d.operator_principal=p.operator_principal and d.action='retain_family_copy' and d.account_content_reviewed
 join maintenance_private.closure_file_inspections i on i.inspection_id=d.inspection_id and i.operator_principal=p.operator_principal and i.review_request_id=p.review_request_id and i.user_id=p.user_id and i.app_epoch_id=p.app_epoch_id and i.attachment_id=ci.source_attachment_id
 join maintenance_private.attachment_capacity_claims capacity on capacity.claim_id=ci.capacity_claim_id and capacity.claim_id=ci.intent_id and capacity.object_path=dest.object_path and capacity.size_bytes=dest.size_bytes and capacity.purpose='household-copy'
 join maintenance_private.attachment_app_budget_policy budget on budget.id=1 and budget.enabled and budget.writer_coverage_verified
 where p.plan_id=target_plan and ci.state='copy_verified' and ci.copied_at is not null
 and to_regclass('maintenance_private.household_write_routes') is null
 and source.attachment_id=ci.source_attachment_id and source.metadata_digest=ci.metadata_digest and source.metadata_digest=i.metadata_digest and source.descriptor=ci.source_descriptor
 and source.file_state='stored' and source.write_state='settled' and not source.removal_pending and maintenance_private.attachment_write_is_quiet(source.attachment_id)
 and source.home_id=dest.home_id and source.home_instance_id=dest.home_instance_id and source.product_id=dest.product_id
 and source.mime=dest.mime and source.size_bytes=dest.size_bytes and i.size_bytes=dest.size_bytes and i.sha256=dest.sha256
 and source.descriptor->>'sha256'=dest.sha256 and source.descriptor->>'expectedSHA256'=dest.sha256
 and original.user_id=ci.source_uploader_id and original.captured_owner_id=ci.source_captured_owner_id
 and exists(select 1 from maintenance_private.attachment_write_attempts a where a.attachment_id=original.id and a.uploader_id=original.user_id and a.owner_id=original.captured_owner_id and a.app_epoch_id=original.app_epoch_id and a.state='settled')
 and exists(select 1 from maintenance_private.attachment_capacity_claims a where a.object_path=original.object_path and a.size_bytes=original.size_bytes and a.purpose in('upload','transfer-copy'))
 and (select coalesce(sum(a.size_bytes),0) from maintenance_private.attachment_capacity_claims a)<=budget.budget_bytes
 and not exists(select 1 from unnest(array[p.user_id,ci.source_uploader_id,ci.source_captured_owner_id]) actor where
  not exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id and a.enabled where e.user_id=actor and e.enabled)
  or exists(select 1 from maintenance_private.account_deletion_requests j where j.user_id=actor and j.state<>'complete'))
 and (exists(select 1 from public.homes x where x.id=dest.home_id and x.owner_id is not null and x.owner_id<>p.user_id)
  or exists(select 1 from public.home_members m where m."homeId"=dest.home_id and m.user_id<>p.user_id))
 -- An independently recorded household judgment must not be overridden by
 -- source inheritance, including a later needs-review decision.
 and not exists(select 1 from maintenance_private.closure_household_file_decisions d where d.review_request_id=p.review_request_id and d.user_id=p.user_id and d.app_epoch_id=p.app_epoch_id and d.attachment_id=target_file);
$$;

create or replace function maintenance_private.observe_closure_coverage(target_plan uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 with plan as (select * from maintenance_private.closure_coverage_plans where plan_id=target_plan),
 live as materialized(select l.* from plan p cross join lateral maintenance_private.closure_coverage_live(p.review_request_id,p.user_id,p.app_epoch_id) l),
 captured as materialized(select * from maintenance_private.closure_coverage_items where plan_id=target_plan),
 matched as (
  select c.*,l.file_state,l.write_state,l.removal_pending,l.sha256,l.size_bytes,
   coalesce(t.event_id,d.decision_id,hd.decision_id,(prepared.receipt->>'sourceDecisionID')::uuid) decision_id,prepared.receipt prepared_copy,
   case when c.kind='scope' then true
    when c.kind='text' then t.action='retain_reviewed' and t.account_content_reviewed and t.operator_principal=p.operator_principal
    when c.kind='personal_file' then d.action in('erase_personal_file','retain_family_copy') and d.operator_principal=p.operator_principal
     and f.metadata_digest=c.content_digest and f.sha256=l.sha256 and f.size_bytes=l.size_bytes
     and l.file_state='stored' and l.write_state='settled' and not l.removal_pending
     and (d.action<>'retain_family_copy' or d.account_content_reviewed)
     and (d.action<>'retain_family_copy' or exists(select 1 from public.homes h where h.id=c.home_id and h.owner_id is not null and h.owner_id<>p.user_id) or exists(select 1 from public.home_members m where m."homeId"=c.home_id and m.user_id<>p.user_id))
    when c.kind='household_file' and l.file_state='staged' then prepared.receipt is not null
    when c.kind='household_file' then hd.action in('erase_personal_file','retain_household_file') and hd.operator_principal=p.operator_principal
     and hf.metadata_digest=c.content_digest and hf.sha256=l.sha256 and hf.size_bytes=l.size_bytes
     and l.file_state='active' and l.write_state='settled' and not l.removal_pending
     and (hd.action<>'retain_household_file' or hd.account_content_reviewed)
     and (hd.action<>'retain_household_file' or exists(select 1 from public.homes h where h.id=c.home_id and h.owner_id is not null and h.owner_id<>p.user_id) or exists(select 1 from public.home_members m where m."homeId"=c.home_id and m.user_id<>p.user_id))
    else false end resolved
  from captured c cross join plan p left join live l on l.item_key=c.item_key
  left join lateral(select * from maintenance_private.closure_coverage_text_decisions t where t.plan_id=target_plan and t.item_key=c.item_key order by event_sequence desc limit 1) t on c.kind='text'
  left join lateral(select * from maintenance_private.closure_file_decisions d where d.review_request_id=p.review_request_id and d.user_id=p.user_id and d.app_epoch_id=p.app_epoch_id and d.attachment_id=c.record_id order by decision_sequence desc limit 1) d on c.kind='personal_file'
  left join maintenance_private.closure_file_inspections f on f.inspection_id=d.inspection_id
  left join lateral(select * from maintenance_private.closure_household_file_decisions d where d.review_request_id=p.review_request_id and d.user_id=p.user_id and d.app_epoch_id=p.app_epoch_id and d.attachment_id=c.record_id order by decision_sequence desc limit 1) hd on c.kind='household_file'
  left join maintenance_private.closure_household_file_inspections hf on hf.inspection_id=hd.inspection_id
  left join lateral(select maintenance_private.prepared_household_copy_for_coverage(target_plan,c.record_id) receipt) prepared on c.kind='household_file' and l.file_state='staged'
 ), differences as (
  select 1 from live l full join captured c on c.item_key=l.item_key
  where l.item_key is null or c.item_key is null or row(l.kind,l.home_id,l.home_instance_id,l.record_id,l.relation_name,l.field_name,l.content_digest)
   is distinct from row(c.kind,c.home_id,c.home_instance_id,c.record_id,c.relation_name,c.field_name,c.content_digest)
 )
 select jsonb_build_object('current',not exists(select 1 from differences) and (select count(*) from captured)=(select item_count from plan),
  'unresolvedCount',(select count(*) from matched where resolved is not true),
  'bindings',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'key',item_key,'digest',content_digest,'decisionID',decision_id,'accountContentReviewVersion',1)||case when prepared_copy is null then '{}'::jsonb else jsonb_build_object('preparedCopy',prepared_copy) end order by item_key collate "C") from matched),'[]'::jsonb));
$$;
commit;
