-- Dormant private coordinator for typed source I/O and durable API-absence facts.
-- No source metadata erase, capacity release, journal minimization or completion.
begin;
do $$begin if not exists(select 1 from pg_roles where rolname='ouchi_retirement_file_executor') then create role ouchi_retirement_file_executor nologin;end if;end$$;
grant usage on schema maintenance_private to ouchi_retirement_file_executor;
create table maintenance_private.retirement_file_principals(principal name primary key,enabled boolean not null default false);
alter table maintenance_private.retirement_file_principals enable row level security;
revoke all on maintenance_private.retirement_file_principals from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
alter table maintenance_private.reviewed_retirement_files add column cleanup_fingerprint text check(cleanup_fingerprint ~ '^[0-9a-f]{64}$');
-- Older pending rows deliberately remain NULL: no retrospective approval.
create function maintenance_private.retirement_file_fingerprint(target_kind text,target_file uuid) returns text
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(source::text,'UTF8')),'hex') from (
 select jsonb_build_object('attachment',to_jsonb(a),'homeID',p."homeId",'homeInstanceID',i.instance_id,'writeAttempt',to_jsonb(w)) source
 from maintenance_private.product_attachments a left join public.products p on p.id=a.product_id left join maintenance_private.closure_home_instances i on i.home_id=p."homeId" left join maintenance_private.attachment_write_attempts w on w.attachment_id=a.id
 where target_kind='personal_file' and a.id=target_file
 union all
 select jsonb_build_object('attachment',to_jsonb(a),'homeInstanceID',i.instance_id,'originProof',to_jsonb(o))
 from maintenance_private.household_attachments a join public.products p on p.id=a.product_id and p."homeId"=a.home_id join maintenance_private.closure_home_instances i on i.home_id=a.home_id and i.instance_id=a.home_instance_id join maintenance_private.household_attachment_origins o on o.attachment_id=a.id
 where target_kind='household_file' and a.id=target_file) sources;
$$;
revoke all on function maintenance_private.retirement_file_fingerprint(text,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
create function maintenance_private.capture_retirement_cleanup_fingerprints() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.state='retirement_queued' and old.state is distinct from new.state then
  -- This transition is last in the checked retirement transaction; its coarse
  -- source/writer/product/home locks are still held after planned flag changes.
  update maintenance_private.reviewed_retirement_files f set cleanup_fingerprint=maintenance_private.retirement_file_fingerprint(f.kind,f.attachment_id)
  from maintenance_private.reviewed_retirements r where r.review_request_id=new.review_request_id and f.request_id=r.deletion_request_id and f.state='pending' and f.cleanup_fingerprint is null;
  if exists(select 1 from maintenance_private.reviewed_retirement_files f join maintenance_private.reviewed_retirements r on r.deletion_request_id=f.request_id where r.review_request_id=new.review_request_id and f.state='pending' and f.cleanup_fingerprint is null) then raise exception 'Complete cleanup fingerprint required';end if;
 end if;return new;
end;$$;
revoke all on function maintenance_private.capture_retirement_cleanup_fingerprints() from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
create trigger retirement_cleanup_fingerprints after update of state on maintenance_private.account_closure_reviews for each row execute function maintenance_private.capture_retirement_cleanup_fingerprints();
create function maintenance_private.protect_reviewed_household_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from maintenance_private.reviewed_retirement_files where kind='household_file' and attachment_id=old.id and state='pending') then
  if tg_op='DELETE' then raise exception 'Reviewed household source cleanup must be confirmed';end if;
  if to_jsonb(new)-array['removal_pending','object_path'] is distinct from to_jsonb(old)-array['removal_pending','object_path'] or(old.removal_pending and not new.removal_pending) then raise exception 'Reviewed household source cleanup must be confirmed';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function maintenance_private.protect_reviewed_household_source() from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
create trigger retirement_household_source before update or delete on maintenance_private.household_attachments for each row execute function maintenance_private.protect_reviewed_household_source();
create table maintenance_private.retirement_file_absence_observations(
 request_id uuid not null,kind text not null,attachment_id uuid not null,cleanup_fingerprint text not null check(cleanup_fingerprint ~ '^[0-9a-f]{64}$'),
 delete_acknowledged boolean not null,observed_at timestamptz not null default clock_timestamp(),
 primary key(request_id,kind,attachment_id),foreign key(request_id,kind,attachment_id) references maintenance_private.reviewed_retirement_files(request_id,kind,attachment_id) on delete cascade
);
alter table maintenance_private.retirement_file_absence_observations enable row level security;
revoke all on maintenance_private.retirement_file_absence_observations from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;

