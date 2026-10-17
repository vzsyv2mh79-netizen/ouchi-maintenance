-- Dormant ownerless compatibility: NULL owner is not evidence of review scope.
-- Preserve current membership or explicit incarnation-bound legacy confirmation.
begin;
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
 if home_owner is distinct from target_user then
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
