begin;
-- Formal metadata/inventory only. No bucket, upload endpoint, paid feature,
-- deletion worker or production activation is created here.
create table maintenance_private.product_attachments (
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 app_epoch_id uuid not null,
 product_id uuid not null,
 size_bytes bigint not null check(size_bytes between 1 and 5242880),
 mime text not null check(mime in ('image/jpeg','image/png','application/pdf')),
 state text not null default 'reserved' check(state in ('reserved','stored','removed')),
 created_at timestamptz not null default now(),
 object_path text generated always as (user_id::text||'/'||app_epoch_id::text||'/'||id::text||'.'||case mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'pdf' end) stored
);
create index attachment_product_scope on maintenance_private.product_attachments(product_id);
create index attachment_owner_scope on maintenance_private.product_attachments(user_id,app_epoch_id);
alter table maintenance_private.product_attachments enable row level security;
revoke all on maintenance_private.product_attachments from public,anon,authenticated;
grant select,insert on maintenance_private.product_attachments to service_role;
create table maintenance_private.account_deletion_objects (
 request_id uuid not null references maintenance_private.account_deletion_requests(id),
 attachment_id uuid not null,
 uploader_id uuid not null,
 uploader_epoch uuid not null,
 bucket text not null check(bucket='ouchi-product-attachments'),
 object_path text not null,
 absence_confirmed boolean not null default false,
 primary key(request_id,attachment_id)
);
alter table maintenance_private.account_deletion_objects enable row level security;
revoke all on maintenance_private.account_deletion_objects from public,anon,authenticated;
grant select,insert on maintenance_private.account_deletion_objects to service_role;
alter table maintenance_private.account_deletion_requests add column inventory_captured boolean not null default false;
grant update(inventory_captured) on maintenance_private.account_deletion_requests to service_role;
grant select on public.homes,public.products to service_role;
grant update(id) on public.homes to service_role;
create function public.capture_maintenance_deletion_objects(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
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
 or exists(select 1 from public.products p join public.homes h on h.id=p."homeId" where p.id=f.product_id and h.owner_id=target_user))
 on conflict(request_id,attachment_id) do nothing;
 update maintenance_private.account_deletion_requests set inventory_captured=true,updated_at=now() where id=target_request;
 return true;
end;$$;
revoke all on function public.capture_maintenance_deletion_objects(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.capture_maintenance_deletion_objects(uuid,uuid,uuid,uuid) to service_role;
commit;
