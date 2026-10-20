-- Local review candidate, NOT approved for production. Explicit lists were
-- reviewed against the captured 25 routine bodies, not generated from regex.
-- Requires the existing canonical native stage, guards and RLS-enabled tables.
-- New owner cannot log in, inherit roles, create objects or bypass RLS.
create role ouchi_shared_native_owner nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant usage on schema public,private,maintenance_private,auth to ouchi_shared_native_owner;

create function maintenance_private.native_owner_context_active() returns boolean
language sql volatile security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.shared_native_stage_contexts
  where backend_pid=pg_backend_pid() and transaction_id=txid_current() and expires_at>clock_timestamp());
$$;
alter function maintenance_private.native_owner_context_active() owner to ouchi_shared_native_owner;
revoke all on function maintenance_private.native_owner_context_active() from public,anon,authenticated,service_role,shared_retirement_backend;
grant execute on function maintenance_private.native_owner_context_active() to ouchi_shared_native_owner;

-- Fixed invoker implementation stays unchanged. Only this wrapper gets the
-- unassumable owner's privileges; caller receives a boolean, not private rows.
create function maintenance_private.execute_shared_native_stage(s jsonb,n uuid,phase text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare ok boolean;
begin
 if current_user::text<>'ouchi_shared_native_owner' or session_user::text<>'shared_retirement_backend'
 or coalesce(current_setting('role',true),'none') not in('none',session_user::text)
 or phase is null or phase not in('eraseRecords','eraseDeviceRegistrations','captureReceiptSessions','eraseIdentity','markComplete')
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and r.rolcanlogin
  and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication
  and (r.rolvaliduntil is null or r.rolvaliduntil>clock_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid))
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=current_user and not r.rolcanlogin
  and not r.rolinherit and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid))
 then raise exception 'Dedicated native principal required';end if;
 ok:=maintenance_private.run_shared_native_stage(s,n,phase);
 if ok is distinct from true then raise exception 'Native stage unconfirmed';end if;
 return true;
