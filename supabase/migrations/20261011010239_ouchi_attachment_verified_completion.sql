begin;
-- Service-only metadata completion. Caller MUST download the immutable private
-- object and measure its bytes/hash; these arguments are not client evidence.
-- No upload route, paid entitlement, bucket or production worker is enabled.
create function public.finalize_maintenance_attachment(target_user uuid,verified_session uuid,expected_epoch uuid,attachment_id uuid,actual_bytes bigint,verified_sha256 text) returns uuid
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
 if item.state='stored' then
  if item.sha256=verified_sha256 then return item.id; end if;
  raise exception 'Completion conflict';
 end if;
 update maintenance_private.product_attachments set state='stored',sha256=verified_sha256 where id=attachment_id;
 return attachment_id;
end;$$;
revoke all on function public.finalize_maintenance_attachment(uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.finalize_maintenance_attachment(uuid,uuid,uuid,uuid,bigint,text) to service_role;
commit;
