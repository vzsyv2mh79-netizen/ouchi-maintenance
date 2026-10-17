-- Disposable CI database only, after Storage has created its schema.
-- The service role is trusted server access; client grants still require RLS.
grant usage on schema storage to service_role,anon,authenticated;
grant all on all tables in schema storage to service_role;
grant usage,select on all sequences in schema storage to service_role;
grant execute on all functions in schema storage to service_role;
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant select,insert on storage.buckets,storage.objects to anon,authenticated;
-- No client policy is added: private bucket direct reads/uploads remain denied.

-- A write racing closure must serialize on the same enrollment lock.
-- This applies only to the disposable test bucket; other buckets are untouched.
create function maintenance_private.guard_attachment_object_write() returns trigger
language plpgsql security invoker set search_path='' as $$
declare owner_uuid uuid; epoch_uuid uuid; attachment_uuid uuid;
begin
 if new.bucket_id<>'ouchi-product-attachments-test' then return new; end if;
 if new.name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|pdf)$' then raise exception 'Invalid attachment path'; end if;
 owner_uuid:=split_part(new.name,'/',1)::uuid;epoch_uuid:=split_part(new.name,'/',2)::uuid;attachment_uuid:=split_part(split_part(new.name,'/',3),'.',1)::uuid;
 perform pg_advisory_xact_lock(hashtext(owner_uuid::text));
 if not exists(select 1 from maintenance_private.product_attachments f
 join maintenance_private.app_epochs a on a.user_id=f.user_id and a.epoch_id=f.app_epoch_id and a.enabled
 join public.products p on p.id=f.product_id join public.homes h on h.id=p."homeId"
 where f.id=attachment_uuid and f.user_id=owner_uuid and f.app_epoch_id=epoch_uuid and f.state in ('reserved','stored')
 and new.name=f.user_id::text||'/'||f.app_epoch_id::text||'/'||f.id::text||'.'||case f.mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'pdf' end
 and (h.owner_id=owner_uuid or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=owner_uuid))) then raise exception 'Inactive attachment reservation'; end if;
 return new;
end;$$;
revoke all on function maintenance_private.guard_attachment_object_write() from public,anon,authenticated;
grant execute on function maintenance_private.guard_attachment_object_write() to service_role;
create trigger attachment_object_write before insert or update of name,bucket_id on storage.objects for each row execute function maintenance_private.guard_attachment_object_write();
