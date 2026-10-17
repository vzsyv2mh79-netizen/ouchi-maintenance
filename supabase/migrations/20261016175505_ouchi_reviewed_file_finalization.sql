-- Local dormant finalizer. API absence is not physical GC proof. Move held
-- capacity to an opaque, non-account-linked quarantine WITHOUT recovering bytes.
begin;
create table maintenance_private.attachment_capacity_quarantine(
 hold_id uuid primary key default gen_random_uuid(),size_bytes bigint not null check(size_bytes between 1 and 5242880)
);
alter table maintenance_private.attachment_capacity_quarantine enable row level security;
revoke all on maintenance_private.attachment_capacity_quarantine from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
create table maintenance_private.retirement_capacity_moves(
 request_id uuid not null,kind text not null,attachment_id uuid not null,
 claim_id uuid not null unique,hold_id uuid not null unique,size_bytes bigint not null,object_path_digest text not null,cleanup_fingerprint text not null,
 primary key(request_id,kind,attachment_id),foreign key(request_id,kind,attachment_id) references maintenance_private.reviewed_retirement_files(request_id,kind,attachment_id) on delete cascade
);
alter table maintenance_private.retirement_capacity_moves enable row level security;
revoke all on maintenance_private.retirement_capacity_moves from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
create function maintenance_private.held_attachment_capacity_bytes() returns numeric
language sql stable security definer set search_path='' as $$
 select (select coalesce(sum(size_bytes),0) from maintenance_private.attachment_capacity_claims)+(select coalesce(sum(size_bytes),0) from maintenance_private.attachment_capacity_quarantine);
$$;
revoke all on function maintenance_private.held_attachment_capacity_bytes() from public,anon,authenticated,ouchi_closure_operator,ouchi_retirement_file_executor;
grant execute on function maintenance_private.held_attachment_capacity_bytes() to service_role;
create function maintenance_private.guard_capacity_quarantine() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Unverified physical capacity remains held';end if;
 if not exists(select 1 from maintenance_private.retirement_capacity_moves m join maintenance_private.attachment_capacity_claims c on c.claim_id=m.claim_id where m.hold_id=new.hold_id and m.size_bytes=new.size_bytes and c.size_bytes=new.size_bytes and m.object_path_digest=encode(sha256(convert_to(c.object_path,'UTF8')),'hex')) then raise exception 'Exact held-capacity move required';end if;
 return new;
end;$$;
revoke all on function maintenance_private.guard_capacity_quarantine() from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
create trigger capacity_quarantine_guard before insert or update or delete on maintenance_private.attachment_capacity_quarantine for each row execute function maintenance_private.guard_capacity_quarantine();
create trigger capacity_quarantine_no_truncate before truncate on maintenance_private.attachment_capacity_quarantine for each statement execute function maintenance_private.guard_capacity_quarantine();
create or replace function maintenance_private.guard_attachment_budget_policy() returns trigger
language plpgsql security invoker set search_path='' as $$
declare held numeric;
begin
 perform maintenance_private.lock_attachment_app_budget();
 if tg_op='DELETE' then raise exception 'Budget policy must be retained';end if;
 held:=maintenance_private.held_attachment_capacity_bytes();
 if new.budget_bytes<held then raise exception 'Held capacity exceeds proposed budget';end if;
 if new.enabled and (not new.writer_coverage_verified or new.budget_bytes=0) then raise exception 'Budget coverage unavailable';end if;return new;
