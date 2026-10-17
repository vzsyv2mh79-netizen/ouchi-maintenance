-- Dormant SQL-only custody activation and typed erasure inventory. Source
-- bytes are NOT removed and capacity is NOT released by this migration.
begin;
alter table maintenance_private.reviewed_retirement_policy add column attachments_enabled boolean not null default false;
create table maintenance_private.household_attachment_origins(
 attachment_id uuid primary key references maintenance_private.household_attachments(id) on delete cascade,
 home_instance_id uuid not null,size_bytes bigint not null check(size_bytes between 1 and 5242880),
 mime text not null check(mime in('image/jpeg','image/png','application/pdf')),sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 write_receipt_id uuid not null unique,acknowledged_at timestamptz not null,measured_at timestamptz not null,activated_at timestamptz not null default clock_timestamp(),
 check(measured_at>=acknowledged_at)
);
alter table maintenance_private.household_attachment_origins enable row level security;
revoke all on maintenance_private.household_attachment_origins from public,anon,authenticated,service_role,ouchi_closure_operator;
create table maintenance_private.reviewed_retirement_files(
 request_id uuid not null references maintenance_private.account_deletion_requests(id) on delete restrict,
 plan_id uuid not null,item_key text not null,kind text not null check(kind in('personal_file','household_file')),attachment_id uuid not null,
 action text not null check(action in('erase_personal_file','move_to_household','retain_household_file')),
 home_id uuid,home_instance_id uuid,uploader_id uuid,uploader_epoch uuid,object_path text not null,
 size_bytes bigint not null check(size_bytes between 1 and 5242880),mime text not null check(mime in('image/jpeg','image/png','application/pdf')),sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),metadata_digest text not null check(metadata_digest ~ '^[0-9a-f]{64}$'),
 retained_asset_id uuid references maintenance_private.household_attachments(id) on delete restrict,
 copy_intent_id uuid references maintenance_private.household_copy_intents(intent_id) on delete restrict,
 state text not null check(state in('pending','retained','absence_confirmed')),created_at timestamptz not null default clock_timestamp(),
 primary key(request_id,kind,attachment_id),foreign key(plan_id,item_key) references maintenance_private.closure_coverage_items(plan_id,item_key) on delete restrict,
 check((action='move_to_household' and ((retained_asset_id is not null and copy_intent_id is not null) or(state='absence_confirmed' and retained_asset_id is null and copy_intent_id is null))) or(action<>'move_to_household' and retained_asset_id is null and copy_intent_id is null)),
 check((home_id is null)=(home_instance_id is null)),
 check((kind='personal_file' and uploader_id is not null and uploader_epoch is not null and action in('erase_personal_file','move_to_household')
  and object_path=uploader_id::text||'/'||uploader_epoch::text||'/'||attachment_id::text||'.'||case mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'pdf' end)
 or(kind='household_file' and uploader_id is null and uploader_epoch is null and home_id is not null and home_instance_id is not null and action in('erase_personal_file','retain_household_file')
  and object_path='households/'||home_instance_id::text||'/'||attachment_id::text||'.'||case mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'pdf' end)),
 check((state='retained')=(action='retain_household_file'))
);
create unique index reviewed_retirement_one_file_cleanup on maintenance_private.reviewed_retirement_files(kind,attachment_id) where state='pending';
create index reviewed_retirement_retained_destination on maintenance_private.reviewed_retirement_files(retained_asset_id) where state='pending';
alter table maintenance_private.reviewed_retirement_files enable row level security;
revoke all on maintenance_private.reviewed_retirement_files from public,anon,authenticated,service_role,ouchi_closure_operator;
grant select on maintenance_private.reviewed_retirement_files to service_role;