end $$;
alter function maintenance_private.execute_shared_native_stage(jsonb,uuid,text) owner to ouchi_shared_native_owner;
revoke all on function maintenance_private.execute_shared_native_stage(jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.execute_shared_native_stage(jsonb,uuid,text) to shared_retirement_backend;
revoke all on function maintenance_private.run_shared_native_stage(jsonb,uuid,text) from shared_retirement_backend;

-- SELECT is internal to fixed owner code. It is not exposed to the LOGIN.
-- These policies do not enable/disable RLS or alter any other role's policy.
do $$declare sch text;tbl text;qualified text;begin
 foreach qualified in array array[
  'private.kb_shared_deletion_journal',
  'maintenance_private.account_access','maintenance_private.account_closure_reviews',
  'maintenance_private.account_deletion_objects','maintenance_private.account_deletion_requests',
  'maintenance_private.app_epochs','maintenance_private.app_session_epochs',
  'maintenance_private.attachment_capacity_claims','maintenance_private.attachment_write_attempts',
  'maintenance_private.attest_registration_challenges','maintenance_private.closure_coverage_plans',
  'maintenance_private.closure_file_decisions','maintenance_private.closure_file_inspections',
  'maintenance_private.closure_household_file_decisions','maintenance_private.closure_household_file_inspections',
  'maintenance_private.deletion_receipt_sessions','maintenance_private.deletion_retention_checks',
  'maintenance_private.enrollment_consents','maintenance_private.enrollment_policy',
  'maintenance_private.household_copy_intents','maintenance_private.household_stop_bindings',
  'maintenance_private.native_delivery_identities','maintenance_private.native_notification_devices',
  'maintenance_private.native_notification_jobs','maintenance_private.notification_channels',
  'maintenance_private.ownerless_home_claims','maintenance_private.product_attachments',
  'maintenance_private.reconciliation_jobs','maintenance_private.reminder_schedules',
  'maintenance_private.restore_attested_keys','maintenance_private.restore_challenges',
  'maintenance_private.restore_transfer_jobs','maintenance_private.reviewed_retirement_files',
  'maintenance_private.reviewed_retirements','maintenance_private.shared_native_stage_contexts',
  'maintenance_private.transaction_ownership','maintenance_private.verified_notifications',
  'maintenance_private.verified_renewals','maintenance_private.verified_transactions',
  'public.home_members','public.homes','public.maintenance_backup_restores',
  'public.maintenance_push_subscriptions','public.maintenance_push_test_limits'
 ] loop
  sch:=split_part(qualified,'.',1);tbl:=split_part(qualified,'.',2);
  if not exists(select 1 from pg_catalog.pg_class c
   where c.oid=qualified::regclass and c.relrowsecurity) then
   raise exception 'Existing application RLS required: %',qualified;
  end if;
  execute format('grant select on %I.%I to ouchi_shared_native_owner',sch,tbl);
  execute format('create policy native_owner_select on %I.%I for select to ouchi_shared_native_owner using(true)',sch,tbl);
 end loop;
end $$;

-- The two session identity columns are sufficient for the fixed custody JOIN.
-- Do not grant access to IP, user agent, factor or other Auth session columns.
grant select(id,user_id) on auth.sessions to ouchi_shared_native_owner;
create policy native_owner_select on auth.sessions for select to ouchi_shared_native_owner using(true);

grant update(records_erased,updated_at,receipt_sessions_captured,identity_erased,state,completion_lease,lease_token,lease_until,receipt_expires_at)
 on maintenance_private.account_deletion_requests to ouchi_shared_native_owner;
create policy native_owner_update on maintenance_private.account_deletion_requests for update to ouchi_shared_native_owner
 using(true) with check(maintenance_private.native_owner_context_active());

-- Row locks require UPDATE privilege. Application RLS blocks actual UPDATE.
-- Auth RLS is deliberately untouched: when disabled, UPDATE(id) is a real
-- privilege, constrained by the fixed code and unassumable NOLOGIN owner,
-- not by WITH CHECK(false). Production adoption must explicitly review it.
grant update(request_id) on private.kb_shared_deletion_journal to ouchi_shared_native_owner;
grant update(user_id) on maintenance_private.household_stop_bindings to ouchi_shared_native_owner;
grant update(id) on maintenance_private.enrollment_policy,auth.sessions,public.homes to ouchi_shared_native_owner;
grant update(request_id) on maintenance_private.deletion_retention_checks to ouchi_shared_native_owner;
grant update(session_id) on maintenance_private.app_session_epochs to ouchi_shared_native_owner;
grant update(user_id) on public.home_members to ouchi_shared_native_owner;
do $$declare qualified text;begin
 foreach qualified in array array['private.kb_shared_deletion_journal','maintenance_private.household_stop_bindings',
  'maintenance_private.enrollment_policy','auth.sessions','public.homes','maintenance_private.deletion_retention_checks',
  'maintenance_private.app_session_epochs','public.home_members'] loop
  execute format('create policy native_owner_lock on %s for update to ouchi_shared_native_owner using(true) with check(false)',qualified);
 end loop;
end $$;

grant insert,delete on maintenance_private.shared_native_stage_contexts to ouchi_shared_native_owner;
create policy native_owner_context_insert on maintenance_private.shared_native_stage_contexts for insert to ouchi_shared_native_owner
 with check(backend_pid=pg_backend_pid() and transaction_id=txid_current() and expires_at>clock_timestamp() and expires_at<=clock_timestamp()+interval '15 seconds');
create policy native_owner_context_delete on maintenance_private.shared_native_stage_contexts for delete to ouchi_shared_native_owner
 using(backend_pid=pg_backend_pid() and transaction_id=txid_current());
grant insert on maintenance_private.deletion_receipt_sessions to ouchi_shared_native_owner;
create policy native_owner_receipt_insert on maintenance_private.deletion_receipt_sessions for insert to ouchi_shared_native_owner
 with check(maintenance_private.native_owner_context_active());

-- Deletes stay behind the established exact OLD/NEW native write guards. The
-- owning LOGIN cannot insert a capability or invoke any canonical eraser.
do $$declare qualified text;begin
 foreach qualified in array array[
  'maintenance_private.account_access','maintenance_private.app_epochs','maintenance_private.app_session_epochs',
  'maintenance_private.native_delivery_identities','maintenance_private.native_notification_devices',
  'maintenance_private.enrollment_consents','maintenance_private.verified_notifications',
  'maintenance_private.verified_renewals','maintenance_private.verified_transactions','maintenance_private.transaction_ownership',
  'maintenance_private.reconciliation_jobs','maintenance_private.reminder_schedules','maintenance_private.notification_channels',
  'maintenance_private.restore_transfer_jobs','maintenance_private.attest_registration_challenges','maintenance_private.restore_attested_keys',
  'maintenance_private.product_attachments','public.maintenance_push_subscriptions','public.maintenance_push_test_limits',
  'public.home_members','public.maintenance_backup_restores','public.homes'
 ] loop
  execute format('grant delete on %s to ouchi_shared_native_owner',qualified);
  execute format('create policy native_owner_delete on %s for delete to ouchi_shared_native_owner using(maintenance_private.native_owner_context_active())',qualified);
 end loop;
end $$;

-- Exact reviewed signatures. No EXECUTE ON ALL FUNCTIONS, default grants, role
-- membership, service_role inheritance, public route or credentials supplied.
do $$declare signature text;begin
 foreach signature in array array[
 'maintenance_private.run_shared_native_stage(jsonb,uuid,text)',
 'maintenance_private.current_shared_native_stage()',
 'maintenance_private.valid_household_scope(jsonb)',
 'maintenance_private.owned_homes_have_no_other_members(uuid)',
 'maintenance_private.attachment_write_is_quiet(uuid)',
 'maintenance_private.capture_shared_prelogout_receipt_sessions(uuid,uuid,uuid,uuid)',
 'public.capture_maintenance_deletion_receipt_sessions(uuid,uuid,uuid,uuid)',
 'public.complete_maintenance_account_deletion(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_enrollment_consents(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_identity(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_native_delivery_identities(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_native_push(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_notifications(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_prior_preferences(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_purchase_ledger(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_reconciliation(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_records(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_reminder_schedule(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_restore_jobs(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_restore_proofs(uuid,uuid,uuid,uuid)',
 'public.erase_maintenance_deletion_web_push(uuid,uuid,uuid,uuid)',
 'public.maintenance_deletion_completion_is_confirmed(uuid,uuid,uuid,uuid)',
 'public.maintenance_deletion_identity_is_erased(uuid,uuid,uuid,uuid)',
 'public.maintenance_deletion_lease_is_current(uuid,uuid,uuid,uuid)',
 'public.minimize_maintenance_deletion_object_inventory(uuid,uuid,uuid,uuid)'
 ] loop execute format('grant execute on function %s to ouchi_shared_native_owner',signature);end loop;
end $$;