end;$$;
create or replace function maintenance_private.guard_attachment_capacity_claim() returns trigger
language plpgsql security definer set search_path='' as $$
declare policy maintenance_private.attachment_app_budget_policy;held numeric;
begin
 perform maintenance_private.lock_attachment_app_budget();
 if tg_op='DELETE' then
  if not exists(select 1 from maintenance_private.retirement_capacity_moves m
   join maintenance_private.attachment_capacity_quarantine q on q.hold_id=m.hold_id and q.size_bytes=m.size_bytes
   join maintenance_private.reviewed_retirement_files f on (f.request_id,f.kind,f.attachment_id)=(m.request_id,m.kind,m.attachment_id)
   join maintenance_private.retirement_file_absence_observations o on (o.request_id,o.kind,o.attachment_id)=(m.request_id,m.kind,m.attachment_id)
   join maintenance_private.retired_attachment_ids retired on retired.attachment_id=f.attachment_id
   where m.claim_id=old.claim_id and m.size_bytes=old.size_bytes and m.object_path_digest=encode(sha256(convert_to(old.object_path,'UTF8')),'hex') and m.cleanup_fingerprint=f.cleanup_fingerprint and o.cleanup_fingerprint=f.cleanup_fingerprint and f.state='absence_confirmed') then raise exception 'Capacity claim is immutable';end if;
  return old;
 end if;
 if tg_op<>'INSERT' then raise exception 'Capacity claim is immutable';end if;
 select * into policy from maintenance_private.attachment_app_budget_policy where id=1;
 if not found or not policy.enabled or not policy.writer_coverage_verified then raise exception 'App storage budget unavailable';end if;
 held:=maintenance_private.held_attachment_capacity_bytes();
 if held+new.size_bytes>policy.budget_bytes then raise exception 'App storage budget exceeded';end if;return new;
end;$$;
-- Replacing an existing function retains its restricted EXECUTE ACL.

