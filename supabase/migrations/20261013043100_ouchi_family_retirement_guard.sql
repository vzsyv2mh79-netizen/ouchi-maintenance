begin;
-- No worker is enabled. Stop before account closure or file deletion when an
-- owned home still has family members; transfer must finish before retirement.
create function maintenance_private.owned_homes_have_no_other_members(target_user uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if target_user is null then return false; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 -- Parent FOR UPDATE also blocks new FK membership insertions until commit.
 perform 1 from public.homes where owner_id=target_user order by id for update;
 perform 1 from public.home_members m join public.homes h on h.id=m."homeId"
 where h.owner_id=target_user order by m."homeId",m.user_id for update of m;
 return not exists(select 1 from public.homes h join public.home_members m on m."homeId"=h.id
 where h.owner_id=target_user and m.user_id<>target_user);
end;$$;
revoke all on function maintenance_private.owned_homes_have_no_other_members(uuid) from public,anon,authenticated;
grant execute on function maintenance_private.owned_homes_have_no_other_members(uuid) to service_role;
-- Recheck closure after waiting for the parent lock. A stale invite statement
-- may not insert a member after retirement has closed the owner's app account.
create function maintenance_private.guard_open_home_membership_insert() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_uuid uuid;
begin
 select owner_id into owner_uuid from public.homes where id=new."homeId" for key share;
 if not found or owner_uuid is null then raise exception 'Home unavailable'; end if;
 if exists(select 1 from maintenance_private.account_access where user_id=owner_uuid and not enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=owner_uuid and not enabled) then raise exception 'Home owner closed'; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where user_id=owner_uuid and state in ('pending','running')) then raise exception 'Owner closure pending'; end if;
 if exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 and not exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id and a.enabled where e.user_id=owner_uuid and e.enabled) then raise exception 'Owner enrollment unavailable'; end if;
 return new;
end;$$;
revoke all on function maintenance_private.guard_open_home_membership_insert() from public,anon,authenticated,service_role;
create trigger open_home_membership_insert before insert on public.home_members
for each row execute function maintenance_private.guard_open_home_membership_insert();
create or replace function public.capture_maintenance_deletion_objects(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not maintenance_private.owned_homes_have_no_other_members(target_user) then return false; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured) then return true; end if;
 -- Reserve/upload adapters must use these same home/enrollment locks. No such
 -- production adapter is enabled yet, so concurrent upload safety is a release gate.
 perform 1 from public.homes where owner_id=target_user for update;
 update maintenance_private.account_access set enabled=false where user_id=target_user;
 update maintenance_private.app_epochs set enabled=false where user_id=target_user and epoch_id=target_epoch;
 insert into maintenance_private.account_deletion_objects(request_id,attachment_id,uploader_id,uploader_epoch,bucket,object_path)
 select target_request,f.id,f.user_id,f.app_epoch_id,'ouchi-product-attachments',f.object_path
 from maintenance_private.product_attachments f
 where f.state<>'removed' and ((f.user_id=target_user and f.app_epoch_id=target_epoch)
 or f.captured_owner_id=target_user
 or exists(select 1 from public.products p join public.homes h on h.id=p."homeId" where p.id=f.product_id and h.owner_id=target_user))
 on conflict(request_id,attachment_id) do nothing;
 update maintenance_private.account_deletion_requests set inventory_captured=true,updated_at=now() where id=target_request;
 return true;
end;$$;

create or replace function public.erase_maintenance_deletion_records(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 if not maintenance_private.owned_homes_have_no_other_members(target_user) then return false; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed) then return false; end if;
 if exists(select 1 from maintenance_private.account_deletion_objects o join maintenance_private.product_attachments f on f.id=o.attachment_id where o.request_id=target_request and not maintenance_private.attachment_write_is_quiet(f.id)) then return false; end if;
 if exists(select 1 from maintenance_private.account_access where user_id=target_user and enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=target_user and enabled) then return false; end if;
 if exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and records_erased) then return true; end if;
 delete from maintenance_private.product_attachments f using maintenance_private.account_deletion_objects o where o.request_id=target_request and o.attachment_id=f.id;
 delete from public.maintenance_push_subscriptions where user_id=target_user;
 delete from public.home_members where user_id=target_user;
 delete from public.maintenance_backup_restores where owner_id=target_user;
 delete from public.homes where owner_id=target_user;
 update maintenance_private.account_deletion_requests set records_erased=true,updated_at=now() where id=target_request;
 return true;
end;$$;

-- Refuse before enqueuing, so the owner can still arrange a handoff.
create or replace function public.request_maintenance_account_deletion(target_user uuid,verified_session uuid,target_epoch uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare current_epoch uuid; request_id uuid;
begin
 if target_user is null or verified_session is null or target_epoch is null then raise exception 'Invalid deletion identity'; end if;
 -- Same lock used by app enrollment: an old request never becomes a new epoch.
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 current_epoch:=public.current_maintenance_purchase_account(target_user,verified_session);
 if current_epoch is null or current_epoch<>target_epoch then raise exception 'Live app session required'; end if;
 if not maintenance_private.owned_homes_have_no_other_members(target_user) then raise exception 'Family handoff required'; end if;
 insert into maintenance_private.account_deletion_requests(user_id,app_epoch_id)
 values(target_user,target_epoch) on conflict(user_id,app_epoch_id) do nothing;
 select id into request_id from maintenance_private.account_deletion_requests where user_id=target_user and app_epoch_id=target_epoch;
 return request_id;
end;$$;
commit;
