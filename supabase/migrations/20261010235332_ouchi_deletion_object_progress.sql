begin;
-- Object API deletion and explicit absence verification must precede acknowledgement.
-- No worker endpoint or scheduler is enabled here.
grant update(absence_confirmed) on maintenance_private.account_deletion_objects to service_role;
create function public.read_maintenance_deletion_objects(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease)
 or not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured) then raise exception 'Deletion inventory unavailable'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',attachment_id,'uploaderID',uploader_id,'uploaderEpoch',uploader_epoch,'bucket',bucket,'path',object_path)) from
 (select * from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed order by attachment_id limit 25) batch),'[]'::jsonb);
end;$$;
create function public.confirm_maintenance_deletion_object_absence(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid,target_attachment uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare item maintenance_private.account_deletion_objects;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 select * into item from maintenance_private.account_deletion_objects where request_id=target_request and attachment_id=target_attachment for update;
 if not found then return false; end if;
 if exists(select 1 from storage.objects where bucket_id=item.bucket and name=item.object_path) then return false; end if;
 update maintenance_private.account_deletion_objects set absence_confirmed=true where request_id=target_request and attachment_id=target_attachment;
 return true;
end;$$;
revoke all on function public.read_maintenance_deletion_objects(uuid,uuid,uuid,uuid),public.confirm_maintenance_deletion_object_absence(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_deletion_objects(uuid,uuid,uuid,uuid),public.confirm_maintenance_deletion_object_absence(uuid,uuid,uuid,uuid,uuid) to service_role;
commit;
