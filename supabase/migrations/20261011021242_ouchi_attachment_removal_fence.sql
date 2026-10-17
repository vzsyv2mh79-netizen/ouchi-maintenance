begin;
alter table maintenance_private.product_attachments add column removal_pending boolean not null default false;
create or replace function public.reserve_maintenance_attachment(target_user uuid,verified_session uuid,expected_epoch uuid,target_product uuid,attachment_id uuid,byte_count bigint,media_type text,measured_sha256 text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare used_bytes bigint; used_files bigint; owner_uuid uuid; prior maintenance_private.product_attachments;
begin
 if target_user is null or expected_epoch is null or attachment_id is null or target_product is null or byte_count is null or byte_count not between 1 and 5242880 or media_type is null or media_type not in ('image/jpeg','image/png','application/pdf') or measured_sha256 is null or measured_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid attachment'; end if;
 -- Same lock as enrollment closure, preventing a concurrent quota/enrollment race.
 select h.owner_id into owner_uuid from public.products p join public.homes h on h.id=p."homeId" where p.id=target_product;
 if owner_uuid is null then raise exception 'Product unavailable'; end if;
 -- Match deletion capture lock for BOTH uploader and owner; stable lock ordering.
 perform pg_advisory_xact_lock(hashtext(least(target_user::text,owner_uuid::text)));
 if owner_uuid<>target_user then perform pg_advisory_xact_lock(hashtext(greatest(target_user::text,owner_uuid::text))); end if;
 if exists(select 1 from maintenance_private.account_access where user_id=owner_uuid and not enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=owner_uuid and not enabled) then raise exception 'Owner unavailable'; end if;
 if public.current_maintenance_purchase_account(target_user,verified_session) is distinct from expected_epoch then raise exception 'Inactive enrollment'; end if;
 if not exists(select 1 from public.products p join public.homes h on h.id=p."homeId" where p.id=target_product and h.owner_id=owner_uuid and (h.owner_id=target_user or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=target_user))) then raise exception 'Product unavailable'; end if;
 select * into prior from maintenance_private.product_attachments where id=attachment_id;
 if found then
  if not prior.removal_pending and prior.captured_owner_id=owner_uuid and prior.user_id=target_user and prior.app_epoch_id=expected_epoch and prior.product_id=target_product and prior.size_bytes=byte_count and prior.mime=media_type and prior.expected_sha256=measured_sha256 and prior.state<>'removed' then return prior.id; end if;
  raise exception 'Reservation conflict';
 end if;
 -- Include in-flight reservations and retained prior epochs; no quota escape via reenrollment.
 select coalesce(sum(size_bytes),0),count(*) into used_bytes,used_files from maintenance_private.product_attachments where user_id=target_user and state<>'removed';
 if used_bytes+byte_count>104857600 or used_files>=100 then raise exception 'Attachment quota exceeded'; end if;
 insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,expected_sha256,write_tracking,captured_owner_id) values(attachment_id,target_user,expected_epoch,target_product,byte_count,media_type,measured_sha256,true,owner_uuid);
 return attachment_id;
end;$$;
create or replace function public.begin_maintenance_attachment_write(target_user uuid,verified_session uuid,expected_epoch uuid,target_attachment uuid,target_attempt uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner_uuid uuid; item maintenance_private.product_attachments; prior maintenance_private.attachment_write_attempts;
begin
 if target_user is null or expected_epoch is null or target_attachment is null or target_attempt is null then raise exception 'Invalid write attempt'; end if;
 select h.owner_id into owner_uuid from maintenance_private.product_attachments f join public.products p on p.id=f.product_id join public.homes h on h.id=p."homeId" where f.id=target_attachment and f.user_id=target_user and f.app_epoch_id=expected_epoch;
 if owner_uuid is null then raise exception 'Attachment unavailable'; end if;
 perform pg_advisory_xact_lock(hashtext(least(target_user::text,owner_uuid::text)));
 if owner_uuid<>target_user then perform pg_advisory_xact_lock(hashtext(greatest(target_user::text,owner_uuid::text))); end if;
 if exists(select 1 from maintenance_private.account_access where user_id=owner_uuid and not enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=owner_uuid and not enabled) then raise exception 'Owner unavailable'; end if;
 if public.current_maintenance_purchase_account(target_user,verified_session) is distinct from expected_epoch then raise exception 'Inactive enrollment'; end if;
 select * into item from maintenance_private.product_attachments where id=target_attachment for update;
 if not found or item.removal_pending or item.user_id<>target_user or item.app_epoch_id<>expected_epoch or not item.write_tracking or item.state<>'reserved' then raise exception 'Attachment unavailable'; end if;
 if not exists(select 1 from public.products p join public.homes h on h.id=p."homeId" where p.id=item.product_id and h.owner_id=owner_uuid and (h.owner_id=target_user or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=target_user))) then raise exception 'Product unavailable'; end if;
 select * into prior from maintenance_private.attachment_write_attempts where attachment_id=target_attachment;
 if found then
  if prior.attempt_id<>target_attempt then raise exception 'Write attempt conflict'; end if;
  -- A repeated begin NEVER grants permission to send another remote write.
  return jsonb_build_object('attemptID',prior.attempt_id,'started',false,'settled',prior.state='settled');
 end if;
 insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id) values(target_attachment,target_attempt,target_user,owner_uuid,expected_epoch);
 return jsonb_build_object('attemptID',target_attempt,'started',true,'settled',false);
