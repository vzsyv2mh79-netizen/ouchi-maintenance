-- Disposable review overlay only; no migration, role, grants or public route.
-- Install AFTER shared-maintenance-object-absence.sql.
create table maintenance_private.shared_native_capture_contexts(
 backend_pid int not null,transaction_id bigint not null,scope jsonb not null,
 native_lease uuid not null,expires_at timestamptz not null,
 primary key(backend_pid,transaction_id));
alter table maintenance_private.shared_native_capture_contexts enable row level security;
revoke all on maintenance_private.shared_native_capture_contexts from public,anon,authenticated,service_role;

create function maintenance_private.shared_native_capture_scope_is_current(s jsonb,n uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j private.kb_shared_deletion_journal;b maintenance_private.household_stop_bindings;
 r maintenance_private.account_deletion_requests;app jsonb;item jsonb;st text;
 required text[]:=array['prepare','handoff-family','verify-family-before','verify-sessions-before'];
begin
 if not maintenance_private.valid_household_scope(s) then return false;end if;
 select value into app from jsonb_array_elements(s->'apps') where value->>'app'='ouchi-maintenance';
 if app is null or n::text=s->>'leaseToken' then return false;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=(s->>'requestID')::uuid;
 select * into b from maintenance_private.household_stop_bindings where user_id=(s->>'userID')::uuid;
 select * into r from maintenance_private.account_deletion_requests where id=(app->>'requestID')::uuid;
 if j.request_id is null or j.user_id::text is distinct from s->>'userID'
 or j.scope is distinct from s-'leaseToken' or j.status<>'processing'
 or j.lease_token::text is distinct from s->>'leaseToken' or j.lease_until is null or j.lease_until<=clock_timestamp()
 or b.user_id is null or b.scope is distinct from s or b.native_lease is distinct from n
 or b.state<>'processing' or b.lease_until<=clock_timestamp()
 or not exists(select 1 from maintenance_private.household_principal_fences where user_id=b.user_id and stopped)
 or r.id is null or r.user_id<>b.user_id or r.app_epoch_id::text is distinct from app->>'scopeID'
 or r.state<>'running' or r.lease_token is distinct from n or r.lease_until is null or r.lease_until<=clock_timestamp() then return false;end if;
 for item in select value from jsonb_array_elements(s->'apps') loop
  exit when item->>'app'='ouchi-maintenance';
  required:=required||array['erase:'||(item->>'app'),'verify:'||(item->>'app')];
 end loop;
 foreach st in array required loop
  if j.receipts->st->>'durable' is distinct from 'true' or j.receipts->st->>'stage' is distinct from st then return false;end if;
  if st='handoff-family' then
   if to_regclass('maintenance_private.shared_family_stage_contexts') is null
    or jsonb_typeof(j.receipts->st->'familyCoverageDigest') is distinct from 'string'
    or coalesce(j.receipts->st->>'familyCoverageDigest','') !~ '^[a-f0-9]{64}$'
    or ((j.receipts->st)-'durable'-'stage'-'familyCoverageDigest') is distinct from j.scope
    or not exists(select 1 from maintenance_private.shared_family_stage_contexts f where f.request_id=j.request_id
     and (f.scope-'leaseToken')=j.scope and f.receipt=j.receipts->st
     and f.coverage_digest=j.receipts->st->>'familyCoverageDigest') then return false;end if;
  elsif ((j.receipts->st)-'durable'-'stage') is distinct from j.scope then return false;end if;
 end loop;
 return true;
end $$;
revoke all on function maintenance_private.shared_native_capture_scope_is_current(jsonb,uuid) from public,anon,authenticated,service_role;

create function maintenance_private.shared_native_capture_write_matches(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare c maintenance_private.shared_native_capture_contexts;app jsonb;u uuid;
begin
 select * into c from maintenance_private.shared_native_capture_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 if not found or c.expires_at<=clock_timestamp() or not maintenance_private.shared_native_capture_scope_is_current(c.scope,c.native_lease) then return false;end if;
 select value into app from jsonb_array_elements(c.scope->'apps') where value->>'app'='ouchi-maintenance';u:=(c.scope->>'userID')::uuid;
 if sch is distinct from 'maintenance_private' then return false;end if;
 if tbl='account_access' and op='UPDATE' then
  return prior->>'user_id'=u::text and (prior-'enabled')=(next_value-'enabled') and next_value->'enabled'='false'::jsonb;
 elsif tbl='app_epochs' and op='UPDATE' then
  return prior->>'user_id'=u::text and prior->>'epoch_id'=app->>'scopeID'
   and (prior-'enabled')=(next_value-'enabled') and next_value->'enabled'='false'::jsonb;
 elsif tbl='account_deletion_requests' and op='UPDATE' then
  return prior->>'id'=app->>'requestID' and prior->>'user_id'=u::text and prior->>'app_epoch_id'=app->>'scopeID'
   and (prior-array['inventory_captured','updated_at'])=(next_value-array['inventory_captured','updated_at'])
   and next_value->'inventory_captured'='true'::jsonb;
 elsif tbl='account_deletion_objects' and op='INSERT' then
  return next_value->>'request_id'=app->>'requestID' and next_value->'absence_confirmed'='false'::jsonb
   and exists(select 1 from maintenance_private.product_attachments f
    where f.id::text=next_value->>'attachment_id' and f.user_id::text=next_value->>'uploader_id'
    and f.app_epoch_id::text=next_value->>'uploader_epoch' and f.object_path=next_value->>'object_path'
    and next_value->>'bucket'='ouchi-product-attachments'
    and ((f.user_id=u and f.app_epoch_id::text=app->>'scopeID') or f.captured_owner_id=u
     or exists(select 1 from public.products p join public.homes h on h.id=p."homeId" where p.id=f.product_id and h.owner_id=u)));
 end if;
 return false;
end $$;
revoke all on function maintenance_private.shared_native_capture_write_matches(text,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function maintenance_private.allowed_shared_native_stage_write(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare c maintenance_private.shared_native_attachment_contexts;app jsonb;
begin
 if exists(select 1 from maintenance_private.shared_native_capture_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current()) then
  if maintenance_private.shared_native_capture_write_matches(sch,tbl,op,prior,next_value) is distinct from true then raise exception 'Native capture write refused';end if;
  return true;
 end if;
 select * into c from maintenance_private.shared_native_attachment_contexts
  where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 if found then
  select value into app from jsonb_array_elements(c.scope->'apps') where value->>'app'='ouchi-maintenance';
  if c.expires_at<=clock_timestamp() or not maintenance_private.shared_native_attachment_scope_is_current(c.scope,c.native_lease)
   or sch is distinct from 'maintenance_private' or tbl is distinct from 'account_deletion_objects' or op is distinct from 'UPDATE'
   or prior->>'request_id' is distinct from app->>'requestID'
   or prior->>'attachment_id' is distinct from c.attachment_id::text
   or (prior-'absence_confirmed') is distinct from (next_value-'absence_confirmed')
   or next_value->'absence_confirmed' is distinct from 'true'::jsonb
   or exists(select 1 from storage.objects z where z.bucket_id=prior->>'bucket' and z.name=prior->>'object_path')
   or (exists(select 1 from maintenance_private.product_attachments f where f.id=c.attachment_id)
    and not maintenance_private.attachment_write_is_quiet(c.attachment_id)) then raise exception 'Attachment absence write refused';end if;
  return true;
 end if;
 -- Preserve the original strict metadata-stage behavior, with no stopped-user fallback.
 if not exists(select 1 from maintenance_private.shared_native_stage_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current()) then return false;end if;
 if maintenance_private.shared_native_stage_write_matches(sch,tbl,op,prior,next_value) is distinct from true then raise exception 'Native stage write refused';end if;
 return true;
end $$;

create function maintenance_private.capture_shared_native_deletion_objects(s jsonb,n uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare app jsonb;r maintenance_private.account_deletion_requests;ok boolean;
begin
 if not maintenance_private.valid_household_scope(s) then raise exception 'Exact capture scope required';end if;
 select value into app from jsonb_array_elements(s->'apps') where value->>'app'='ouchi-maintenance';
 if app is null then raise exception 'Exact native capture mapping required';end if;
 perform 1 from private.kb_shared_deletion_journal where request_id=(s->>'requestID')::uuid for update;
 perform pg_advisory_xact_lock(hashtext(s->>'userID'));
 perform 1 from maintenance_private.household_stop_bindings where user_id=(s->>'userID')::uuid for update;
 select * into r from maintenance_private.account_deletion_requests where id=(app->>'requestID')::uuid for update;
 if not maintenance_private.shared_native_capture_scope_is_current(s,n) then raise exception 'Current ordered family capture authority required';end if;
 insert into maintenance_private.shared_native_capture_contexts values(pg_backend_pid(),txid_current(),s,n,clock_timestamp()+interval '15 seconds');
 ok:=public.capture_maintenance_deletion_objects(r.id,r.user_id,r.app_epoch_id,n);
 delete from maintenance_private.shared_native_capture_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 if ok is distinct from true or not maintenance_private.shared_native_attachment_scope_is_current(s,n) then raise exception 'Canonical native inventory capture unconfirmed';end if;
 return true;
end $$;
revoke all on function maintenance_private.capture_shared_native_deletion_objects(jsonb,uuid) from public,anon,authenticated,service_role;
