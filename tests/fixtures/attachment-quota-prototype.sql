-- TEST ONLY. Not a deployed migration or Storage bucket.
-- Caller service must first verify exact user bearer/session and signed Apple rights.
create table maintenance_private.product_attachments(
 id uuid primary key, user_id uuid not null references auth.users(id),
 app_epoch_id uuid not null, product_id uuid not null,
 size_bytes bigint not null check(size_bytes between 1 and 5242880),
 mime text not null check(mime in ('image/jpeg','image/png','application/pdf')),
 state text not null check(state in ('reserved','stored','removed')) default 'reserved',
 sha256 text check(sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now()
);
create index product_attachments_quota_idx on maintenance_private.product_attachments(user_id) where state<>'removed';
alter table maintenance_private.product_attachments enable row level security;
revoke all on maintenance_private.product_attachments from public,anon,authenticated;
grant select,insert,update on maintenance_private.product_attachments to service_role;
create function public.reserve_maintenance_attachment(target_user uuid,verified_session uuid,expected_epoch uuid,target_product uuid,attachment_id uuid,byte_count bigint,media_type text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare used_bytes bigint; used_files bigint; prior maintenance_private.product_attachments;
begin
 if target_user is null or expected_epoch is null or attachment_id is null or target_product is null or byte_count is null or byte_count not between 1 and 5242880 or media_type is null or media_type not in ('image/jpeg','image/png','application/pdf') then raise exception 'Invalid attachment'; end if;
 -- Same lock as enrollment closure, preventing a concurrent quota/enrollment race.
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not maintenance_private.epoch_session_allowed(target_user,verified_session,expected_epoch) then raise exception 'Inactive enrollment'; end if;
 if not exists(select 1 from public.products p join public.homes h on h.id=p."homeId" where p.id=target_product and (h.owner_id=target_user or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=target_user))) then raise exception 'Product unavailable'; end if;
 select * into prior from maintenance_private.product_attachments where id=attachment_id;
 if found then
  if prior.user_id=target_user and prior.app_epoch_id=expected_epoch and prior.product_id=target_product and prior.size_bytes=byte_count and prior.mime=media_type and prior.state<>'removed' then return prior.id; end if;
  raise exception 'Reservation conflict';
 end if;
 -- Include in-flight reservations and retained prior epochs; no quota escape via reenrollment.
 select coalesce(sum(size_bytes),0),count(*) into used_bytes,used_files from maintenance_private.product_attachments where user_id=target_user and state<>'removed';
 if used_bytes+byte_count>104857600 or used_files>=100 then raise exception 'Attachment quota exceeded'; end if;
 insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime) values(attachment_id,target_user,expected_epoch,target_product,byte_count,media_type);
 return attachment_id;
end;$$;
revoke all on function public.reserve_maintenance_attachment(uuid,uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.reserve_maintenance_attachment(uuid,uuid,uuid,uuid,uuid,bigint,text) to service_role;
-- Call only after the service verified the private Storage object and exact bytes.
-- No client-supplied checksum is evidence that the object exists.
create function public.finalize_maintenance_attachment(target_user uuid,verified_session uuid,expected_epoch uuid,attachment_id uuid,actual_bytes bigint,verified_sha256 text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare item maintenance_private.product_attachments;
begin
 if target_user is null or expected_epoch is null or attachment_id is null or actual_bytes is null or verified_sha256 is null or verified_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid completion'; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not maintenance_private.epoch_session_allowed(target_user,verified_session,expected_epoch) then raise exception 'Inactive enrollment'; end if;
 select * into item from maintenance_private.product_attachments where id=attachment_id for update;
 if not found or item.user_id<>target_user or item.app_epoch_id<>expected_epoch or item.size_bytes<>actual_bytes or item.state='removed' then raise exception 'Attachment unavailable'; end if;
 if not exists(select 1 from public.products p join public.homes h on h.id=p."homeId" where p.id=item.product_id and (h.owner_id=target_user or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=target_user))) then raise exception 'Product unavailable'; end if;
 if item.state='stored' then
  if item.sha256=verified_sha256 then return item.id; end if;
  raise exception 'Completion conflict';
 end if;
 update maintenance_private.product_attachments set state='stored',sha256=verified_sha256 where id=attachment_id;
 return attachment_id;
end;$$;
revoke all on function public.finalize_maintenance_attachment(uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.finalize_maintenance_attachment(uuid,uuid,uuid,uuid,bigint,text) to service_role;
