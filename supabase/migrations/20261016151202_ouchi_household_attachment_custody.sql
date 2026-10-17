-- Dormant household-owned metadata/read boundary. No bucket/copy/activation
-- writer or customer-file mutation is created. Only a future checked dispatcher
-- may activate a verified copy after review, coverage and capacity admission.
begin;
create table maintenance_private.household_attachments(
 id uuid primary key,home_id uuid not null references public.homes(id) on delete restrict,
 home_instance_id uuid not null references maintenance_private.closure_home_instances(instance_id) on delete restrict,
 product_id uuid not null references public.products(id) on delete restrict,
 size_bytes bigint not null check(size_bytes between 1 and 5242880),
 mime text not null check(mime in('image/jpeg','image/png','application/pdf')),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 state text not null default 'staged' check(state in('staged','active','removed')),
 removal_pending boolean not null default false,created_at timestamptz not null default clock_timestamp(),
 object_path text generated always as('households/'||home_instance_id::text||'/'||id::text||'.'||case mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'pdf' end) stored
);
create index household_attachments_product on maintenance_private.household_attachments(product_id,id);
alter table maintenance_private.household_attachments enable row level security;
revoke all on maintenance_private.household_attachments from public,anon,authenticated,service_role,ouchi_closure_operator;
grant select on maintenance_private.household_attachments to service_role;

create function maintenance_private.guard_household_attachment_scope() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_schema='public' and tg_table_name='products' then
  if old."homeId" is distinct from new."homeId" and exists(select 1 from maintenance_private.household_attachments where product_id=old.id)
  then raise exception 'Household file custody must be reconciled before moving product'; end if;
 else
  if not exists(select 1 from maintenance_private.closure_home_instances i join public.products p on p."homeId"=i.home_id where i.home_id=new.home_id and i.instance_id=new.home_instance_id and p.id=new.product_id)
  then raise exception 'Matching household file incarnation required';end if;
  if tg_op='UPDATE' and row(old.id,old.home_id,old.home_instance_id,old.product_id,old.size_bytes,old.mime,old.sha256)
   is distinct from row(new.id,new.home_id,new.home_instance_id,new.product_id,new.size_bytes,new.mime,new.sha256)
  then raise exception 'Immutable household file scope';end if;
 end if;
 return new;
end;$$;
revoke all on function maintenance_private.guard_household_attachment_scope() from public,anon,authenticated,service_role,ouchi_closure_operator;
create trigger household_attachment_scope before insert or update on maintenance_private.household_attachments for each row execute function maintenance_private.guard_household_attachment_scope();
create trigger product_household_attachment_scope before update of "homeId" on public.products for each row execute function maintenance_private.guard_household_attachment_scope();

create function public.read_maintenance_household_attachment(target_user uuid,verified_session uuid,expected_epoch uuid,target_attachment uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',f.id,'homeID',f.home_id,'homeInstanceID',f.home_instance_id,'productID',f.product_id,'size',f.size_bytes,'mime',f.mime,'sha256',f.sha256,'objectPath',f.object_path)
 from maintenance_private.household_attachments f
 join maintenance_private.closure_home_instances i on i.home_id=f.home_id and i.instance_id=f.home_instance_id
 join public.homes h on h.id=f.home_id join public.products p on p.id=f.product_id and p."homeId"=h.id
 where f.id=target_attachment and f.state='active' and not f.removal_pending
 and exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 and public.read_maintenance_explicit_enrollment(target_user,verified_session)=expected_epoch
 and public.maintenance_auth_session_is_current(target_user,verified_session)
 and (h.owner_id=target_user or exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id=target_user));
$$;
create function public.page_maintenance_household_attachments(target_user uuid,verified_session uuid,expected_epoch uuid,target_product uuid,after_attachment uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 with visible as (
  select f.id,f.size_bytes,f.mime,f.created_at from maintenance_private.household_attachments f
  where f.product_id=target_product and (after_attachment is null or f.id>after_attachment)
   and public.read_maintenance_household_attachment(target_user,verified_session,expected_epoch,f.id) is not null
  order by f.id limit 26
 ), page as (select * from visible order by id limit 25)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'size',size_bytes,'mime',mime,'createdAt',created_at) order by id) from page),'[]'::jsonb),
  'next',case when (select count(*) from visible)>25 then (select id from page order by id desc limit 1) else null end);
$$;
revoke all on function public.read_maintenance_household_attachment(uuid,uuid,uuid,uuid),public.page_maintenance_household_attachments(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_maintenance_household_attachment(uuid,uuid,uuid,uuid),public.page_maintenance_household_attachments(uuid,uuid,uuid,uuid,uuid) to service_role;
commit;