create function maintenance_private.lock_reviewed_file_cleanup(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid,target_kind text,target_file uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f maintenance_private.reviewed_retirement_files;a maintenance_private.product_attachments;h maintenance_private.household_attachments;dest maintenance_private.household_attachments;origin maintenance_private.household_attachment_origins;ci maintenance_private.household_copy_intents;manifest jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh cleanup transaction required';end if;
 perform 1 from maintenance_private.retirement_file_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized cleanup connection required';end if;
 if target_request is null or target_user is null or target_epoch is null or target_lease is null or target_file is null or target_kind is null or target_kind not in('personal_file','household_file') then raise exception 'Exact typed cleanup required';end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.reviewed_retirement_policy where id=1 and enabled and writer_coverage_verified and attachments_enabled for share;
 if not found or to_regclass('maintenance_private.household_write_routes') is not null then raise exception 'Reviewed cleanup unavailable';end if;
 perform 1 from maintenance_private.account_deletion_requests r join maintenance_private.reviewed_retirements reviewed on reviewed.deletion_request_id=r.id and reviewed.user_id=r.user_id and reviewed.app_epoch_id=r.app_epoch_id
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch and r.lease_token=target_lease and r.state='running' and r.lease_until>clock_timestamp()
 and exists(select 1 from maintenance_private.app_epochs e where e.user_id=target_user and e.epoch_id=target_epoch and not e.enabled)
 and not exists(select 1 from maintenance_private.app_epochs e where e.user_id=target_user and (e.enabled or e.epoch_id<>target_epoch))
 and exists(select 1 from maintenance_private.account_access e where e.user_id=target_user and not e.enabled)
 and exists(select 1 from maintenance_private.account_closure_reviews c where c.review_request_id=reviewed.review_request_id and c.state='retirement_queued') for update of r;
 if not found then raise exception 'Current reviewed cleanup lease required';end if;
 if exists(select 1 from maintenance_private.household_copy_intents c where c.state<>'completed' and (c.user_id=target_user or c.source_uploader_id=target_user or c.source_captured_owner_id=target_user)
 and not exists(select 1 from maintenance_private.reviewed_retirement_files q join maintenance_private.household_copy_writes w on w.intent_id=c.intent_id and w.phase='acknowledged' where q.request_id=target_request and q.copy_intent_id=c.intent_id and q.state='pending' and q.action='move_to_household' and c.state='copy_verified')) then raise exception 'Other pending writer requires reconciliation';end if;
 select * into f from maintenance_private.reviewed_retirement_files where request_id=target_request and kind=target_kind and attachment_id=target_file and state='pending' for update;
 if not found or f.cleanup_fingerprint is null then raise exception 'Pinned pending cleanup file required';end if;
 if target_kind='personal_file' then
  select * into a from maintenance_private.product_attachments where id=target_file for update;
  if not found or a.object_path is distinct from f.object_path or a.user_id is distinct from f.uploader_id or a.app_epoch_id is distinct from f.uploader_epoch or a.size_bytes<>f.size_bytes or a.mime<>f.mime or a.sha256 is distinct from f.sha256 or a.state<>'stored' then raise exception 'Exact cleanup source required';end if;
  perform 1 from maintenance_private.attachment_write_attempts where attachment_id=a.id and uploader_id=a.user_id and owner_id=a.captured_owner_id and app_epoch_id=a.app_epoch_id and state='settled' for update;
  if not found or not maintenance_private.attachment_write_is_quiet(a.id) then raise exception 'Quiet matching source writer required';end if;
  perform 1 from public.products where id=a.product_id for share;
 else
  select * into h from maintenance_private.household_attachments where id=target_file for update;
  if not found or h.state<>'active' or not h.removal_pending or h.object_path is distinct from f.object_path or h.size_bytes<>f.size_bytes or h.mime<>f.mime or h.sha256 is distinct from f.sha256 then raise exception 'Exact household cleanup source required';end if;
  perform 1 from maintenance_private.household_attachment_origins where attachment_id=h.id and home_instance_id=h.home_instance_id and size_bytes=h.size_bytes and mime=h.mime and sha256=h.sha256 for share;
  if not found then raise exception 'Quiet household origin required';end if;
  perform 1 from public.products where id=h.product_id for share;
 end if;
 if f.home_id is not null then
  perform 1 from maintenance_private.closure_home_instances where home_id=f.home_id and instance_id=f.home_instance_id for share;
  if not found then raise exception 'Current cleanup home incarnation required';end if;
 end if;
 if maintenance_private.retirement_file_fingerprint(target_kind,target_file) is distinct from f.cleanup_fingerprint then raise exception 'Cleanup source fingerprint changed';end if;
 perform 1 from maintenance_private.attachment_app_budget_policy where id=1 and enabled and writer_coverage_verified for share;
 if not found or not exists(select 1 from maintenance_private.attachment_capacity_claims where object_path=f.object_path and size_bytes=f.size_bytes and ((target_kind='personal_file' and purpose in('upload','transfer-copy')) or(target_kind='household_file' and purpose='household-copy'))) then raise exception 'Held cleanup source capacity required';end if;
 manifest:=jsonb_build_object('requestID',target_request,'kind',target_kind,'homeInstanceID',f.home_instance_id,'source',jsonb_build_object('attachmentID',f.attachment_id,'objectPath',f.object_path,'sizeBytes',f.size_bytes,'mime',f.mime,'sha256',f.sha256));
 if target_kind='personal_file' then manifest:=jsonb_set(manifest,'{source}',manifest->'source'||jsonb_build_object('uploaderID',f.uploader_id,'uploaderEpoch',f.uploader_epoch));end if;
 if f.action='move_to_household' then
  select * into ci from maintenance_private.household_copy_intents where intent_id=f.copy_intent_id and source_attachment_id=f.attachment_id and household_attachment_id=f.retained_asset_id and state='copy_verified' for update;
  if not found then raise exception 'Matching retained copy intent required';end if;
  perform 1 from maintenance_private.household_copy_writes where intent_id=ci.intent_id and phase='acknowledged' for share;
  if not found then raise exception 'Acknowledged retained writer required';end if;
  select * into dest from maintenance_private.household_attachments where id=f.retained_asset_id and state='active' and not removal_pending for update;
  if not found or dest.home_instance_id is distinct from f.home_instance_id or dest.size_bytes<>f.size_bytes or dest.mime<>f.mime or dest.sha256<>f.sha256 then raise exception 'Exact retained destination required';end if;
  select * into origin from maintenance_private.household_attachment_origins where attachment_id=dest.id and home_instance_id=dest.home_instance_id and size_bytes=dest.size_bytes and mime=dest.mime and sha256=dest.sha256 for share;
  if not found or not exists(select 1 from maintenance_private.household_copy_writes where intent_id=ci.intent_id and attempt_id=origin.write_receipt_id and phase='acknowledged') or not exists(select 1 from maintenance_private.attachment_capacity_claims where claim_id=ci.capacity_claim_id and object_path=dest.object_path and size_bytes=dest.size_bytes) then raise exception 'Verified accounted retained origin required';end if;
  manifest:=manifest||jsonb_build_object('retained',jsonb_build_object('attachmentID',dest.id,'objectPath',dest.object_path,'sizeBytes',dest.size_bytes,'mime',dest.mime,'sha256',dest.sha256));
 end if;
 return jsonb_build_object('manifest',manifest,'fingerprint',f.cleanup_fingerprint);
end;$$;
revoke all on function maintenance_private.lock_reviewed_file_cleanup(uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;
grant execute on function maintenance_private.lock_reviewed_file_cleanup(uuid,uuid,uuid,uuid,text,uuid) to ouchi_retirement_file_executor;

create function maintenance_private.read_reviewed_file_absence(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid,target_kind text,target_file uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pinned jsonb;observation maintenance_private.retirement_file_absence_observations;
begin
 pinned:=maintenance_private.lock_reviewed_file_cleanup(target_request,target_user,target_epoch,target_lease,target_kind,target_file);
 select * into observation from maintenance_private.retirement_file_absence_observations where request_id=target_request and kind=target_kind and attachment_id=target_file;
 if not found then return null;end if;
 if observation.cleanup_fingerprint is distinct from pinned->>'fingerprint' then raise exception 'Cleanup observation fingerprint changed';end if;
 return jsonb_build_object('kind','reviewed-file-absence/v1','requestID',target_request,'userID',target_user,'epochID',target_epoch,'fileKind',target_kind,'fileID',target_file,'sourceAbsenceObserved',true,'deleteAcknowledged',observation.delete_acknowledged,'capacityReleaseAuthorized',false,'accountErasureConfirmed',false);
end;$$;
revoke all on function maintenance_private.read_reviewed_file_absence(uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;
grant execute on function maintenance_private.read_reviewed_file_absence(uuid,uuid,uuid,uuid,text,uuid) to ouchi_retirement_file_executor;
create function maintenance_private.record_reviewed_file_absence(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid,target_kind text,target_file uuid,expected_fingerprint text,observed_delete_ack boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pinned jsonb;
begin
 pinned:=maintenance_private.lock_reviewed_file_cleanup(target_request,target_user,target_epoch,target_lease,target_kind,target_file);
 if expected_fingerprint is null or expected_fingerprint is distinct from pinned->>'fingerprint' or observed_delete_ack is null then raise exception 'Exact bounded Storage observation required';end if;
 insert into maintenance_private.retirement_file_absence_observations(request_id,kind,attachment_id,cleanup_fingerprint,delete_acknowledged) values(target_request,target_kind,target_file,expected_fingerprint,observed_delete_ack) on conflict do nothing;
 return maintenance_private.read_reviewed_file_absence(target_request,target_user,target_epoch,target_lease,target_kind,target_file);
end;$$;
revoke all on function maintenance_private.record_reviewed_file_absence(uuid,uuid,uuid,uuid,text,uuid,text,boolean) from public,anon,authenticated,service_role,ouchi_closure_operator;
grant execute on function maintenance_private.record_reviewed_file_absence(uuid,uuid,uuid,uuid,text,uuid,text,boolean) to ouchi_retirement_file_executor;
commit;
