-- Dormant operator-only metadata discovery. Does not classify file subjects,
-- issue URLs, copy/delete bytes, authorize family retention or complete erasure.
begin;
create function maintenance_private.closure_review_files(target_review uuid,target_user uuid,target_epoch uuid)
returns table(attachment_id uuid,home_id uuid,home_instance_id uuid,product_id uuid,size_bytes bigint,mime text,file_state text,write_state text,removal_pending boolean,metadata_digest text,descriptor jsonb)
language sql stable security invoker set search_path='' as $$
 with scoped_homes as (
  select h.id from public.homes h where h.owner_id=target_user
  union select m."homeId" from public.home_members m where m.user_id=target_user
  union select e.home_id from maintenance_private.closure_legacy_home_events e
   where e.review_request_id=target_review and e.user_id=target_user and e.app_epoch_id=target_epoch
   and maintenance_private.closure_legacy_home_context_is_current(target_review,target_user,target_epoch,e.home_id)
 ), candidates as (
  select f.*,p."homeId" as current_home,i.instance_id as current_instance,
   case when not f.write_tracking then 'untracked' when w.attachment_id is null then 'missing' else w.state end as current_write_state,
   pg_catalog.jsonb_build_object('attachment',pg_catalog.to_jsonb(f),'homeID',p."homeId",'homeInstanceID',i.instance_id,'writeAttempt',pg_catalog.to_jsonb(w)) as source
  from maintenance_private.product_attachments f
  left join public.products p on p.id=f.product_id
  left join maintenance_private.closure_home_instances i on i.home_id=p."homeId"
  left join maintenance_private.attachment_write_attempts w on w.attachment_id=f.id
  where f.user_id=target_user or f.captured_owner_id=target_user or p."homeId" in(select id from scoped_homes)
 )
 select f.id,f.current_home,f.current_instance,f.product_id,f.size_bytes,f.mime,f.state,f.current_write_state,f.removal_pending,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(f.source::text,'UTF8')),'hex'),
 pg_catalog.jsonb_build_object('attachmentID',f.id,'uploaderID',f.user_id,'uploaderEpoch',f.app_epoch_id,'productID',f.product_id,
  'homeID',f.current_home,'homeInstanceID',f.current_instance,'bucket','ouchi-product-attachments','objectPath',f.object_path,
  'sizeBytes',f.size_bytes,'mime',f.mime,'state',f.state,'writeState',f.current_write_state,'removalPending',f.removal_pending,
  'sha256',f.sha256,'expectedSHA256',f.expected_sha256,'subjectConfirmed',false)
 from candidates f;
$$;
revoke all on function maintenance_private.closure_review_files(uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator;

create function maintenance_private.closure_review_file_inventory(target_review uuid,target_user uuid,target_epoch uuid,after_file uuid default null)
returns table(attachment_id uuid,home_id uuid,home_instance_id uuid,product_id uuid,size_bytes bigint,mime text,file_state text,write_state text,removal_pending boolean,metadata_digest text)
language plpgsql security definer set search_path='' as $$
begin
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 if after_file='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Scoped file cursor required'; end if;
 return query select f.attachment_id,f.home_id,f.home_instance_id,f.product_id,f.size_bytes,f.mime,f.file_state,f.write_state,f.removal_pending,f.metadata_digest
 from maintenance_private.closure_review_files(target_review,target_user,target_epoch) f
 where after_file is null or f.attachment_id>after_file order by f.attachment_id limit 51;
end;$$;
revoke all on function maintenance_private.closure_review_file_inventory(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.closure_review_file_inventory(uuid,uuid,uuid,uuid) to ouchi_closure_operator;

create function maintenance_private.read_closure_review_file(target_review uuid,target_user uuid,target_epoch uuid,target_file uuid,expected_metadata_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f record; home_key uuid; product_key uuid;
begin
 -- Keep this operator's enabled authority stable while the backend reads bytes.
 perform 1 from maintenance_private.closure_operator_principals where principal=session_user and enabled for share;
 if not found then raise exception 'Authorized operator connection required'; end if;
 perform maintenance_private.require_closure_snapshot_review(target_review,target_user,target_epoch);
 if target_file is null or target_file='00000000-0000-0000-0000-000000000000'::uuid
 or expected_metadata_digest is null or expected_metadata_digest !~ '^[0-9a-f]{64}$' then raise exception 'Scoped reviewed file required'; end if;
 -- Recheck scope after locks; never treat uploader/owner identity as subject approval.
 select p."homeId",p.id into home_key,product_key from maintenance_private.product_attachments a left join public.products p on p.id=a.product_id where a.id=target_file;
 if home_key is not null then
  perform 1 from public.homes where id=home_key for update;
  perform 1 from public.home_members where "homeId"=home_key and user_id=target_user for share;
 end if;
 if product_key is not null then perform 1 from public.products where id=product_key for update; end if;
 perform 1 from maintenance_private.product_attachments where id=target_file for update;
 perform 1 from maintenance_private.attachment_write_attempts where attachment_id=target_file for update;
 select * into f from maintenance_private.closure_review_files(target_review,target_user,target_epoch) where attachment_id=target_file;
 if not found then raise exception 'Scoped file unavailable'; end if;
 if f.metadata_digest is distinct from expected_metadata_digest then raise exception 'File metadata changed'; end if;
 return pg_catalog.jsonb_build_object('metadataDigest',f.metadata_digest,'file',f.descriptor,'accountErasureConfirmed',false);
end;$$;
revoke all on function maintenance_private.read_closure_review_file(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.read_closure_review_file(uuid,uuid,uuid,uuid,text) to ouchi_closure_operator;
commit;