create function maintenance_private.require_reviewed_finalization_lease(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh finalization transaction required';end if;
 perform 1 from maintenance_private.retirement_file_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized cleanup connection required';end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests r join maintenance_private.reviewed_retirements reviewed on reviewed.deletion_request_id=r.id and reviewed.user_id=r.user_id and reviewed.app_epoch_id=r.app_epoch_id
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch and r.state='running' and r.lease_token=target_lease and r.lease_until>clock_timestamp()
 and exists(select 1 from maintenance_private.app_epochs e where e.user_id=target_user and e.epoch_id=target_epoch and not e.enabled)
 and not exists(select 1 from maintenance_private.app_epochs e where e.user_id=target_user and (e.enabled or e.epoch_id<>target_epoch))
 and exists(select 1 from maintenance_private.account_access e where e.user_id=target_user and not e.enabled) for update of r;
 if not found then raise exception 'Current reviewed finalization lease required';end if;
end;$$;
revoke all on function maintenance_private.require_reviewed_finalization_lease(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
create function maintenance_private.read_reviewed_file_finalization(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid,target_kind text,target_file uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f maintenance_private.reviewed_retirement_files;
begin
 perform maintenance_private.require_reviewed_finalization_lease(target_request,target_user,target_epoch,target_lease);
 select * into f from maintenance_private.reviewed_retirement_files where request_id=target_request and kind=target_kind and attachment_id=target_file;
 if not found then raise exception 'Exact typed finalization file required';end if;
 if f.state<>'absence_confirmed' then return null;end if;
 if not exists(select 1 from maintenance_private.retired_attachment_ids where attachment_id=target_file)
 or not exists(select 1 from maintenance_private.retirement_capacity_moves m join maintenance_private.attachment_capacity_quarantine q on q.hold_id=m.hold_id and q.size_bytes=m.size_bytes where m.request_id=target_request and m.kind=target_kind and m.attachment_id=target_file)
 or exists(select 1 from maintenance_private.product_attachments where target_kind='personal_file' and id=target_file)
 or exists(select 1 from maintenance_private.household_attachments where target_kind='household_file' and id=target_file) then raise exception 'Finalized metadata proof incomplete';end if;
 return jsonb_build_object('kind','reviewed-file-finalization/v1','requestID',target_request,'userID',target_user,'epochID',target_epoch,'fileKind',target_kind,'fileID',target_file,'sourceMetadataErased',true,'retiredIDProtected',true,'capacityBytesHeld',true,'capacityReleased',false,'accountErasureConfirmed',false);
end;$$;
revoke all on function maintenance_private.read_reviewed_file_finalization(uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;
grant execute on function maintenance_private.read_reviewed_file_finalization(uuid,uuid,uuid,uuid,text,uuid) to ouchi_retirement_file_executor;
create function maintenance_private.finalize_reviewed_file(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid,target_kind text,target_file uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior jsonb;pinned jsonb;f maintenance_private.reviewed_retirement_files;c maintenance_private.attachment_capacity_claims;intent uuid;held_id uuid:=gen_random_uuid();
begin
 -- SQL only. Never acquire global capacity lock while holding network locks.
 perform maintenance_private.lock_attachment_app_budget();
 perform maintenance_private.require_reviewed_finalization_lease(target_request,target_user,target_epoch,target_lease);
 perform maintenance_private.lock_attachment_identity(target_file);
 prior:=maintenance_private.read_reviewed_file_finalization(target_request,target_user,target_epoch,target_lease,target_kind,target_file);if prior is not null then return prior;end if;
 pinned:=maintenance_private.lock_reviewed_file_cleanup(target_request,target_user,target_epoch,target_lease,target_kind,target_file);
 if not exists(select 1 from maintenance_private.retirement_file_absence_observations where request_id=target_request and kind=target_kind and attachment_id=target_file and cleanup_fingerprint=pinned->>'fingerprint') then raise exception 'Durable exact API absence required';end if;
 select * into f from maintenance_private.reviewed_retirement_files where request_id=target_request and kind=target_kind and attachment_id=target_file;
 select * into c from maintenance_private.attachment_capacity_claims where object_path=f.object_path and size_bytes=f.size_bytes for update;
 if not found then raise exception 'Exact source capacity claim required';end if;
 if target_kind='household_file' and exists(select 1 from maintenance_private.household_copy_intents where household_attachment_id=target_file) then raise exception 'Household source copy journal requires reconciliation';end if;
 if f.copy_intent_id is not null then
  perform 1 from maintenance_private.household_copy_writes where intent_id=f.copy_intent_id for update;
  if exists(select 1 from maintenance_private.household_copy_writes where intent_id=f.copy_intent_id and phase not in('acknowledged','not_dispatched')) then raise exception 'Quiet copy journal required';end if;
 end if;
 insert into maintenance_private.retired_attachment_ids(attachment_id) values(target_file);
 intent:=f.copy_intent_id;
 update maintenance_private.reviewed_retirement_files set state='absence_confirmed',retained_asset_id=null,copy_intent_id=null where request_id=target_request and kind=target_kind and attachment_id=target_file;
 insert into maintenance_private.retirement_capacity_moves(request_id,kind,attachment_id,claim_id,hold_id,size_bytes,object_path_digest,cleanup_fingerprint) values(target_request,target_kind,target_file,c.claim_id,held_id,c.size_bytes,encode(sha256(convert_to(c.object_path,'UTF8')),'hex'),f.cleanup_fingerprint);
 insert into maintenance_private.attachment_capacity_quarantine(hold_id,size_bytes) values(held_id,c.size_bytes);
 delete from maintenance_private.attachment_capacity_claims where claim_id=c.claim_id;
 if intent is not null then
  update maintenance_private.household_copy_intents set state='completed' where intent_id=intent;
  delete from maintenance_private.household_copy_writes where intent_id=intent;
  delete from maintenance_private.household_copy_intents where intent_id=intent;
 end if;
 if target_kind='personal_file' then delete from maintenance_private.product_attachments where id=target_file;
 else delete from maintenance_private.household_attachments where id=target_file;end if;
 -- Every mutation above is one transaction. A failure rolls back tombstone,
 -- capacity move, queue transition, source erase and copy-journal minimization.
 return maintenance_private.read_reviewed_file_finalization(target_request,target_user,target_epoch,target_lease,target_kind,target_file);
end;$$;
revoke all on function maintenance_private.finalize_reviewed_file(uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;
grant execute on function maintenance_private.finalize_reviewed_file(uuid,uuid,uuid,uuid,text,uuid) to ouchi_retirement_file_executor;
commit;
