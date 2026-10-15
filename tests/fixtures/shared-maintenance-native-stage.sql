-- Review candidate ONLY, not a production migration or deployment grant.
-- Requires the existing shared journal, private-writer and household fences.
-- No caller-supplied SQL, row allowlist, GUC capability or arbitrary callback.
create table maintenance_private.shared_native_stage_contexts(
 backend_pid int not null,transaction_id bigint not null,scope jsonb not null,
 native_request uuid not null,native_epoch uuid not null,native_lease uuid not null,
 stage text not null check(stage in('eraseRecords','eraseDeviceRegistrations','captureReceiptSessions','eraseIdentity','markComplete')),
 expires_at timestamptz not null,primary key(backend_pid,transaction_id));
alter table maintenance_private.shared_native_stage_contexts enable row level security;
revoke all on maintenance_private.shared_native_stage_contexts from public,anon,authenticated,service_role;

create function maintenance_private.current_shared_native_stage()
returns maintenance_private.shared_native_stage_contexts
language plpgsql security definer set search_path='' as $$
declare c maintenance_private.shared_native_stage_contexts;j private.kb_shared_deletion_journal;
 b maintenance_private.household_stop_bindings;r maintenance_private.account_deletion_requests;
 app jsonb;required text[]:=array['prepare','handoff-family','verify-family-before','verify-sessions-before'];st text;
begin
 select * into c from maintenance_private.shared_native_stage_contexts
 where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 if not found or c.expires_at<=clock_timestamp() then return null;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=(c.scope->>'requestID')::uuid;
 select * into b from maintenance_private.household_stop_bindings where user_id=(c.scope->>'userID')::uuid;
 select * into r from maintenance_private.account_deletion_requests where id=c.native_request;
 if j.request_id is null or j.user_id::text is distinct from c.scope->>'userID'
 or j.scope is distinct from c.scope-'leaseToken' or j.status<>'processing'
 or j.lease_token::text is distinct from c.scope->>'leaseToken' or j.lease_until is null or j.lease_until<=clock_timestamp()
 or b.user_id is null or b.scope is distinct from c.scope or b.native_lease<>c.native_lease
 or b.state<>'processing' or b.lease_until<=clock_timestamp()
 or not exists(select 1 from maintenance_private.household_principal_fences where user_id=b.user_id and stopped)
 or r.id is null or r.user_id<>b.user_id or r.app_epoch_id<>c.native_epoch
 or r.state<>'running' or r.lease_token is distinct from c.native_lease or r.lease_until is null or r.lease_until<=clock_timestamp()
 or c.native_lease::text=c.scope->>'leaseToken' then return null;end if;
 for app in select value from jsonb_array_elements(c.scope->'apps') loop
  if app->>'app'='ouchi-maintenance' then
   if app->>'requestID' is distinct from c.native_request::text or app->>'scopeID' is distinct from c.native_epoch::text then return null;end if;
   exit;
  end if;
  required:=required||array['erase:'||(app->>'app'),'verify:'||(app->>'app')];
 end loop;
 if app->>'app' is distinct from 'ouchi-maintenance' then return null;end if;
 foreach st in array required loop
  if j.receipts->st->>'durable' is distinct from 'true' or j.receipts->st->>'stage' is distinct from st
   or ((j.receipts->st)-'durable'-'stage') is distinct from j.scope then return null;end if;
 end loop;
 return c;
end $$;
revoke all on function maintenance_private.current_shared_native_stage() from public,anon,authenticated,service_role;

