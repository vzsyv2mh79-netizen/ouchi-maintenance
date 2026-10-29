-- Local read-only guard, NOT a migration or automatic unfreeze. It proves only
-- requested-root cancellation BEFORE any Ouchi native request/preparation.
-- Native pending/running/captured or immutable preparation -> false. Missing
-- known schema -> false; no prefix exclusions or invented restoration flags.
create function maintenance_private.ouchi_requested_cancellation_state(p_request uuid,p_scope jsonb)
returns table(ok boolean,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$
declare j private.kb_shared_deletion_journal;app jsonb;needed text;
begin
 if session_user::text<>'shared_retirement_backend'
 or coalesce(current_setting('role',true),'none') not in('none',session_user::text)
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and r.rolcanlogin
  and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication
  and (r.rolvaliduntil is null or r.rolvaliduntil>clock_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid))
 or p_request is null or maintenance_private.valid_household_scope(p_scope) is distinct from true
 or p_scope->>'requestID' is distinct from p_request::text then return;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found or j.scope is distinct from p_scope-'leaseToken' or j.user_id::text is distinct from p_scope->>'userID'
 or j.status<>'cancelled' or j.lease_token is not null or j.lease_until is not null or j.receipts<>'{}'::jsonb
 or (select count(*) from jsonb_array_elements(j.scope->'apps') a where a->>'app'='ouchi-maintenance')<>1 then return;end if;
 select value into app from jsonb_array_elements(j.scope->'apps') where value->>'app'='ouchi-maintenance';
 -- Exact known storage is required. Newly introduced/privileged/dispatch paths
 -- still require the independent outer verifyCoverage provider; absence here
 -- never authorizes releasing an unknown fence or recreating app enrollment.
 foreach needed in array array[
 'maintenance_private.account_deletion_requests','maintenance_private.household_stop_bindings',
 'maintenance_private.household_principal_fences','maintenance_private.household_handoff_plans',
 'maintenance_private.household_family_holds','maintenance_private.household_worker_capabilities',
 'maintenance_private.shared_family_stage_contexts','maintenance_private.shared_prelogout_receipt_custody',
 'maintenance_private.shared_native_stage_contexts','maintenance_private.shared_native_cleanup_scopes',
 'maintenance_private.post_native_family_releases','maintenance_private.ouchi_owner_terminal_closures',
 'maintenance_private.ouchi_owner_originals','maintenance_private.scoped_consent_bindings',
 'maintenance_private.account_deletion_objects','maintenance_private.deletion_receipt_sessions',
 'maintenance_private.deletion_retention_checks','maintenance_private.reviewed_retirements',
 'maintenance_private.reviewed_retirement_files','maintenance_private.closure_read_windows',
 'maintenance_private.closure_submission_jobs'
 ] loop if to_regclass(needed) is null then return;end if;end loop;
 perform pg_advisory_xact_lock(hashtext(j.user_id::text));
 perform id from auth.users where id=j.user_id and deleted_at is null for key share;if not found then return;end if;
 -- Do not infer a safe pending job from a missing unrelated request ID. Any
 -- actual request for this epoch (or processing request for the actor) refuses.
 if exists(select 1 from maintenance_private.account_deletion_requests n where n.id=(app->>'requestID')::uuid
  or(n.user_id=j.user_id and(n.app_epoch_id::text=app->>'scopeID' or n.state in('pending','running'))))
 or exists(select 1 from maintenance_private.household_stop_bindings where user_id=j.user_id)
 or exists(select 1 from maintenance_private.household_principal_fences where user_id=j.user_id and stopped)
 or exists(select 1 from maintenance_private.household_handoff_plans where owner_id=j.user_id or root_request_id=p_request)
 or exists(select 1 from maintenance_private.household_family_holds where principal=j.user_id or root_request_id=p_request)
 or exists(select 1 from maintenance_private.household_worker_capabilities where user_id=j.user_id or scope->>'requestID'=p_request::text)
 or exists(select 1 from maintenance_private.shared_family_stage_contexts where request_id=p_request)
 or exists(select 1 from maintenance_private.shared_prelogout_receipt_custody where scope->>'requestID'=p_request::text)
 or exists(select 1 from maintenance_private.shared_native_stage_contexts where scope->>'requestID'=p_request::text or native_request=(app->>'requestID')::uuid)
 or exists(select 1 from maintenance_private.shared_native_cleanup_scopes where root_request=p_request or scope->>'userID'=j.user_id::text)
 or exists(select 1 from maintenance_private.post_native_family_releases where request_id=p_request)
 or exists(select 1 from maintenance_private.ouchi_owner_terminal_closures where request_id=p_request)
 or exists(select 1 from maintenance_private.ouchi_owner_originals where request_id=p_request)
 or exists(select 1 from maintenance_private.scoped_consent_bindings where request_id=p_request)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=(app->>'requestID')::uuid)
 or exists(select 1 from maintenance_private.deletion_receipt_sessions where request_id=(app->>'requestID')::uuid)
 or exists(select 1 from maintenance_private.deletion_retention_checks where request_id=(app->>'requestID')::uuid)
 or exists(select 1 from maintenance_private.reviewed_retirements where deletion_request_id=(app->>'requestID')::uuid)
 or exists(select 1 from maintenance_private.reviewed_retirement_files where request_id=(app->>'requestID')::uuid)
 or exists(select 1 from maintenance_private.closure_read_windows where request_id=(app->>'requestID')::uuid)
 or exists(select 1 from maintenance_private.closure_submission_jobs where request_id=(app->>'requestID')::uuid) then return;end if;
 if not exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a on a.user_id=e.user_id
  where e.user_id=j.user_id and e.epoch_id::text=app->>'scopeID' and e.enabled and a.enabled)
 or not exists(select 1 from maintenance_private.app_session_epochs e join auth.sessions s on s.id=e.session_id and s.user_id=e.user_id
  where e.user_id=j.user_id and e.epoch_id::text=app->>'scopeID' and(s.not_after is null or s.not_after>clock_timestamp())) then return;end if;
 return query select true,pg_backend_pid(),txid_current()::text;
end$$;
revoke all on function maintenance_private.ouchi_requested_cancellation_state(uuid,jsonb) from public,anon,authenticated,service_role;