create function maintenance_private.protect_retirement_retained_destination() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from maintenance_private.reviewed_retirement_files where retained_asset_id=old.id and state='pending') then
  if tg_op='DELETE' then raise exception 'Retained destination cleanup dependency';end if;
  if new.state<>'active' or new.removal_pending then raise exception 'Retained destination cleanup dependency';end if;
  if old.state<>'active' and not exists(select 1 from maintenance_private.household_attachment_origins o where o.attachment_id=new.id and o.home_instance_id=new.home_instance_id and o.size_bytes=new.size_bytes and o.mime=new.mime and o.sha256=new.sha256) then raise exception 'Verified household origin required';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function maintenance_private.protect_retirement_retained_destination() from public,anon,authenticated,service_role,ouchi_closure_operator;
create trigger retirement_retained_destination before update or delete on maintenance_private.household_attachments for each row execute function maintenance_private.protect_retirement_retained_destination();

create function maintenance_private.protect_retirement_source_metadata() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from maintenance_private.reviewed_retirement_files where kind='personal_file' and attachment_id=old.id and state='pending') then
  if tg_op='DELETE' then raise exception 'Reviewed source cleanup must be confirmed';end if;
  if to_jsonb(new)-array['removal_pending','removal_requested_at','object_path'] is distinct from to_jsonb(old)-array['removal_pending','removal_requested_at','object_path'] or(old.removal_pending and not new.removal_pending) then raise exception 'Reviewed source cleanup must be confirmed';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function maintenance_private.protect_retirement_source_metadata() from public,anon,authenticated,service_role,ouchi_closure_operator;
create trigger retirement_source_metadata before update or delete on maintenance_private.product_attachments for each row execute function maintenance_private.protect_retirement_source_metadata();

