-- Dormant, explicitly reviewed text-field redaction. Not authorship inference,
-- automatic family deletion, complete account erasure or production activation.
begin;
create table maintenance_private.closure_field_redaction_receipts (
 event_id uuid primary key,
 review_request_id uuid not null references maintenance_private.account_closure_reviews(review_request_id) on delete restrict,
 user_id uuid not null, app_epoch_id uuid not null,
 operator_principal name not null,
 request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
 relation_name text not null, record_id uuid not null, field_name text not null,
 recorded_at timestamptz not null default clock_timestamp()
);
alter table maintenance_private.closure_field_redaction_receipts enable row level security;
revoke all on maintenance_private.closure_field_redaction_receipts from public,anon,authenticated,service_role,ouchi_closure_operator;
create index closure_field_redaction_review on maintenance_private.closure_field_redaction_receipts(review_request_id);

-- Read and lock one allowed field within the requesting member's current home.
-- Ownership/membership is an access scope, NEVER proof of authorship or subject.
-- Lock the home, product, task, history hierarchy, then recheck each relationship.
create function maintenance_private.read_closure_redaction_field(
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
  if not found then raise exception 'Scoped record unavailable'; end if;
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

create function maintenance_private.redact_closure_reviewed_field(
 target_event uuid,target_review uuid,target_user uuid,target_epoch uuid,
 target_relation text,target_record uuid,target_field text,expected_digest text,replacement_text text
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior maintenance_private.closure_field_redaction_receipts; request_hash text; snapshot jsonb; affected integer;
begin
 if not exists(select 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled)
 then raise exception 'Authorized operator connection required'; end if;
 if target_event is null or target_event='00000000-0000-0000-0000-000000000000'::uuid
 or target_review is null or target_user is null or target_epoch is null or target_record is null
 or target_relation is null or target_field is null or expected_digest is null or expected_digest !~ '^[0-9a-f]{64}$'
 or octet_length(replacement_text)>8192 then raise exception 'Scoped reviewed replacement required'; end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(target_review,target_user,target_epoch,target_relation,target_record,target_field,expected_digest,replacement_text)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 select * into prior from maintenance_private.closure_field_redaction_receipts where event_id=target_event;
 if found then
  if prior.request_digest<>request_hash or prior.operator_principal<>session_user then raise exception 'Redaction event conflict'; end if;
  -- A committed operation is acknowledged without reapplying the replacement:
  -- a family member may have legitimately edited the field after that commit.
  return target_event;
 end if;
 snapshot:=maintenance_private.read_closure_redaction_field(target_review,target_user,target_epoch,target_relation,target_record,target_field);
 if snapshot->>'digest'<>expected_digest then raise exception 'Reviewed content changed; review again'; end if;
 if snapshot->'value' is not distinct from coalesce(to_jsonb(replacement_text),'null'::jsonb)
 then raise exception 'Replacement does not change the reviewed field'; end if;
 execute format('update public.%I set %I=$1 where id=$2',target_relation,target_field) using replacement_text,target_record;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Scoped record changed'; end if;
 insert into maintenance_private.closure_field_redaction_receipts(event_id,review_request_id,user_id,app_epoch_id,operator_principal,request_digest,relation_name,record_id,field_name)
 values(target_event,target_review,target_user,target_epoch,session_user,request_hash,target_relation,target_record,target_field);
 return target_event;
end;$$;
revoke all on function maintenance_private.redact_closure_reviewed_field(uuid,uuid,uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.redact_closure_reviewed_field(uuid,uuid,uuid,uuid,text,uuid,text,text,text) to ouchi_closure_operator;
commit;
