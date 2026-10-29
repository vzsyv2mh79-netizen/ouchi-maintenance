-- Dormant ordinary-deletion capacity minimization. Confirmed API absence is
-- NOT provider-wide GC: held bytes move to opaque quarantine, never freed.
-- No policy adoption, new runtime principal, bucket or schedule is enabled.
begin;
create table maintenance_private.deletion_capacity_moves(
 request_id uuid not null references maintenance_private.account_deletion_requests(id) on delete cascade,
 attachment_id uuid not null,lease_token uuid not null,claim_id uuid not null unique,
 hold_id uuid not null unique,size_bytes bigint not null check(size_bytes between 1 and 5242880),
 object_path_digest text not null check(object_path_digest ~ '^[a-f0-9]{64}$'),
 primary key(request_id,attachment_id)
);
alter table maintenance_private.deletion_capacity_moves enable row level security;
revoke all on maintenance_private.deletion_capacity_moves from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor,ouchi_closure_inspector;

-- Trigger-only proof. Neither browser nor runtime can fabricate a move row.
create function maintenance_private.ordinary_capacity_move_is_current(expected_claim uuid,expected_hold uuid,expected_size bigint)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from maintenance_private.deletion_capacity_moves m
 join maintenance_private.attachment_capacity_claims c on c.claim_id=m.claim_id and c.size_bytes=m.size_bytes
 join maintenance_private.account_deletion_objects o on o.request_id=m.request_id and o.attachment_id=m.attachment_id and o.object_path=c.object_path and o.absence_confirmed
 join maintenance_private.account_deletion_requests r on r.id=m.request_id
 join maintenance_private.retired_attachment_ids retired on retired.attachment_id=m.attachment_id
 where (expected_claim is null or m.claim_id=expected_claim) and m.hold_id=expected_hold and m.size_bytes=expected_size
 and m.object_path_digest=encode(sha256(convert_to(c.object_path,'UTF8')),'hex')
 and r.state='running' and r.lease_token=m.lease_token and r.lease_until>clock_timestamp() and r.inventory_captured and r.records_erased
 and not exists(select 1 from maintenance_private.product_attachments where id=m.attachment_id)
 and not exists(select 1 from maintenance_private.household_attachments where id=m.attachment_id)
 and not exists(select 1 from maintenance_private.attachment_write_attempts where attachment_id=m.attachment_id));
$$;
revoke all on function maintenance_private.ordinary_capacity_move_is_current(uuid,uuid,bigint) from public,anon,authenticated,service_role,ouchi_closure_operator,ouchi_retirement_file_executor,ouchi_closure_inspector;

create or replace function maintenance_private.guard_capacity_quarantine() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Unverified physical capacity remains held';end if;
 if not exists(select 1 from maintenance_private.retirement_capacity_moves m join maintenance_private.attachment_capacity_claims c on c.claim_id=m.claim_id where m.hold_id=new.hold_id and m.size_bytes=new.size_bytes and c.size_bytes=new.size_bytes and m.object_path_digest=encode(sha256(convert_to(c.object_path,'UTF8')),'hex')) and not maintenance_private.ordinary_capacity_move_is_current(null,new.hold_id,new.size_bytes) then raise exception 'Exact held-capacity move required';end if;
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
   where m.claim_id=old.claim_id and m.size_bytes=old.size_bytes and m.object_path_digest=encode(sha256(convert_to(old.object_path,'UTF8')),'hex') and m.cleanup_fingerprint=f.cleanup_fingerprint and o.cleanup_fingerprint=f.cleanup_fingerprint and f.state='absence_confirmed') and not exists(select 1 from maintenance_private.deletion_capacity_moves m join maintenance_private.attachment_capacity_quarantine q on q.hold_id=m.hold_id and q.size_bytes=m.size_bytes where m.claim_id=old.claim_id and maintenance_private.ordinary_capacity_move_is_current(old.claim_id,m.hold_id,old.size_bytes)) then raise exception 'Capacity claim is immutable';end if;
  return old;
 end if;
 if tg_op<>'INSERT' and not exists(select 1 from maintenance_private.deletion_capacity_moves m join maintenance_private.attachment_capacity_quarantine q on q.hold_id=m.hold_id and q.size_bytes=m.size_bytes where m.claim_id=old.claim_id and maintenance_private.ordinary_capacity_move_is_current(old.claim_id,m.hold_id,old.size_bytes)) then raise exception 'Capacity claim is immutable';end if;
 select * into policy from maintenance_private.attachment_app_budget_policy where id=1;
 if not found or not policy.enabled or not policy.writer_coverage_verified then raise exception 'App storage budget unavailable';end if;
 held:=maintenance_private.held_attachment_capacity_bytes();
 if held+new.size_bytes>policy.budget_bytes then raise exception 'App storage budget exceeded';end if;return new;
end;$$;

-- The same existing service RPC is the sole entrance; exact job, captured paths,
-- durable absence and removed quiet metadata are checked inside this transaction.
create or replace function public.minimize_maintenance_deletion_object_inventory(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare item record;claim maintenance_private.attachment_capacity_claims;hold uuid;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Fresh capacity minimization transaction required';end if;
 -- Match reviewed finalization: budget -> account -> job -> attachment identity.
 perform maintenance_private.lock_attachment_app_budget();
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false;end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured and records_erased)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed) then return false;end if;
 if not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled) then return false;end if;
 -- Unknown path claims are not inferred absent or silently discarded.
 if exists(select 1 from maintenance_private.attachment_capacity_claims c where split_part(c.object_path,'/',1)=target_user::text
 and not exists(select 1 from maintenance_private.account_deletion_objects o where o.request_id=target_request and o.object_path=c.object_path and o.absence_confirmed)) then return false;end if;
 for item in select * from maintenance_private.account_deletion_objects where request_id=target_request order by attachment_id loop
  perform maintenance_private.lock_attachment_identity(item.attachment_id);
  if exists(select 1 from maintenance_private.product_attachments where id=item.attachment_id)
  or exists(select 1 from maintenance_private.household_attachments where id=item.attachment_id)
  or exists(select 1 from maintenance_private.attachment_write_attempts where attachment_id=item.attachment_id) then raise exception 'Removed quiet attachment metadata required';end if;
  insert into maintenance_private.retired_attachment_ids(attachment_id) values(item.attachment_id) on conflict do nothing;
  select * into claim from maintenance_private.attachment_capacity_claims where object_path=item.object_path for update;
  if found then
   hold:=gen_random_uuid();
   insert into maintenance_private.deletion_capacity_moves values(target_request,item.attachment_id,target_lease,claim.claim_id,hold,claim.size_bytes,encode(sha256(convert_to(claim.object_path,'UTF8')),'hex'));
   insert into maintenance_private.attachment_capacity_quarantine(hold_id,size_bytes) values(hold,claim.size_bytes);
   delete from maintenance_private.attachment_capacity_claims where claim_id=claim.claim_id;
  end if;
 end loop;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then raise exception 'Capacity minimization lease expired';end if;
 -- Drop correlation in this same commit. Quarantine retains only random ID/bytes.
 delete from maintenance_private.deletion_capacity_moves where request_id=target_request;
 delete from maintenance_private.account_deletion_objects where request_id=target_request;
 return true;
end;$$;
revoke all on function public.minimize_maintenance_deletion_object_inventory(uuid,uuid,uuid,uuid) from public,anon,authenticated,ouchi_closure_operator,ouchi_retirement_file_executor,ouchi_closure_inspector;
grant execute on function public.minimize_maintenance_deletion_object_inventory(uuid,uuid,uuid,uuid) to service_role;
commit;
