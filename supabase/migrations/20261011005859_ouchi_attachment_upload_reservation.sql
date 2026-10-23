begin;
-- Additive upload preparation only. No bucket, endpoint or entitlement activation.
-- Existing metadata is retained; legacy null hashes are not proof of verified files.
alter table maintenance_private.product_attachments add column expected_sha256 text check(expected_sha256 ~ '^[0-9a-f]{64}$');
alter table maintenance_private.product_attachments add column sha256 text check(sha256 ~ '^[0-9a-f]{64}$');
create index attachment_quota_scope on maintenance_private.product_attachments(user_id) where state<>'removed';
grant update on maintenance_private.product_attachments to service_role;
grant select on public.home_members to service_role;
create function public.reserve_maintenance_attachment(target_user uuid,verified_session uuid,expected_epoch uuid,target_product uuid,attachment_id uuid,byte_count bigint,media_type text,measured_sha256 text) returns uuid
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
  if prior.user_id=target_user and prior.app_epoch_id=expected_epoch and prior.product_id=target_product and prior.size_bytes=byte_count and prior.mime=media_type and prior.expected_sha256=measured_sha256 and prior.state<>'removed' then return prior.id; end if;
  raise exception 'Reservation conflict';
 end if;
 -- Include in-flight reservations and retained prior epochs; no quota escape via reenrollment.
 select coalesce(sum(size_bytes),0),count(*) into used_bytes,used_files from maintenance_private.product_attachments where user_id=target_user and state<>'removed';
 if used_bytes+byte_count>104857600 or used_files>=100 then raise exception 'Attachment quota exceeded'; end if;
 insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,expected_sha256) values(attachment_id,target_user,expected_epoch,target_product,byte_count,media_type,measured_sha256);
 return attachment_id;
end;$$;
revoke all on function public.reserve_maintenance_attachment(uuid,uuid,uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.reserve_maintenance_attachment(uuid,uuid,uuid,uuid,uuid,bigint,text,text) to service_role;
commit;