-- The parent validates the exact sealed bindings while all source/capacity
-- writers are locked, BEFORE inserting its job. Consume those pinned bindings
-- here; re-running admission afterward would mistake our own job for a rival.
-- Internal helper called ONLY by the locked/sealed retirement transaction.
-- No independently callable activation or inventory writer is granted.
create function maintenance_private.stage_reviewed_retirement_files(target_request uuid,target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare item record;prepared jsonb;ci maintenance_private.household_copy_intents;dest maintenance_private.household_attachments;writer maintenance_private.household_copy_writes;d maintenance_private.closure_file_decisions;hd maintenance_private.closure_household_file_decisions;
begin
 for item in select c.*,l.file_state,l.write_state,l.removal_pending,l.sha256,l.size_bytes
  from maintenance_private.closure_coverage_items c join maintenance_private.closure_coverage_live(target_review,target_user,target_epoch) l on l.item_key=c.item_key
  where c.plan_id=target_plan and c.kind in('personal_file','household_file') order by c.item_key collate "C" loop
  if item.kind='personal_file' then
   select * into d from maintenance_private.closure_file_decisions where review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and attachment_id=item.record_id order by decision_sequence desc limit 1;
   if not found or d.action not in('erase_personal_file','retain_family_copy') then raise exception 'Current reviewed personal file required';end if;
   if d.action='retain_family_copy' then
    select * into ci from maintenance_private.household_copy_intents where source_attachment_id=item.record_id;
    if not found then raise exception 'Verified prepared family copy required';end if;
    select b->'preparedCopy' into prepared from maintenance_private.closure_coverage_plans p cross join lateral jsonb_array_elements(p.bindings) b where p.plan_id=target_plan and p.operator_principal=session_user and p.state='sealed' and b->>'key'='household_file:'||ci.household_attachment_id::text;
    if prepared is null or prepared->>'sourceDecisionID'<>d.decision_id::text then raise exception 'Verified prepared family copy required';end if;
    select * into dest from maintenance_private.household_attachments where id=ci.household_attachment_id;
    select * into writer from maintenance_private.household_copy_writes where attempt_id=(prepared->>'writeAttemptID')::uuid and phase='acknowledged';
    if not found then raise exception 'Acknowledged family copy required';end if;
    insert into maintenance_private.household_attachment_origins(attachment_id,home_instance_id,size_bytes,mime,sha256,write_receipt_id,acknowledged_at,measured_at)
     values(dest.id,dest.home_instance_id,dest.size_bytes,dest.mime,dest.sha256,writer.attempt_id,writer.acknowledged_at,ci.copied_at);
    insert into maintenance_private.reviewed_retirement_files(request_id,plan_id,item_key,kind,attachment_id,action,home_id,home_instance_id,uploader_id,uploader_epoch,object_path,size_bytes,mime,sha256,metadata_digest,retained_asset_id,copy_intent_id,state)
     select target_request,target_plan,item.item_key,'personal_file',a.id,'move_to_household',item.home_id,item.home_instance_id,a.user_id,a.app_epoch_id,a.object_path,a.size_bytes,a.mime,a.sha256,item.content_digest,dest.id,ci.intent_id,'pending' from maintenance_private.product_attachments a where a.id=item.record_id;
    update maintenance_private.household_attachments set state='active' where id=dest.id;
   else
    insert into maintenance_private.reviewed_retirement_files(request_id,plan_id,item_key,kind,attachment_id,action,home_id,home_instance_id,uploader_id,uploader_epoch,object_path,size_bytes,mime,sha256,metadata_digest,state)
     select target_request,target_plan,item.item_key,'personal_file',a.id,'erase_personal_file',item.home_id,item.home_instance_id,a.user_id,a.app_epoch_id,a.object_path,a.size_bytes,a.mime,a.sha256,item.content_digest,'pending' from maintenance_private.product_attachments a where a.id=item.record_id;
    update maintenance_private.product_attachments set removal_pending=true where id=item.record_id;
   end if;
  else
   select * into dest from maintenance_private.household_attachments where id=item.record_id;
   -- Prepared copies may already have been activated by their preceding source
   -- item. Existing household files need their own current review decision.
   if exists(select 1 from maintenance_private.reviewed_retirement_files where request_id=target_request and retained_asset_id=dest.id and action='move_to_household') then
    insert into maintenance_private.reviewed_retirement_files(request_id,plan_id,item_key,kind,attachment_id,action,home_id,home_instance_id,object_path,size_bytes,mime,sha256,metadata_digest,state)
     values(target_request,target_plan,item.item_key,'household_file',dest.id,'retain_household_file',dest.home_id,dest.home_instance_id,dest.object_path,dest.size_bytes,dest.mime,dest.sha256,item.content_digest,'retained');
   else
    -- personal_file sorts after household_file; defer a prepared clone until
    -- its source has been processed, then add its retained row in a second pass.
    select b->'preparedCopy' into prepared from maintenance_private.closure_coverage_plans p cross join lateral jsonb_array_elements(p.bindings) b where p.plan_id=target_plan and p.operator_principal=session_user and p.state='sealed' and b->>'key'='household_file:'||dest.id::text;
    if prepared is not null then continue;end if;
    if not exists(select 1 from maintenance_private.household_attachment_origins o where o.attachment_id=dest.id and o.home_instance_id=dest.home_instance_id and o.size_bytes=dest.size_bytes and o.mime=dest.mime and o.sha256=dest.sha256) then raise exception 'Established household origin proof required';end if;
    if not exists(select 1 from maintenance_private.attachment_capacity_claims c where c.object_path=dest.object_path and c.size_bytes=dest.size_bytes and c.purpose='household-copy') then raise exception 'Accounted household custody required';end if;
    select * into hd from maintenance_private.closure_household_file_decisions where review_request_id=target_review and user_id=target_user and app_epoch_id=target_epoch and attachment_id=dest.id order by decision_sequence desc limit 1;
    if not found or hd.action not in('erase_personal_file','retain_household_file') then raise exception 'Current reviewed household file required';end if;
    insert into maintenance_private.reviewed_retirement_files(request_id,plan_id,item_key,kind,attachment_id,action,home_id,home_instance_id,object_path,size_bytes,mime,sha256,metadata_digest,state)
     values(target_request,target_plan,item.item_key,'household_file',dest.id,hd.action,dest.home_id,dest.home_instance_id,dest.object_path,dest.size_bytes,dest.mime,dest.sha256,item.content_digest,case when hd.action='retain_household_file' then 'retained' else 'pending' end);
    if hd.action='erase_personal_file' then update maintenance_private.household_attachments set removal_pending=true where id=dest.id;end if;
   end if;
  end if;
 end loop;
 insert into maintenance_private.reviewed_retirement_files(request_id,plan_id,item_key,kind,attachment_id,action,home_id,home_instance_id,object_path,size_bytes,mime,sha256,metadata_digest,state)
 select target_request,target_plan,c.item_key,'household_file',h.id,'retain_household_file',h.home_id,h.home_instance_id,h.object_path,h.size_bytes,h.mime,h.sha256,c.content_digest,'retained'
 from maintenance_private.closure_coverage_items c join maintenance_private.household_attachments h on h.id=c.record_id
 where c.plan_id=target_plan and c.kind='household_file' and exists(select 1 from maintenance_private.reviewed_retirement_files f where f.request_id=target_request and f.retained_asset_id=h.id and f.action='move_to_household')
 on conflict(request_id,kind,attachment_id) do nothing;
 if (select count(*) from maintenance_private.reviewed_retirement_files where request_id=target_request)<>(select count(*) from maintenance_private.closure_coverage_items where plan_id=target_plan and kind in('personal_file','household_file')) then raise exception 'Complete typed file inventory required';end if;
 if exists(select 1 from maintenance_private.household_copy_intents pending_copy where pending_copy.state<>'completed' and (pending_copy.user_id=target_user or pending_copy.source_uploader_id=target_user or pending_copy.source_captured_owner_id=target_user)
  and not exists(select 1 from maintenance_private.reviewed_retirement_files f where f.request_id=target_request and f.copy_intent_id=pending_copy.intent_id and f.action='move_to_household')) then raise exception 'Other pending copy requires reconciliation';end if;
end;$$;
revoke all on function maintenance_private.stage_reviewed_retirement_files(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;
create or replace function maintenance_private.closure_review_household_files(target_review uuid,target_user uuid,target_epoch uuid)
returns table(attachment_id uuid,home_id uuid,home_instance_id uuid,product_id uuid,size_bytes bigint,mime text,file_state text,write_state text,removal_pending boolean,metadata_digest text,descriptor jsonb)
language sql stable security invoker set search_path='' as $$
 with scoped_homes as (
  select h.id from public.homes h where h.owner_id=target_user
  union select m."homeId" from public.home_members m where m.user_id=target_user
  union select e.home_id from maintenance_private.closure_legacy_home_events e
   where e.review_request_id=target_review and e.user_id=target_user and e.app_epoch_id=target_epoch
   and maintenance_private.closure_legacy_home_context_is_current(target_review,target_user,target_epoch,e.home_id)
 ), candidates as (
  select f.*,case when origin.attachment_id is not null or w.phase='acknowledged' then 'settled' when w.phase='issued' then 'started' else 'untracked' end as current_write_state,
   case when origin.attachment_id is not null then jsonb_build_object('attachment',to_jsonb(f),'homeInstanceID',h.instance_id,'originProof',to_jsonb(origin)) else jsonb_build_object('attachment',to_jsonb(f),'homeInstanceID',h.instance_id,
    'copyIntentID',c.intent_id,'copyState',c.state,'copyVerifiedAt',c.copied_at,
    'writeAttemptID',w.attempt_id,'writerPhase',w.phase,'acknowledgedAt',w.acknowledged_at) end as source
  from maintenance_private.household_attachments f
  join maintenance_private.closure_home_instances h on h.home_id=f.home_id and h.instance_id=f.home_instance_id
  join public.products p on p.id=f.product_id and p."homeId"=f.home_id
  left join maintenance_private.household_copy_intents c on c.household_attachment_id=f.id
  left join maintenance_private.household_copy_writes w on w.intent_id=c.intent_id and w.phase<>'not_dispatched'
  left join maintenance_private.household_attachment_origins origin on origin.attachment_id=f.id and origin.home_instance_id=f.home_instance_id and origin.size_bytes=f.size_bytes and origin.mime=f.mime and origin.sha256=f.sha256
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
create or replace function maintenance_private.execute_reviewed_retirement(target_event uuid,target_plan uuid,target_review uuid,target_user uuid,target_epoch uuid,target_seal uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p maintenance_private.closure_coverage_plans;o jsonb;prior jsonb;detached integer;departed integer;
begin
 perform 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized operator connection required';end if;
 if target_event is null or target_event='00000000-0000-0000-0000-000000000000'::uuid or target_seal is null then raise exception 'Explicit retirement identity required';end if;
 perform maintenance_private.lock_attachment_app_budget();
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 prior:=maintenance_private.read_reviewed_retirement(target_event,target_plan,target_review,target_user,target_epoch,target_seal);
 if prior is not null then return prior;end if;
 if exists(select 1 from maintenance_private.reviewed_retirements where event_id=target_event or(user_id=target_user and app_epoch_id=target_epoch)) then raise exception 'Retirement event conflict';end if;
 perform 1 from maintenance_private.reviewed_retirement_policy where id=1 and enabled and writer_coverage_verified for share;
 if not found then raise exception 'Reviewed retirement unavailable';end if;
 if to_regclass('maintenance_private.household_write_routes') is not null then raise exception 'Shared retirement contract upgrade required';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh retirement transaction required';end if;
 -- Deliberately coarse MVP gate, Ouchi tables only. Prevents all set/row
 -- phantoms while rechecking and detaching. No Storage/network call may occur
 -- inside this transaction. Backend enforces 1s lock/4.5s statement deadlines.
 lock table public.homes,public.home_members,public.home_invites,public.products,public.maintenance_tasks,public.maintenance_history,public.maintenance_imports,public.maintenance_backup_restores,public.maintenance_push_subscriptions,public.maintenance_push_test_limits,
 maintenance_private.product_attachments,maintenance_private.attachment_write_attempts,maintenance_private.household_attachments,
 maintenance_private.household_copy_intents,maintenance_private.household_copy_writes,maintenance_private.closure_legacy_home_events,
 maintenance_private.closure_file_inspections,maintenance_private.closure_file_decisions,maintenance_private.closure_household_file_inspections,maintenance_private.closure_household_file_decisions,
 maintenance_private.closure_coverage_text_decisions,maintenance_private.closure_coverage_redactions,maintenance_private.account_closure_reviews,
 maintenance_private.account_access,maintenance_private.app_epochs,maintenance_private.app_session_epochs,maintenance_private.attachment_app_budget_policy,maintenance_private.attachment_capacity_claims,maintenance_private.household_attachment_origins,maintenance_private.reviewed_retirement_files in share row exclusive mode;
 p:=maintenance_private.require_closure_coverage_plan(target_plan,target_review,target_user,target_epoch);
 if p.state<>'sealed' or p.seal_event_id is distinct from target_seal then raise exception 'Exact sealed review required';end if;
 o:=maintenance_private.observe_closure_coverage(target_plan);
 if (o->>'current')::boolean is not true or (o->>'unresolvedCount')::integer<>0 or p.bindings is distinct from o->'bindings' then raise exception 'Sealed review changed';end if;
 if exists(select 1 from maintenance_private.closure_coverage_items where plan_id=target_plan and kind in('personal_file','household_file'))
 and not exists(select 1 from maintenance_private.reviewed_retirement_policy where id=1 and attachments_enabled) then raise exception 'Attachment retirement executor required';end if;
 if not exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 or not exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled) then raise exception 'Current explicit app enrollment required';end if;
 -- Allocate job first so every file disposition has a real scoped parent.
 insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,inventory_captured) values(target_event,target_user,target_epoch,true);
 perform maintenance_private.stage_reviewed_retirement_files(target_event,target_plan,target_review,target_user,target_epoch);
 -- Shared homes survive with no designated recipient. Unshared homes remain
 -- owned by the closed actor for the existing scoped erasure worker to remove.
 update public.home_invites v set revoked=true from public.homes h where v."homeId"=h.id and h.owner_id=target_user and exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id<>target_user);
 update public.homes h set owner_id=null where h.owner_id=target_user and exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id<>target_user);
 get diagnostics detached=row_count;
 delete from public.home_members where user_id=target_user;get diagnostics departed=row_count;
 update maintenance_private.account_access set enabled=false where user_id=target_user;
 update maintenance_private.app_epochs set enabled=false where user_id=target_user and epoch_id=target_epoch;
 insert into maintenance_private.reviewed_retirements(event_id,review_request_id,plan_id,seal_event_id,user_id,app_epoch_id,operator_principal,deletion_request_id,detached_home_count,departed_membership_count)
 values(target_event,target_review,target_plan,target_seal,target_user,target_epoch,session_user,target_event,detached,departed);
 update maintenance_private.account_closure_reviews set state='retirement_queued' where review_request_id=target_review;
 return maintenance_private.read_reviewed_retirement(target_event,target_plan,target_review,target_user,target_epoch,target_seal);