end;$$;
create or replace function public.finalize_maintenance_attachment(target_user uuid,verified_session uuid,expected_epoch uuid,attachment_id uuid,actual_bytes bigint,verified_sha256 text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare item maintenance_private.product_attachments; owner_uuid uuid;
begin
 if target_user is null or expected_epoch is null or attachment_id is null or actual_bytes is null or actual_bytes not between 1 and 5242880 or verified_sha256 is null or verified_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid completion'; end if;
 select h.owner_id into owner_uuid from maintenance_private.product_attachments f join public.products p on p.id=f.product_id join public.homes h on h.id=p."homeId" where f.id=attachment_id and f.user_id=target_user and f.app_epoch_id=expected_epoch;
 if owner_uuid is null then raise exception 'Attachment unavailable'; end if;
 perform pg_advisory_xact_lock(hashtext(least(target_user::text,owner_uuid::text)));
 if owner_uuid<>target_user then perform pg_advisory_xact_lock(hashtext(greatest(target_user::text,owner_uuid::text))); end if;
 if exists(select 1 from maintenance_private.account_access where user_id=owner_uuid and not enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=owner_uuid and not enabled) then raise exception 'Owner unavailable'; end if;
 if public.current_maintenance_purchase_account(target_user,verified_session) is distinct from expected_epoch then raise exception 'Inactive enrollment'; end if;
 select * into item from maintenance_private.product_attachments where id=attachment_id for update;
 if not found or item.removal_pending or item.user_id<>target_user or item.app_epoch_id<>expected_epoch or item.size_bytes<>actual_bytes or item.expected_sha256 is distinct from verified_sha256 or item.state='removed' then raise exception 'Attachment unavailable'; end if;
 if not exists(select 1 from public.products p join public.homes h on h.id=p."homeId" where p.id=item.product_id and h.owner_id=owner_uuid and (h.owner_id=target_user or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=target_user))) then raise exception 'Product unavailable'; end if;
 if not exists(select 1 from maintenance_private.attachment_write_attempts a where a.attachment_id=item.id and a.state='settled') then raise exception 'Write not settled'; end if;
 if item.state='stored' then
  if item.sha256=verified_sha256 then return item.id; end if;
  raise exception 'Completion conflict';
 end if;
 update maintenance_private.product_attachments set state='stored',sha256=verified_sha256 where id=attachment_id;
 return attachment_id;
end;$$;
create or replace function public.read_maintenance_attachment(target_user uuid,verified_session uuid,expected_epoch uuid,attachment_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not maintenance_private.attachment_read_session_allowed(target_user,verified_session,expected_epoch) then return null; end if;
 select jsonb_build_object('id',f.id,'user',f.user_id,'epoch',f.app_epoch_id,'size',f.size_bytes,'mime',f.mime,'sha256',f.sha256)
 into result
from maintenance_private.product_attachments f
 join maintenance_private.app_epochs uploader on uploader.user_id=f.user_id
 join public.products p on p.id=f.product_id join public.homes h on h.id=p."homeId"
 where f.id=attachment_id and f.state='stored' and not f.removal_pending and f.sha256 ~ '^[0-9a-f]{64}$' and f.sha256=f.expected_sha256
 and uploader.enabled and uploader.epoch_id=f.app_epoch_id
 and not exists(select 1 from maintenance_private.account_access where user_id=f.user_id and not enabled)
 and not exists(select 1 from maintenance_private.account_access where user_id=h.owner_id and not enabled)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=h.owner_id and not enabled)
 and (h.owner_id=target_user or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=target_user));
 return result;
