begin;
-- No remote writer, bucket, endpoint or cleanup scheduler is enabled here.
-- Unknown legacy operations are NOT assumed settled.
alter table maintenance_private.product_attachments add column write_tracking boolean not null default false;
create table maintenance_private.attachment_write_attempts (
 attachment_id uuid primary key references maintenance_private.product_attachments(id) on delete cascade,
 attempt_id uuid not null unique,
 uploader_id uuid not null,
 owner_id uuid not null,
 app_epoch_id uuid not null,
 state text not null default 'started' check(state in ('started','settled')),
 started_at timestamptz not null default now(),
 settled_at timestamptz,
 check((state='settled')=(settled_at is not null))
);
alter table maintenance_private.attachment_write_attempts enable row level security;
revoke all on maintenance_private.attachment_write_attempts from public,anon,authenticated;
grant select,insert,update,delete on maintenance_private.attachment_write_attempts to service_role;
create function public.begin_maintenance_attachment_write(target_user uuid,verified_session uuid,expected_epoch uuid,target_attachment uuid,target_attempt uuid) returns jsonb
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
 if not found or item.user_id<>target_user or item.app_epoch_id<>expected_epoch or not item.write_tracking or item.state<>'reserved' then raise exception 'Attachment unavailable'; end if;
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
revoke all on function public.begin_maintenance_attachment_write(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_maintenance_attachment_write(uuid,uuid,uuid,uuid,uuid) to service_role;
-- Only a trusted server with definitive terminal-operation evidence may settle.
-- A timeout, cancellation, lease expiry or missing object is NOT such evidence.
-- Closure must not prevent recording a write that definitively finished later.
create function public.settle_maintenance_attachment_write(target_attachment uuid,target_attempt uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare attempt maintenance_private.attachment_write_attempts;
begin
 select * into attempt from maintenance_private.attachment_write_attempts where attachment_id=target_attachment and attempt_id=target_attempt;
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtext(least(attempt.uploader_id::text,attempt.owner_id::text)));
 if attempt.uploader_id<>attempt.owner_id then perform pg_advisory_xact_lock(hashtext(greatest(attempt.uploader_id::text,attempt.owner_id::text))); end if;
 update maintenance_private.attachment_write_attempts set state='settled',settled_at=coalesce(settled_at,now()) where attachment_id=target_attachment and attempt_id=target_attempt;
 return found;
end;$$;
revoke all on function public.settle_maintenance_attachment_write(uuid,uuid) from public,anon,authenticated;
grant execute on function public.settle_maintenance_attachment_write(uuid,uuid) to service_role;
create function maintenance_private.attachment_write_is_quiet(target_attachment uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.product_attachments f where f.id=target_attachment and f.write_tracking)
 and not exists(select 1 from maintenance_private.attachment_write_attempts a where a.attachment_id=target_attachment and a.state<>'settled');
$$;
revoke all on function maintenance_private.attachment_write_is_quiet(uuid) from public,anon,authenticated;
grant execute on function maintenance_private.attachment_write_is_quiet(uuid) to service_role;

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
  if prior.user_id=target_user and prior.app_epoch_id=expected_epoch and prior.product_id=target_product and prior.size_bytes=byte_count and prior.mime=media_type and prior.expected_sha256=measured_sha256 and prior.state<>'removed' then return prior.id; end if;
  raise exception 'Reservation conflict';
 end if;
 -- Include in-flight reservations and retained prior epochs; no quota escape via reenrollment.
 select coalesce(sum(size_bytes),0),count(*) into used_bytes,used_files from maintenance_private.product_attachments where user_id=target_user and state<>'removed';
 if used_bytes+byte_count>104857600 or used_files>=100 then raise exception 'Attachment quota exceeded'; end if;
 insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,expected_sha256,write_tracking) values(attachment_id,target_user,expected_epoch,target_product,byte_count,media_type,measured_sha256,true);
 return attachment_id;
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
 if not found or item.user_id<>target_user or item.app_epoch_id<>expected_epoch or item.size_bytes<>actual_bytes or item.expected_sha256 is distinct from verified_sha256 or item.state='removed' then raise exception 'Attachment unavailable'; end if;
 if not exists(select 1 from public.products p join public.homes h on h.id=p."homeId" where p.id=item.product_id and h.owner_id=owner_uuid and (h.owner_id=target_user or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=target_user))) then raise exception 'Product unavailable'; end if;
 if not exists(select 1 from maintenance_private.attachment_write_attempts a where a.attachment_id=item.id and a.state='settled') then raise exception 'Write not settled'; end if;
 if item.state='stored' then
  if item.sha256=verified_sha256 then return item.id; end if;
  raise exception 'Completion conflict';
 end if;
 update maintenance_private.product_attachments set state='stored',sha256=verified_sha256 where id=attachment_id;
 return attachment_id;
end;$$;
create or replace function public.confirm_maintenance_deletion_object_absence(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid,target_attachment uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare item maintenance_private.account_deletion_objects;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 select * into item from maintenance_private.account_deletion_objects where request_id=target_request and attachment_id=target_attachment for update;
 if not found then return false; end if;
 if exists(select 1 from maintenance_private.product_attachments where id=target_attachment) and not maintenance_private.attachment_write_is_quiet(target_attachment) then return false; end if;
 if exists(select 1 from storage.objects where bucket_id=item.bucket and name=item.object_path) then return false; end if;
 update maintenance_private.account_deletion_objects set absence_confirmed=true where request_id=target_request and attachment_id=target_attachment;
 return true;
end;$$;
create or replace function public.erase_maintenance_deletion_records(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
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
commit;
