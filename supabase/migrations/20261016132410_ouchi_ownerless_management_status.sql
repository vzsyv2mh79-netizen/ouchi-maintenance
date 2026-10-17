-- Backend-only reads for the disabled ownerless-management candidate.
begin;
create function maintenance_private.read_ownerless_home_status(target_home uuid,target_user uuid,verified_session uuid,expected_epoch uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.homes; current_generation uuid; available boolean;
begin
 if target_home is null or target_user is null or verified_session is null or expected_epoch is null
 or not exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 or public.current_maintenance_purchase_account(target_user,verified_session) is distinct from expected_epoch
 then raise exception 'Current matching app session required'; end if;
 select * into h from public.homes where id=target_home for share;
 if not found then raise exception 'Home unavailable'; end if;
 if h.owner_id is distinct from target_user then
  perform 1 from public.home_members where "homeId"=target_home and user_id=target_user for share;
  if not found then raise exception 'Existing family membership required'; end if;
 end if;
 if h.owner_id is null then
  select generation into current_generation from maintenance_private.ownerless_home_generations where home_id=target_home;
  if current_generation is null then raise exception 'Management state unavailable'; end if;
 end if;
 available:=h.owner_id is null
  and exists(select 1 from maintenance_private.ownerless_home_policy where id=1 and enabled)
  and to_regclass('maintenance_private.household_write_routes') is null
  and not exists(select 1 from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=expected_epoch)
  and not exists(select 1 from maintenance_private.account_closure_reviews where user_id=target_user and app_epoch_id=expected_epoch and state='review_required');
 return jsonb_build_object('kind','ownerless-home-status/v1','homeID',target_home,'epochID',expected_epoch,
  'state',case when h.owner_id is null then 'awaiting_management' else 'managed' end,'generation',current_generation,'canClaim',available);
end;$$;
revoke all on function maintenance_private.read_ownerless_home_status(uuid,uuid,uuid,uuid) from public,anon,authenticated,ouchi_closure_operator;
grant execute on function maintenance_private.read_ownerless_home_status(uuid,uuid,uuid,uuid) to service_role;

-- Reconcile unknown COMMIT by read only. A missing receipt is not an instruction
-- to retry, generate another request ID, mutate local ownership or discard intent.
create function maintenance_private.read_ownerless_home_claim(target_request uuid,target_home uuid,expected_generation uuid,target_user uuid,verified_session uuid,expected_epoch uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior maintenance_private.ownerless_home_claims; result_state text;
begin
 if target_request is null or target_home is null or expected_generation is null or target_user is null or verified_session is null or expected_epoch is null
 or not exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 or public.current_maintenance_purchase_account(target_user,verified_session) is distinct from expected_epoch
 then raise exception 'Current matching app session required'; end if;
 select * into prior from maintenance_private.ownerless_home_claims
 where request_id=target_request and home_id=target_home and generation=expected_generation and user_id=target_user and app_epoch_id=expected_epoch;
 result_state:='not_recorded';
 if found then
  result_state:='superseded';
  if exists(select 1 from public.homes h join maintenance_private.closure_home_instances i on i.home_id=h.id
   join maintenance_private.ownerless_home_generations g on g.home_id=h.id
   where h.id=target_home and h.owner_id=target_user and i.instance_id=prior.home_instance and g.generation=prior.generation)
  then result_state:='claimed'; end if;
 end if;
 return jsonb_build_object('kind','ownerless-home-claim/v1','requestID',target_request,'homeID',target_home,
  'generation',expected_generation,'epochID',expected_epoch,'state',result_state);
end;$$;
revoke all on function maintenance_private.read_ownerless_home_claim(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,ouchi_closure_operator;
grant execute on function maintenance_private.read_ownerless_home_claim(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
commit;
