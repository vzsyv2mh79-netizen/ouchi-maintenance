begin;
-- Dormant private cleanup only: no role, grant, endpoint or schedule. A reviewed
-- bounded backend and definitive Storage absence are still required.
alter table maintenance_private.product_attachments
 add column removal_cleanup_lease uuid,
 add column removal_cleanup_until timestamptz,
 add constraint attachment_cleanup_lease_pair check
  ((removal_cleanup_lease is null)=(removal_cleanup_until is null));

create function maintenance_private.attachment_cleanup_eligible(target_attachment uuid)
returns boolean language sql security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.product_attachments f
  where f.id=target_attachment and f.removal_pending and f.state in('reserved','stored')
   and f.removal_requested_at is not null and f.removal_requested_at<=clock_timestamp()
   and f.write_tracking and f.captured_owner_id is not null
   and f.object_path=f.user_id::text||'/'||f.app_epoch_id::text||'/'||f.id::text||'.'||
    case f.mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'application/pdf' then 'pdf' else '?' end
   and maintenance_private.attachment_write_is_quiet(f.id)
   and exists(select 1 from maintenance_private.account_access a where a.user_id=f.user_id and a.enabled)
   and exists(select 1 from maintenance_private.account_access a where a.user_id=f.captured_owner_id and a.enabled)
   and exists(select 1 from maintenance_private.app_epochs e where e.user_id=f.user_id and e.enabled and e.epoch_id=f.app_epoch_id)
   and exists(select 1 from maintenance_private.app_epochs e where e.user_id=f.captured_owner_id and e.enabled));
$$;

create function maintenance_private.attachment_cleanup_candidates(batch_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if batch_limit is null or batch_limit not between 1 and 25 then raise exception 'Bounded cleanup batch required';end if;
 select coalesce(jsonb_agg(id order by removal_requested_at,id),'[]'::jsonb) into result
 from (select f.id,f.removal_requested_at from maintenance_private.product_attachments f
  where f.removal_pending and f.state<>'removed'
   and (f.removal_cleanup_until is null or f.removal_cleanup_until<=clock_timestamp())
   and maintenance_private.attachment_cleanup_eligible(f.id)
  order by f.removal_requested_at,f.id limit batch_limit) candidates;
 return result;
end;
$$;

create function maintenance_private.claim_attachment_cleanup(target_attachment uuid,target_lease uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior maintenance_private.product_attachments;item maintenance_private.product_attachments;principal uuid;
begin
 if target_attachment is null or target_lease is null or target_lease='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Cleanup identity required';end if;
 select * into prior from maintenance_private.product_attachments where id=target_attachment;
 if not found or not maintenance_private.attachment_cleanup_eligible(target_attachment) then return null;end if;
 -- Same principal order as upload/removal/enrollment; never lock the row first.
 for principal in select distinct value from unnest(array[prior.user_id,prior.captured_owner_id]) value order by value loop
  perform pg_advisory_xact_lock(hashtext(principal::text));
 end loop;
 select * into item from maintenance_private.product_attachments where id=target_attachment for update;
 if not found or row(item.user_id,item.app_epoch_id,item.captured_owner_id,item.object_path,item.mime)
  is distinct from row(prior.user_id,prior.app_epoch_id,prior.captured_owner_id,prior.object_path,prior.mime)
  or not maintenance_private.attachment_cleanup_eligible(target_attachment) then return null;end if;
 if item.removal_cleanup_lease=target_lease then
  -- An exact retry never extends authority. Expired work needs a NEW lease.
  if item.removal_cleanup_until<=clock_timestamp() then return null;end if;
 elsif item.removal_cleanup_until>clock_timestamp() then return null;
 else
  update maintenance_private.product_attachments
   set removal_cleanup_lease=target_lease,removal_cleanup_until=clock_timestamp()+interval '5 minutes'
   where id=target_attachment returning * into item;
 end if;
 return jsonb_build_object('id',item.id,'user',item.user_id,'epoch',item.app_epoch_id,
  'owner',item.captured_owner_id,'path',item.object_path,'mime',item.mime,'lease',item.removal_cleanup_lease);
end;
$$;

create function maintenance_private.attachment_cleanup_current(target_attachment uuid,target_lease uuid,
 expected_user uuid,expected_epoch uuid,expected_owner uuid,expected_path text,expected_mime text)
returns boolean language sql security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.product_attachments f
  where f.id=target_attachment and f.removal_cleanup_lease=target_lease and f.removal_cleanup_until>clock_timestamp()
   and f.user_id=expected_user and f.app_epoch_id=expected_epoch and f.captured_owner_id=expected_owner
   and f.object_path=expected_path and f.mime=expected_mime
   and maintenance_private.attachment_cleanup_eligible(f.id));
$$;

create function maintenance_private.complete_attachment_cleanup(target_attachment uuid,target_lease uuid,
 expected_user uuid,expected_epoch uuid,expected_owner uuid,expected_path text,expected_mime text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare principal uuid;item maintenance_private.product_attachments;
begin
 if expected_user is null or expected_owner is null then return false;end if;
 for principal in select distinct value from unnest(array[expected_user,expected_owner]) value order by value loop
  perform pg_advisory_xact_lock(hashtext(principal::text));
 end loop;
 select * into item from maintenance_private.product_attachments where id=target_attachment for update;
 if not found or not maintenance_private.attachment_cleanup_current(target_attachment,target_lease,
  expected_user,expected_epoch,expected_owner,expected_path,expected_mime) then return false;end if;
 -- Metadata absence alone is NOT physical absence. The trusted backend must
 -- first obtain definitive SDK NoSuchKey; there is no client approval flag.
 if exists(select 1 from storage.objects where bucket_id='ouchi-product-attachments' and name=expected_path) then return false;end if;
 update maintenance_private.product_attachments set state='removed',removal_cleanup_lease=null,removal_cleanup_until=null
  where id=target_attachment;
 return found;
end;
$$;

-- Fresh retirement must re-enumerate previously removed metadata too. A state
-- flag is not a new physical-absence receipt. Existing captured inventories
-- remain immutable and need their separate reviewed recovery, never expansion.
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
 where ((f.user_id=target_user and f.app_epoch_id=target_epoch)
 or f.captured_owner_id=target_user
 or exists(select 1 from public.products p join public.homes h on h.id=p."homeId" where p.id=f.product_id and h.owner_id=target_user))
 on conflict(request_id,attachment_id) do nothing;
 update maintenance_private.account_deletion_requests set inventory_captured=true,updated_at=now() where id=target_request;
 return true;
end;$$;

revoke all on function maintenance_private.attachment_cleanup_eligible(uuid),
 maintenance_private.attachment_cleanup_candidates(integer),
 maintenance_private.claim_attachment_cleanup(uuid,uuid),
 maintenance_private.attachment_cleanup_current(uuid,uuid,uuid,uuid,uuid,text,text),
 maintenance_private.complete_attachment_cleanup(uuid,uuid,uuid,uuid,uuid,text,text)
 from public,anon,authenticated,service_role;
commit;