end;$$;
create or replace function public.page_maintenance_attachments(target_user uuid,verified_session uuid,expected_epoch uuid,target_product uuid,after_attachment uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare page jsonb; next_id uuid;
begin
 if not maintenance_private.attachment_read_session_allowed(target_user,verified_session,expected_epoch) then return jsonb_build_object('items','[]'::jsonb,'next',null); end if;
 with visible as (
 select f.id,f.size_bytes,f.mime,f.created_at
from maintenance_private.product_attachments f
 join maintenance_private.app_epochs uploader on uploader.user_id=f.user_id
 join public.products p on p.id=f.product_id join public.homes h on h.id=p."homeId"
 where f.product_id=target_product and (after_attachment is null or f.id>after_attachment) and f.state='stored' and not f.removal_pending and f.sha256 ~ '^[0-9a-f]{64}$' and f.sha256=f.expected_sha256
 and uploader.enabled and uploader.epoch_id=f.app_epoch_id
 and not exists(select 1 from maintenance_private.account_access where user_id=f.user_id and not enabled)
 and not exists(select 1 from maintenance_private.account_access where user_id=h.owner_id and not enabled)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=h.owner_id and not enabled)
 and (h.owner_id=target_user or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=target_user))
 order by f.id limit 26
 ), numbered as (select *,row_number() over(order by id) as n from visible)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'size',size_bytes,'mime',mime,'createdAt',created_at) order by id) filter(where n<=25),'[]'::jsonb),
 case when count(*)>25 then (array_agg(id order by id))[25] else null end
 into page,next_id from numbered;
 return jsonb_build_object('items',page,'next',next_id);
end;$$;

-- Uploader or captured owner may remove a file, without a current paid plan.
-- Current live caller binding is required; physical disappearance releases quota last.
create function public.begin_maintenance_attachment_removal(target_user uuid,verified_session uuid,expected_epoch uuid,target_attachment uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item maintenance_private.product_attachments; locked uuid;
begin
 select * into item from maintenance_private.product_attachments where id=target_attachment;
 if not found or item.captured_owner_id is null or (target_user<>item.user_id and target_user<>item.captured_owner_id) or target_user is null then return null; end if;
 for locked in select distinct value from unnest(array[item.user_id,item.captured_owner_id]) value order by value loop
  perform pg_advisory_xact_lock(hashtext(locked::text));
 end loop;
 if public.current_maintenance_purchase_account(target_user,verified_session) is distinct from expected_epoch or expected_epoch is null then return null; end if;
 select * into item from maintenance_private.product_attachments where id=target_attachment for update;
 if not found or item.captured_owner_id is null or (target_user<>item.user_id and target_user<>item.captured_owner_id) then return null; end if;
 if exists(select 1 from maintenance_private.account_access where user_id=item.captured_owner_id and not enabled)
 or exists(select 1 from maintenance_private.app_epochs where user_id=item.captured_owner_id and not enabled) then return null; end if;
 if not maintenance_private.attachment_write_is_quiet(target_attachment) then raise exception 'Attachment write not settled'; end if;
 update maintenance_private.product_attachments set removal_pending=true where id=target_attachment;
 return jsonb_build_object('id',item.id,'user',item.user_id,'epoch',item.app_epoch_id,'path',item.object_path,'mime',item.mime);
end;$$;
revoke all on function public.begin_maintenance_attachment_removal(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_maintenance_attachment_removal(uuid,uuid,uuid,uuid) to service_role;
create function public.complete_maintenance_attachment_removal(target_user uuid,verified_session uuid,expected_epoch uuid,target_attachment uuid,confirmed_path text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
 item=public.begin_maintenance_attachment_removal(target_user,verified_session,expected_epoch,target_attachment);
 if item is null or confirmed_path is distinct from item->>'path' then return false; end if;
 -- Trusted server must first remove via Storage API and confirm actual NoSuchKey.
 -- Metadata absence alone is not proof that physical bytes disappeared.
 if exists(select 1 from storage.objects where bucket_id='ouchi-product-attachments' and name=confirmed_path) then return false; end if;
 if not maintenance_private.attachment_write_is_quiet(target_attachment) then return false; end if;
 update maintenance_private.product_attachments set state='removed' where id=target_attachment and removal_pending;
 return found;
end;$$;
revoke all on function public.complete_maintenance_attachment_removal(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_maintenance_attachment_removal(uuid,uuid,uuid,uuid,text) to service_role;
commit;
