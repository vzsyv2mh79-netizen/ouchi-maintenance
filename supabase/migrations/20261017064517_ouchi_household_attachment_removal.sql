-- Prepared member removal for established household files. No bucket, feature
-- flag, worker, fee, principal, retention policy or customer action is enabled.
begin;
alter table maintenance_private.household_attachments add column removal_requested_at timestamptz;
-- Content-free idempotency receipts live with the shared product/home, not the
-- initiating member. Deleting either parent cascades the receipt. No actor,
-- uploader, original account/epoch, name, hash, object path or file bytes remain.
create table maintenance_private.household_file_removal_receipts(
 attachment_id uuid primary key,
 home_id uuid not null references public.homes(id) on delete cascade,
 home_instance_id uuid not null references maintenance_private.closure_home_instances(instance_id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade,
 mime text not null check(mime in('image/jpeg','image/png','application/pdf')),
 completed_at timestamptz not null default clock_timestamp()
);
create index household_file_removal_receipts_product on maintenance_private.household_file_removal_receipts(product_id);
alter table maintenance_private.household_file_removal_receipts enable row level security;
revoke all on maintenance_private.household_file_removal_receipts from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor,ouchi_closure_inspector;
create table maintenance_private.household_removal_capacity_moves(
 attachment_id uuid primary key references maintenance_private.household_attachments(id) on delete restrict,
 claim_id uuid not null unique,hold_id uuid not null unique,
 size_bytes bigint not null check(size_bytes between 1 and 5242880),
 object_path_digest text not null check(object_path_digest ~ '^[a-f0-9]{64}$')
);
alter table maintenance_private.household_removal_capacity_moves enable row level security;
revoke all on maintenance_private.household_removal_capacity_moves from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor,ouchi_closure_inspector;

create function maintenance_private.lock_household_file_member(target_user uuid,verified_session uuid,expected_epoch uuid,target_home uuid,target_instance uuid,target_product uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh household removal transaction required';end if;
 if target_user is null or verified_session is null or expected_epoch is null then return false;end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if not exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 or public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from expected_epoch
 or not public.maintenance_auth_session_is_current(target_user,verified_session) then return false;end if;
 perform 1 from public.homes h join maintenance_private.closure_home_instances i on i.home_id=h.id
 join public.products p on p."homeId"=h.id
 where h.id=target_home and i.instance_id=target_instance and p.id=target_product for update of h,p;
 if not found then return false;end if;
 if exists(select 1 from public.homes where id=target_home and owner_id=target_user) then return true;end if;
 perform 1 from public.home_members where "homeId"=target_home and user_id=target_user for share;
 return found;
end;$$;
revoke all on function maintenance_private.lock_household_file_member(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor,ouchi_closure_inspector;

create function maintenance_private.household_removal_move_is_current(expected_claim uuid,expected_hold uuid,expected_size bigint)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from maintenance_private.household_removal_capacity_moves m
 join maintenance_private.household_attachments f on f.id=m.attachment_id
 join maintenance_private.household_attachment_origins o on o.attachment_id=f.id and o.home_instance_id=f.home_instance_id and o.size_bytes=f.size_bytes and o.mime=f.mime and o.sha256=f.sha256
 join maintenance_private.attachment_capacity_claims c on c.claim_id=m.claim_id and c.object_path=f.object_path and c.size_bytes=f.size_bytes
 join maintenance_private.retired_attachment_ids r on r.attachment_id=f.id
 where (expected_claim is null or m.claim_id=expected_claim) and m.hold_id=expected_hold and m.size_bytes=expected_size
 and m.size_bytes=c.size_bytes and m.object_path_digest=encode(sha256(convert_to(c.object_path,'UTF8')),'hex')
 and f.state='active' and f.removal_pending and f.removal_requested_at is not null
 and not exists(select 1 from maintenance_private.household_copy_intents where household_attachment_id=f.id)
 and not exists(select 1 from maintenance_private.reviewed_retirement_files where state='pending' and ((kind='household_file' and attachment_id=f.id) or retained_asset_id=f.id)));
$$;
revoke all on function maintenance_private.household_removal_move_is_current(uuid,uuid,bigint) from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor,ouchi_closure_inspector;

create or replace function maintenance_private.guard_capacity_quarantine() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Unverified physical capacity remains held';end if;
 if not exists(select 1 from maintenance_private.retirement_capacity_moves m join maintenance_private.attachment_capacity_claims c on c.claim_id=m.claim_id where m.hold_id=new.hold_id and m.size_bytes=new.size_bytes and c.size_bytes=new.size_bytes and m.object_path_digest=encode(sha256(convert_to(c.object_path,'UTF8')),'hex')) and not maintenance_private.ordinary_capacity_move_is_current(null,new.hold_id,new.size_bytes) and not maintenance_private.household_removal_move_is_current(null,new.hold_id,new.size_bytes) then raise exception 'Exact held-capacity move required';end if;
 return new;
end;$$;
revoke all on function maintenance_private.guard_capacity_quarantine() from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor;
create or replace function maintenance_private.guard_attachment_capacity_claim() returns trigger
language plpgsql security definer set search_path='' as $$
declare policy maintenance_private.attachment_app_budget_policy;held numeric;
begin
 perform maintenance_private.lock_attachment_app_budget();
 if tg_op='DELETE' then
  if not exists(select 1 from maintenance_private.retirement_capacity_moves m
   join maintenance_private.attachment_capacity_quarantine q on q.hold_id=m.hold_id and q.size_bytes=m.size_bytes
   join maintenance_private.reviewed_retirement_files f on (f.request_id,f.kind,f.attachment_id)=(m.request_id,m.kind,m.attachment_id)
   join maintenance_private.retirement_file_absence_observations o on (o.request_id,o.kind,o.attachment_id)=(m.request_id,m.kind,m.attachment_id)
   join maintenance_private.retired_attachment_ids retired on retired.attachment_id=f.attachment_id
   where m.claim_id=old.claim_id and m.size_bytes=old.size_bytes and m.object_path_digest=encode(sha256(convert_to(old.object_path,'UTF8')),'hex') and m.cleanup_fingerprint=f.cleanup_fingerprint and o.cleanup_fingerprint=f.cleanup_fingerprint and f.state='absence_confirmed') and not exists(select 1 from maintenance_private.deletion_capacity_moves m join maintenance_private.attachment_capacity_quarantine q on q.hold_id=m.hold_id and q.size_bytes=m.size_bytes where m.claim_id=old.claim_id and maintenance_private.ordinary_capacity_move_is_current(old.claim_id,m.hold_id,old.size_bytes)) and not exists(select 1 from maintenance_private.household_removal_capacity_moves m join maintenance_private.attachment_capacity_quarantine q on q.hold_id=m.hold_id and q.size_bytes=m.size_bytes where m.claim_id=old.claim_id and maintenance_private.household_removal_move_is_current(old.claim_id,m.hold_id,old.size_bytes)) then raise exception 'Capacity claim is immutable';end if;
  return old;
 end if;
 if tg_op<>'INSERT' and not exists(select 1 from maintenance_private.deletion_capacity_moves m join maintenance_private.attachment_capacity_quarantine q on q.hold_id=m.hold_id and q.size_bytes=m.size_bytes where m.claim_id=old.claim_id and maintenance_private.ordinary_capacity_move_is_current(old.claim_id,m.hold_id,old.size_bytes)) then raise exception 'Capacity claim is immutable';end if;
 select * into policy from maintenance_private.attachment_app_budget_policy where id=1;
 if not found or not policy.enabled or not policy.writer_coverage_verified then raise exception 'App storage budget unavailable';end if;
 held:=maintenance_private.held_attachment_capacity_bytes();
 if held+new.size_bytes>policy.budget_bytes then raise exception 'App storage budget exceeded';end if;return new;
end;$$;

create function public.begin_maintenance_household_attachment_removal(target_user uuid,verified_session uuid,expected_epoch uuid,target_attachment uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare f maintenance_private.household_attachments;r maintenance_private.household_file_removal_receipts;
begin
 select * into r from maintenance_private.household_file_removal_receipts where attachment_id=target_attachment;
 if found then
  if not maintenance_private.lock_household_file_member(target_user,verified_session,expected_epoch,r.home_id,r.home_instance_id,r.product_id) then return null;end if;
  return jsonb_build_object('phase','removed','id',r.attachment_id,'homeID',r.home_id,'homeInstanceID',r.home_instance_id,'productID',r.product_id);
 end if;
 select * into f from maintenance_private.household_attachments where id=target_attachment;
 if not found or not maintenance_private.lock_household_file_member(target_user,verified_session,expected_epoch,f.home_id,f.home_instance_id,f.product_id) then return null;end if;
 perform maintenance_private.lock_attachment_identity(target_attachment);
 select * into f from maintenance_private.household_attachments where id=target_attachment for update;
 if not found or f.state<>'active' then return null;end if;
 if not exists(select 1 from maintenance_private.household_attachment_origins o where o.attachment_id=f.id and o.home_instance_id=f.home_instance_id and o.size_bytes=f.size_bytes and o.mime=f.mime and o.sha256=f.sha256)
 or exists(select 1 from maintenance_private.household_copy_intents where household_attachment_id=f.id)
 or exists(select 1 from maintenance_private.reviewed_retirement_files where state='pending' and ((kind='household_file' and attachment_id=f.id) or retained_asset_id=f.id)) then return null;end if;
 update maintenance_private.household_attachments set removal_pending=true,removal_requested_at=coalesce(removal_requested_at,clock_timestamp()) where id=f.id;
 return jsonb_build_object('phase','pending','id',f.id,'homeID',f.home_id,'homeInstanceID',f.home_instance_id,'productID',f.product_id,'size',f.size_bytes,'mime',f.mime,'sha256',f.sha256,'objectPath',f.object_path);
end;$$;
revoke all on function public.begin_maintenance_household_attachment_removal(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_maintenance_household_attachment_removal(uuid,uuid,uuid,uuid) to service_role;

create function public.complete_maintenance_household_attachment_removal(target_user uuid,verified_session uuid,expected_epoch uuid,target_attachment uuid,expected_home_instance uuid,confirmed_path text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare f maintenance_private.household_attachments;r maintenance_private.household_file_removal_receipts;c maintenance_private.attachment_capacity_claims;hold uuid;
begin
 perform maintenance_private.lock_attachment_app_budget();
 select * into r from maintenance_private.household_file_removal_receipts where attachment_id=target_attachment;
 if found then return r.home_instance_id=expected_home_instance and confirmed_path='households/'||r.home_instance_id::text||'/'||r.attachment_id::text||'.'||case r.mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'pdf' end
  and maintenance_private.lock_household_file_member(target_user,verified_session,expected_epoch,r.home_id,r.home_instance_id,r.product_id);end if;
 select * into f from maintenance_private.household_attachments where id=target_attachment;
 if not found or f.home_instance_id is distinct from expected_home_instance or f.object_path is distinct from confirmed_path
 or not maintenance_private.lock_household_file_member(target_user,verified_session,expected_epoch,f.home_id,f.home_instance_id,f.product_id) then return false;end if;
 perform maintenance_private.lock_attachment_identity(target_attachment);
 select * into f from maintenance_private.household_attachments where id=target_attachment for update;
 if not found or f.state<>'active' or not f.removal_pending or f.removal_requested_at is null
 or f.home_instance_id is distinct from expected_home_instance or f.object_path is distinct from confirmed_path then return false;end if;
 if exists(select 1 from storage.objects where bucket_id='ouchi-product-attachments' and name=f.object_path)
 or not exists(select 1 from maintenance_private.household_attachment_origins o where o.attachment_id=f.id and o.home_instance_id=f.home_instance_id and o.size_bytes=f.size_bytes and o.mime=f.mime and o.sha256=f.sha256)
 or exists(select 1 from maintenance_private.household_copy_intents where household_attachment_id=f.id)
 or exists(select 1 from maintenance_private.reviewed_retirement_files where state='pending' and ((kind='household_file' and attachment_id=f.id) or retained_asset_id=f.id)) then return false;end if;
 select * into c from maintenance_private.attachment_capacity_claims where object_path=f.object_path and size_bytes=f.size_bytes for update;
 if not found then return false;end if;
 insert into maintenance_private.retired_attachment_ids(attachment_id) values(f.id) on conflict do nothing;
 hold:=gen_random_uuid();insert into maintenance_private.household_removal_capacity_moves values(f.id,c.claim_id,hold,c.size_bytes,encode(sha256(convert_to(c.object_path,'UTF8')),'hex'));
 insert into maintenance_private.attachment_capacity_quarantine(hold_id,size_bytes) values(hold,c.size_bytes);
 delete from maintenance_private.attachment_capacity_claims where claim_id=c.claim_id;
 delete from maintenance_private.household_removal_capacity_moves where attachment_id=f.id;
 insert into maintenance_private.household_file_removal_receipts(attachment_id,home_id,home_instance_id,product_id,mime) values(f.id,f.home_id,f.home_instance_id,f.product_id,f.mime);
 delete from maintenance_private.household_attachments where id=f.id;
 return true;
end;$$;
revoke all on function public.complete_maintenance_household_attachment_removal(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_maintenance_household_attachment_removal(uuid,uuid,uuid,uuid,uuid,text) to service_role;

create function public.page_maintenance_household_attachment_removals(target_user uuid,verified_session uuid,expected_epoch uuid,target_product uuid,after_attachment uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare h uuid;i uuid;items jsonb;more boolean;last_id uuid;
begin
 select f.home_id,f.home_instance_id into h,i from maintenance_private.household_attachments f where product_id=target_product limit 1;
 if not found or not maintenance_private.lock_household_file_member(target_user,verified_session,expected_epoch,h,i,target_product) then return jsonb_build_object('items','[]'::jsonb,'next',null);end if;
 with candidates as(select id,size_bytes,mime,created_at from maintenance_private.household_attachments where product_id=target_product and home_id=h and home_instance_id=i and state='active' and removal_pending and (after_attachment is null or id>after_attachment) order by id limit 26),page as(select * from candidates order by id limit 25)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'size',size_bytes,'mime',mime,'createdAt',created_at) order by id) from page),'[]'::jsonb),(select count(*)>25 from candidates),(select id from page order by id desc limit 1) into items,more,last_id;
 return jsonb_build_object('items',items,'next',case when more then last_id else null end);
end;$$;
revoke all on function public.page_maintenance_household_attachment_removals(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.page_maintenance_household_attachment_removals(uuid,uuid,uuid,uuid,uuid) to service_role;
commit;