end;$$;
create or replace function public.erase_reviewed_retirement_metadata(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request and user_id=target_user and app_epoch_id=target_epoch and records_erased and inventory_captured for update;
 if not found or not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false;end if;
 if exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from public.homes where owner_id=target_user) or exists(select 1 from public.home_members where user_id=target_user)
 or exists(select 1 from maintenance_private.household_copy_intents where user_id=target_user or source_uploader_id=target_user or source_captured_owner_id=target_user) then return false;end if;
 if exists(select 1 from maintenance_private.reviewed_retirement_files f join maintenance_private.account_deletion_requests j on j.id=f.request_id where j.user_id=target_user and f.state='pending') then return false;end if;
 delete from maintenance_private.reviewed_retirement_files f using maintenance_private.account_deletion_requests j where j.id=f.request_id and j.user_id=target_user;
 delete from maintenance_private.reviewed_retirements where user_id=target_user;
 delete from maintenance_private.closure_coverage_plans where user_id=target_user;
 return true;
end;$$;
create or replace function public.erase_maintenance_deletion_records(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if exists(select 1 from maintenance_private.reviewed_retirement_files where request_id=target_request and state='pending') then return false;end if;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not maintenance_private.owned_homes_have_no_other_members(target_user) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed) then return false; end if;
 if exists(select 1 from maintenance_private.account_deletion_objects o join maintenance_private.product_attachments f on f.id=o.attachment_id where o.request_id=target_request and not maintenance_private.attachment_write_is_quiet(f.id)) then return false; end if;
 if exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled) then return false; end if;
 -- An expired send lease does not resolve an external delivery outcome.
 if exists(select 1 from public.maintenance_push_subscriptions p where p.user_id=target_user and (p.claim_token is not null or p.claimed_until is not null))
 or exists(select 1 from maintenance_private.native_notification_jobs j join maintenance_private.native_notification_devices d on d.id=j.device_id where d.user_id=target_user and (j.state='unknown' or (j.state='claimed' and j.send_started_at is not null))) then return false;end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and records_erased) then return true; end if;
 delete from maintenance_private.product_attachments f using maintenance_private.account_deletion_objects o where o.request_id=target_request and o.attachment_id=f.id;
 delete from public.maintenance_push_subscriptions where user_id=target_user;
 delete from public.home_members where user_id=target_user;
 delete from public.maintenance_backup_restores where owner_id=target_user;
 delete from public.homes where owner_id=target_user;
 update maintenance_private.account_deletion_requests set records_erased=true,updated_at=now() where id=target_request;
 return true;
end;$$;
commit;
