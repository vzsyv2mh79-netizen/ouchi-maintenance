-- Additive release candidate; no job, LOGIN, scheduler or policy is enabled.
begin;
create function public.erase_maintenance_deletion_closure_metadata(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare saved maintenance_private.closure_reauth_markers; claims text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease)
 or not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and lease_until>clock_timestamp()) then return false; end if;
 -- A stale job must not erase a later active enrollment. The same participant
 -- lock serializes enrollment and marker/review writers with this check.
 if exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id
  where e.user_id=target_user and e.enabled and a.enabled) then return false; end if;
 if not public.erase_maintenance_deletion_reauth_markers(target_request,target_user,target_epoch,target_lease) then return false; end if;
 claims:=current_setting('request.jwt.claims',true);
 perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',target_user)::text,true);
 -- Earlier retired Ouchi generations are personal data too. Preserve shared
 -- original sessions and other actors; close only the exact owned marker agents.
 for saved in select * from maintenance_private.closure_reauth_markers where user_id=target_user order by marker_id for update loop
  perform maintenance_private.closure_reauth_close(target_user,saved.original_session,saved.app_epoch,saved.marker_id);
 end loop;
 delete from maintenance_private.closure_reauth_markers where user_id=target_user;
 delete from maintenance_private.account_closure_reviews where user_id=target_user;
 perform pg_catalog.set_config('request.jwt.claims',coalesce(claims,''),true);
 return not exists(select 1 from maintenance_private.account_closure_reviews where user_id=target_user)
  and not exists(select 1 from maintenance_private.closure_reauth_markers where user_id=target_user);
exception when others then
 perform pg_catalog.set_config('request.jwt.claims',coalesce(claims,''),true);raise;
end;$$;
revoke all on function public.erase_maintenance_deletion_closure_metadata(uuid,uuid,uuid,uuid) from public,anon,authenticated,ouchi_closure_review_executor,ouchi_closure_reauth_worker;
grant execute on function public.erase_maintenance_deletion_closure_metadata(uuid,uuid,uuid,uuid) to service_role;

-- Old workers cannot seal completion while newly inventoried personal metadata
-- remains. This does not satisfy the separate identity/retention completion gate.
create or replace function maintenance_private.closure_reauth_completion_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.state='complete' then
  if exists(select 1 from maintenance_private.closure_reauth_markers m where m.user_id=new.user_id) then raise exception 'Reauthentication marker erasure required before completion'; end if;
  if exists(select 1 from maintenance_private.account_closure_reviews r where r.user_id=new.user_id) then raise exception 'Closure review erasure required before completion'; end if;
 end if;
 return new;
end;$$;
revoke all on function maintenance_private.closure_reauth_completion_guard() from public,anon,authenticated,service_role,ouchi_closure_review_executor,ouchi_closure_reauth_worker;
commit;
