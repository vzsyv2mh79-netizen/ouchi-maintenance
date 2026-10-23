-- Disposable review capability only; no production migration, role or grant.
-- Must be installed AFTER shared-maintenance-native-stage.sql.
create table maintenance_private.shared_native_attachment_contexts(
 backend_pid int not null,transaction_id bigint not null,scope jsonb not null,
 native_lease uuid not null,attachment_id uuid not null,expires_at timestamptz not null,
 primary key(backend_pid,transaction_id));
alter table maintenance_private.shared_native_attachment_contexts enable row level security;
revoke all on maintenance_private.shared_native_attachment_contexts from public,anon,authenticated,service_role;

create function maintenance_private.shared_native_attachment_scope_is_current(s jsonb,n uuid)
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
 or r.state<>'running' or r.lease_token is distinct from n or r.lease_until is null or r.lease_until<=clock_timestamp()
 or not r.inventory_captured then return false;end if;
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
revoke all on function maintenance_private.shared_native_attachment_scope_is_current(jsonb,uuid) from public,anon,authenticated,service_role;

create function maintenance_private.shared_native_object_absence_is_confirmed(s jsonb,n uuid,a uuid)
returns boolean language sql security invoker set search_path='' as $$
 select maintenance_private.shared_native_attachment_scope_is_current(s,n)
 and exists(select 1 from maintenance_private.account_deletion_objects o
  where o.request_id=(select (x->>'requestID')::uuid from jsonb_array_elements(s->'apps') x where x->>'app'='ouchi-maintenance')
  and o.attachment_id=a and o.absence_confirmed
  and not exists(select 1 from storage.objects z where z.bucket_id=o.bucket and z.name=o.object_path)
  and (not exists(select 1 from maintenance_private.product_attachments f where f.id=a)
   or maintenance_private.attachment_write_is_quiet(a)))
$$;
revoke all on function maintenance_private.shared_native_object_absence_is_confirmed(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function maintenance_private.allowed_shared_native_stage_write(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare c maintenance_private.shared_native_attachment_contexts;app jsonb;
begin
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

create function maintenance_private.confirm_shared_native_object_absence(s jsonb,n uuid,a uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare app jsonb;r maintenance_private.account_deletion_requests;ok boolean;
begin
 if not maintenance_private.valid_household_scope(s) then raise exception 'Exact shared attachment scope required';end if;
 select value into app from jsonb_array_elements(s->'apps') where value->>'app'='ouchi-maintenance';
 if app is null then raise exception 'Native attachment mapping required';end if;
 perform 1 from private.kb_shared_deletion_journal where request_id=(s->>'requestID')::uuid for update;
 perform pg_advisory_xact_lock(hashtext(s->>'userID'));
 perform 1 from maintenance_private.household_stop_bindings where user_id=(s->>'userID')::uuid for update;
 select * into r from maintenance_private.account_deletion_requests where id=(app->>'requestID')::uuid for update;
 if not maintenance_private.shared_native_attachment_scope_is_current(s,n)
  or not exists(select 1 from maintenance_private.account_deletion_objects where request_id=r.id and attachment_id=a) then raise exception 'Current original attachment inventory required';end if;
 insert into maintenance_private.shared_native_attachment_contexts values(pg_backend_pid(),txid_current(),s,n,a,clock_timestamp()+interval '15 seconds');
 ok:=public.confirm_maintenance_deletion_object_absence(r.id,r.user_id,r.app_epoch_id,n,a);
 delete from maintenance_private.shared_native_attachment_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 if ok is distinct from true or not maintenance_private.shared_native_object_absence_is_confirmed(s,n,a) then raise exception 'Exact object absence acknowledgement required';end if;
 return true;
end $$;
revoke all on function maintenance_private.confirm_shared_native_object_absence(jsonb,uuid,uuid) from public,anon,authenticated,service_role;
