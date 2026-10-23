-- Additive candidate only. Preserve existing function ACLs, policy and grants.
-- Shared deployments may use auth.uid() backed by legacy sub or claims JSON.
-- Bind both solely from current native lease/owned registry authority and
-- restore the complete previous context on success AND exception.
begin;
create or replace function maintenance_private.closure_reauth_maintenance(batch_size integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; saved maintenance_private.closure_reauth_markers; remaining integer; closed integer:=0; purged integer:=0; n integer; claims text:=current_setting('request.jwt.claims',true); subject text:=current_setting('request.jwt.claim.sub',true);
begin
 if batch_size is null or batch_size not between 1 and 100 then raise exception 'Bounded cleanup batch required'; end if;
 remaining:=batch_size;claims:=current_setting('request.jwt.claims',true);
 -- Candidate discovery does not hold marker locks. Acquire the participant
 -- lock first, consistently with foreground register/close; skip busy actors.
 for actor in select distinct m.user_id from maintenance_private.closure_reauth_markers m
 where (m.closed_at is null and m.expires_at<=clock_timestamp()) or m.closed_at<clock_timestamp()-interval '1 day'
 order by m.user_id limit batch_size loop
  if remaining=0 then exit; end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext(actor::text)) then continue; end if;
  -- Private DB-worker capability; these IDs come only from the owned registry,
  -- never client JSON. This is not a JWT authentication substitute.
  perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',actor)::text,true);
 perform pg_catalog.set_config('request.jwt.claim.sub',actor::text,true);
  for saved in select * from maintenance_private.closure_reauth_markers m where m.user_id=actor and m.closed_at is null and m.expires_at<=clock_timestamp()
   order by m.created_at limit remaining for update skip locked loop
   perform maintenance_private.closure_reauth_close(actor,saved.original_session,saved.app_epoch,saved.marker_id);
   closed:=closed+1;remaining:=remaining-1;
  end loop;
  if remaining>0 then
   delete from maintenance_private.closure_reauth_markers where marker_id in(select m.marker_id from maintenance_private.closure_reauth_markers m
    where m.user_id=actor and m.closed_at<clock_timestamp()-interval '1 day' order by m.closed_at limit remaining for update skip locked);
   get diagnostics n=row_count;purged:=purged+n;remaining:=remaining-n;
  end if;
 end loop;
 perform pg_catalog.set_config('request.jwt.claims',coalesce(claims,''),true);
 perform pg_catalog.set_config('request.jwt.claim.sub',coalesce(subject,''),true);
 return pg_catalog.jsonb_build_object('closed',closed,'purged',purged);
exception when others then
 perform pg_catalog.set_config('request.jwt.claims',coalesce(claims,''),true);
 perform pg_catalog.set_config('request.jwt.claim.sub',coalesce(subject,''),true);raise;
end;$$;

create or replace function public.erase_maintenance_deletion_reauth_markers(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare saved maintenance_private.closure_reauth_markers; claims text:=current_setting('request.jwt.claims',true); subject text:=current_setting('request.jwt.claim.sub',true);
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests r where r.id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease)
 or not exists(select 1 from maintenance_private.account_deletion_requests r where r.id=target_request and r.lease_until>clock_timestamp()) then return false; end if;
 -- Retire enrollment/access before cleanup; otherwise a concurrent producer
 -- could register a new marker after this erasure transaction commits.
 if exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id
  where e.user_id=target_user and e.epoch_id=target_epoch and e.enabled and a.enabled) then return false; end if;
 claims:=current_setting('request.jwt.claims',true);
 perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',target_user)::text,true);
 perform pg_catalog.set_config('request.jwt.claim.sub',target_user::text,true);
 for saved in select * from maintenance_private.closure_reauth_markers m where m.user_id=target_user and m.app_epoch=target_epoch order by m.marker_id for update loop
  perform maintenance_private.closure_reauth_close(target_user,saved.original_session,target_epoch,saved.marker_id);
 end loop;
 delete from maintenance_private.closure_reauth_markers where user_id=target_user and app_epoch=target_epoch;
 perform pg_catalog.set_config('request.jwt.claims',coalesce(claims,''),true);
 perform pg_catalog.set_config('request.jwt.claim.sub',coalesce(subject,''),true);
 return not exists(select 1 from maintenance_private.closure_reauth_markers where user_id=target_user and app_epoch=target_epoch);
exception when others then
 perform pg_catalog.set_config('request.jwt.claims',coalesce(claims,''),true);
 perform pg_catalog.set_config('request.jwt.claim.sub',coalesce(subject,''),true);raise;
end;$$;

create or replace function public.erase_maintenance_deletion_closure_metadata(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare saved maintenance_private.closure_reauth_markers; claims text:=current_setting('request.jwt.claims',true); subject text:=current_setting('request.jwt.claim.sub',true);
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
 perform pg_catalog.set_config('request.jwt.claim.sub',target_user::text,true);
 -- Earlier retired Ouchi generations are personal data too. Preserve shared
 -- original sessions and other actors; close only the exact owned marker agents.
 for saved in select * from maintenance_private.closure_reauth_markers where user_id=target_user order by marker_id for update loop
  perform maintenance_private.closure_reauth_close(target_user,saved.original_session,saved.app_epoch,saved.marker_id);
 end loop;
 delete from maintenance_private.closure_reauth_markers where user_id=target_user;
 delete from maintenance_private.account_closure_reviews where user_id=target_user;
 perform pg_catalog.set_config('request.jwt.claims',coalesce(claims,''),true);
 perform pg_catalog.set_config('request.jwt.claim.sub',coalesce(subject,''),true);
 return not exists(select 1 from maintenance_private.account_closure_reviews where user_id=target_user)
  and not exists(select 1 from maintenance_private.closure_reauth_markers where user_id=target_user);
exception when others then
 perform pg_catalog.set_config('request.jwt.claims',coalesce(claims,''),true);
 perform pg_catalog.set_config('request.jwt.claim.sub',coalesce(subject,''),true);raise;
end;$$;
commit;