-- The private trigger must read a capability unavailable to ordinary writers.
-- SECURITY DEFINER is only for that lookup; it grants no DML or public entry.
create function maintenance_private.shared_native_stage_write_matches(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare c maintenance_private.shared_native_stage_contexts:=maintenance_private.current_shared_native_stage();
 u uuid;h uuid;own uuid;
begin
 if c.backend_pid is null then return false;end if;
 u:=(c.scope->>'userID')::uuid;
 if sch='maintenance_private' and tbl='account_deletion_requests' and op='UPDATE' then
  if prior->>'id' is distinct from c.native_request::text or next_value->>'id' is distinct from prior->>'id'
   or prior->>'user_id' is distinct from u::text or prior->>'app_epoch_id' is distinct from c.native_epoch::text then return false;end if;
  if c.stage='eraseRecords' then
   return (prior-array['records_erased','updated_at'])=(next_value-array['records_erased','updated_at'])
    and next_value->>'records_erased'='true';
  elsif c.stage='captureReceiptSessions' then
   return (prior-'receipt_sessions_captured')=(next_value-'receipt_sessions_captured') and next_value->>'receipt_sessions_captured'='true';
  elsif c.stage='eraseIdentity' then
   return (prior-'identity_erased')=(next_value-'identity_erased') and next_value->>'identity_erased'='true';
  elsif c.stage='markComplete' then
   return (prior-array['state','completion_lease','lease_token','lease_until','updated_at','receipt_expires_at'])
    =(next_value-array['state','completion_lease','lease_token','lease_until','updated_at','receipt_expires_at'])
    and next_value->>'state'='complete' and next_value->>'completion_lease'=c.native_lease::text
    and next_value->'lease_token'='null'::jsonb and next_value->'lease_until'='null'::jsonb
    and exists(select 1 from maintenance_private.deletion_retention_checks x where x.request_id=c.native_request
     and x.checked_at<=statement_timestamp() and x.confirmed_until>statement_timestamp()
     and (next_value->>'updated_at')::timestamptz=statement_timestamp()
     and (next_value->>'receipt_expires_at')::timestamptz=statement_timestamp()+make_interval(secs=>x.receipt_lifetime_seconds));
  end if;
 end if;
 if c.stage='captureReceiptSessions' and sch='maintenance_private' and tbl='deletion_receipt_sessions' and op='INSERT' then
  return next_value->>'request_id'=c.native_request::text;
 end if;
 if c.stage='eraseDeviceRegistrations' and op='DELETE' then
  if sch='public' and tbl in('maintenance_push_subscriptions','maintenance_push_test_limits') then
   return prior->>'user_id'=u::text;
  elsif sch='maintenance_private' and tbl in('native_notification_devices','native_delivery_identities') then
   return prior->>'user_id'=u::text;
  elsif sch='maintenance_private' and tbl='native_notification_jobs' then
   -- The immutable route survives deletion of the cascading device parent.
   return exists(select 1 from maintenance_private.private_writer_routes x
    where x.kind='device' and x.object_id=(prior->>'device_id')::uuid and x.principal=u);
  end if;
  return false;
 end if;
 if c.stage='eraseIdentity' and sch='maintenance_private' and op='DELETE' then
  -- Canonical finalization also removes Ouchi-only settings/proofs across this
  -- actor's retained epochs. No insert/update or unrelated-user exception.
  if tbl in('reconciliation_jobs','reminder_schedules','notification_channels','enrollment_consents',
   'attest_registration_challenges','restore_attested_keys','restore_challenges','restore_cancelled_requests') then
   return prior->>'user_id'=u::text;
  elsif tbl='restore_transfer_jobs' then
   return prior->>'user_id'=u::text and prior->>'phase' in('authorized','completed');
  elsif tbl='account_deletion_objects' then
   return prior->>'request_id'=c.native_request::text and prior->>'absence_confirmed'='true';
  elsif tbl in('verified_transactions','verified_renewals','verified_notifications') then
   return prior->>'user_id'=u::text and (
    (tbl='verified_notifications' and prior->>'original_transaction_id' is null)
    or exists(select 1 from maintenance_private.transaction_ownership o
     where o.environment=prior->>'environment' and o.original_transaction_id=prior->>'original_transaction_id'
     and o.user_id=u and o.app_epoch_id::text=prior->>'app_epoch_id'));
  elsif tbl='transaction_ownership' then return prior->>'user_id'=u::text;
  end if;
  if tbl='app_session_epochs' then return prior->>'user_id'=u::text;
  elsif tbl='app_epochs' then return prior->>'user_id'=u::text and prior->>'epoch_id'=c.native_epoch::text and prior->>'enabled'='false';
  elsif tbl='account_access' then return prior->>'user_id'=u::text and prior->>'enabled'='false';end if;
 end if;
 if c.stage<>'eraseRecords' or op<>'DELETE' then return false;end if;
 if sch='maintenance_private' and tbl='product_attachments' then
  return exists(select 1 from maintenance_private.account_deletion_objects o where o.request_id=c.native_request
   and o.attachment_id=(prior->>'id')::uuid and o.absence_confirmed)
   and maintenance_private.attachment_write_is_quiet((prior->>'id')::uuid);
 end if;
 if sch<>'public' then return false;end if;
 if tbl='maintenance_push_subscriptions' then return prior->>'user_id'=u::text;end if;
 if tbl='maintenance_backup_restores' then return prior->>'owner_id'=u::text;end if;
 if tbl='home_members' then
  -- The canonical RPC may delete this actor's memberships; it must not delete
  -- another family's membership via a broad stopped-owner exemption.
  return prior->>'user_id'=u::text;
 end if;
 if tbl='homes' then h:=(prior->>'id')::uuid;own:=(prior->>'owner_id')::uuid;
 elsif tbl in('products','maintenance_tasks') then
  select home_id,owner_id into h,own from maintenance_private.household_write_routes where kind=tbl and object_id=(prior->>'id')::uuid;
 elsif tbl='maintenance_history' then
  select home_id,owner_id into h,own from maintenance_private.household_write_routes where kind='products' and object_id=(prior->>'productId')::uuid;
 elsif tbl in('home_invites','maintenance_imports') then
  select home_id,owner_id into h,own from maintenance_private.household_write_routes where kind='homes' and object_id=(prior->>'homeId')::uuid;
 else return false;end if;
 return own=u and h is not null
  and not exists(select 1 from public.home_members where "homeId"=h and user_id<>u)
  and not exists(select 1 from maintenance_private.household_family_holds where home_id=h and principal<>u);
end $$;
revoke all on function maintenance_private.shared_native_stage_write_matches(text,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function maintenance_private.allowed_shared_native_stage_write(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from maintenance_private.shared_native_stage_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current()) then return false;end if;
 -- An active but mismatched/expired capability cannot fall back to ordinary
 -- writer privileges, including for an unrelated principal that is still open.
 if maintenance_private.shared_native_stage_write_matches(sch,tbl,op,prior,next_value) is distinct from true then raise exception 'Native stage write refused';end if;
 return true;
end $$;
revoke all on function maintenance_private.allowed_shared_native_stage_write(text,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;

create function maintenance_private.run_shared_native_stage(s jsonb,n uuid,phase text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare app jsonb;r maintenance_private.account_deletion_requests;ok boolean;
begin
 if not maintenance_private.valid_household_scope(s) or phase not in('eraseRecords','eraseDeviceRegistrations','captureReceiptSessions','eraseIdentity','markComplete') then raise exception 'Native stage scope required';end if;
 select value into app from jsonb_array_elements(s->'apps') where value->>'app'='ouchi-maintenance';
 if app is null then raise exception 'Native app mapping required';end if;
 -- Match the outer shared-journal lock order before pinning the native row.
 perform 1 from private.kb_shared_deletion_journal where request_id=(s->>'requestID')::uuid for update;
 perform pg_advisory_xact_lock(hashtext(s->>'userID'));
 perform 1 from maintenance_private.household_stop_bindings where user_id=(s->>'userID')::uuid for update;
 select * into r from maintenance_private.account_deletion_requests where id=(app->>'requestID')::uuid for update;
 insert into maintenance_private.shared_native_stage_contexts values(pg_backend_pid(),txid_current(),s,r.id,(app->>'scopeID')::uuid,n,phase,clock_timestamp()+interval '15 seconds');
 if (maintenance_private.current_shared_native_stage()).backend_pid is null then raise exception 'Current shared/native stage authority required';end if;
 if phase in('eraseRecords','eraseDeviceRegistrations') then
  -- A lease timeout is not evidence that an external send did not happen.
  -- This SQL portion does not replace the worker's external device/outbox ack.
  if exists(select 1 from public.maintenance_push_subscriptions p where p.user_id=r.user_id
   and (p.claim_token is not null or p.claimed_until is not null))
   or exists(select 1 from maintenance_private.native_notification_jobs j
    join maintenance_private.native_notification_devices d on d.id=j.device_id
    where d.user_id=r.user_id and (j.state='unknown' or (j.state='claimed' and j.send_started_at is not null))) then
   raise exception 'Notification delivery outcome unconfirmed';
  end if;
 end if;
 if phase='eraseRecords' then ok:=public.erase_maintenance_deletion_records(r.id,r.user_id,r.app_epoch_id,n);
 elsif phase='eraseDeviceRegistrations' then
  ok:=public.erase_maintenance_deletion_web_push(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native device registration stage unconfirmed';end if;
  ok:=public.erase_maintenance_deletion_native_push(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native device registration stage unconfirmed';end if;
  ok:=public.erase_maintenance_deletion_native_delivery_identities(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native device registration stage unconfirmed';end if;
 elsif phase='captureReceiptSessions' then ok:=public.capture_maintenance_deletion_receipt_sessions(r.id,r.user_id,r.app_epoch_id,n);
 elsif phase='eraseIdentity' then
  -- Keep the established canonical erasure sequence on this SAME connection.
  -- An unknown restore job, corrupt ledger or missing absence proof aborts the
  -- entire statement; earlier preference erasures cannot commit on false.
  ok:=public.erase_maintenance_deletion_reconciliation(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native account metadata stage unconfirmed';end if;
  ok:=public.erase_maintenance_deletion_reminder_schedule(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native account metadata stage unconfirmed';end if;
  ok:=public.erase_maintenance_deletion_notifications(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native account metadata stage unconfirmed';end if;
  ok:=public.erase_maintenance_deletion_enrollment_consents(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native account metadata stage unconfirmed';end if;
  ok:=public.erase_maintenance_deletion_prior_preferences(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native account metadata stage unconfirmed';end if;
  ok:=public.erase_maintenance_deletion_restore_jobs(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native account metadata stage unconfirmed';end if;
  ok:=public.erase_maintenance_deletion_restore_proofs(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native account metadata stage unconfirmed';end if;
  ok:=public.minimize_maintenance_deletion_object_inventory(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native account metadata stage unconfirmed';end if;
  ok:=public.erase_maintenance_deletion_purchase_ledger(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native account metadata stage unconfirmed';end if;
  ok:=public.erase_maintenance_deletion_identity(r.id,r.user_id,r.app_epoch_id,n);
  if ok is distinct from true then raise exception 'Native account metadata stage unconfirmed';end if;
 else ok:=public.complete_maintenance_account_deletion(r.id,r.user_id,r.app_epoch_id,n);end if;
 delete from maintenance_private.shared_native_stage_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 return ok;
end $$;
-- A separately reviewed dedicated backend LOGIN is still required. No grant
-- is issued here, and SQL pins alone do not replace current family/session/
-- writer coverage or the outer runWithTransactionCommitChecks owning COMMIT.
revoke all on function maintenance_private.run_shared_native_stage(jsonb,uuid,text) from public,anon,authenticated,service_role;
