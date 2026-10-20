-- Local review candidate only. No roles/grants/migration or production route.
-- Requires the existing independent owner issuer, zero-roster FK prerequisites,
-- immutable shared checkpoint and guarded prelogout custody. Not Auth-after-
-- deletion or COMPLETE authority, and never a native deletion capability.
create function maintenance_private.read_ouchi_owner_after_logout_original(
 p_request uuid,p_root_lease uuid,p_scope jsonb,p_native uuid
) returns table(payload jsonb,signature text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$
declare j private.kb_shared_deletion_journal;n maintenance_private.account_deletion_requests;
 b maintenance_private.household_stop_bindings;o maintenance_private.ouchi_owner_originals;
 c maintenance_private.shared_prelogout_receipt_custody;f maintenance_private.shared_family_stage_contexts;
 app jsonb;dependency record;required text[]:=array['prepare','handoff-family','verify-family-before'];
 stage text;proof jsonb;missing boolean:=false;present_count int:=0;frame record;guard record;
begin
 if session_user::text<>'shared_retirement_backend'
 or coalesce(current_setting('role',true),'none') not in('none',session_user::text)
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and r.rolcanlogin
  and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication
  and(r.rolvaliduntil is null or r.rolvaliduntil>clock_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid))
 or p_request is null or p_root_lease is null or p_native is null or p_native=p_root_lease
 or maintenance_private.valid_household_scope(p_scope) is distinct from true
 or p_scope->>'requestID' is distinct from p_request::text or p_scope->>'leaseToken' is distinct from p_root_lease::text then return;end if;
 -- FIRST row lock, followed by the existing independently checked zero-family
 -- frame. That unchanged frame requires Auth parent/home/root immediate FKs.
 select * into j from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found or j.status<>'processing' or j.scope is distinct from p_scope-'leaseToken'
 or j.user_id::text is distinct from p_scope->>'userID' or j.lease_token is distinct from p_root_lease
 or j.lease_until is null or j.lease_until<=clock_timestamp() then return;end if;
 select * into frame from maintenance_private.ouchi_owner_only_frame(p_request,p_root_lease,p_scope,p_native);
 if not found or frame.status<>'processing' or frame.backend_pid<>pg_backend_pid() or frame.transaction_id<>txid_current()::text then return;end if;
 -- The empty checkpoint is an exact immutable receipt from the independently
 -- gated producer, not consent inferred from an empty scan or client array.
 select * into f from maintenance_private.shared_family_stage_contexts where request_id=p_request for share;
 if not found or f.scope is distinct from p_scope or f.targets is distinct from '[]'::jsonb
 or f.coverage_digest is distinct from encode(sha256(convert_to('[]','UTF8')),'hex')
 or f.receipt is distinct from j.scope||jsonb_build_object('durable',true,'stage','handoff-family','familyCoverageDigest',f.coverage_digest)
 or j.receipts->'handoff-family' is distinct from f.receipt then return;end if;
 -- A prefix may stop immediately after verify-family-before. Actual global
 -- session absence is checked below. This historical read can subsequently
 -- verify later earlier-app receipts, but never Ouchi erasure/Auth/COMPLETE.
 required:=required||array['verify-sessions-before'];
 for app in select value from jsonb_array_elements(j.scope->'apps') loop
  exit when app->>'app'='ouchi-maintenance';
  required:=required||array['erase:'||(app->>'app'),'verify:'||(app->>'app')];
 end loop;
 foreach stage in array required loop
  proof:=j.receipts->stage;
  if proof is null then missing:=true;continue;end if;
  if missing or jsonb_typeof(proof) is distinct from 'object' then return;end if;
  if stage='handoff-family' then
   if proof is distinct from f.receipt then return;end if;
  elsif proof is distinct from j.scope||jsonb_build_object('durable',true,'stage',stage) then return;end if;
  present_count:=present_count+1;
 end loop;
 if present_count<3 or (select count(*) from jsonb_object_keys(j.receipts))<>present_count then return;end if;
 -- Require the real immediate Auth FK before relying on a parent FOR UPDATE
 -- to fence phantom sessions. A missing parent is explicitly NOT authority.
 for dependency in select * from(values
  ('auth.sessions','user_id','auth.users','id'),
  ('maintenance_private.app_session_epochs','user_id','maintenance_private.app_epochs','user_id')
 ) required(child,column_name,parent,parent_column) loop
  if not exists(select 1 from pg_catalog.pg_constraint con
   join pg_catalog.pg_attribute col on col.attrelid=con.conrelid and col.attnum=con.conkey[1]
   join pg_catalog.pg_attribute target on target.attrelid=con.confrelid and target.attnum=con.confkey[1]
   where con.contype='f' and con.convalidated and not con.condeferrable and cardinality(con.conkey)=1 and cardinality(con.confkey)=1
   and con.conrelid=to_regclass(dependency.child) and con.confrelid=to_regclass(dependency.parent)
   and col.attname=dependency.column_name and target.attname=dependency.parent_column) then return;end if;
 end loop;
 perform id from auth.users where id=j.user_id and deleted_at is null for update;if not found then return;end if;
 if exists(select 1 from auth.sessions where user_id=j.user_id) then return;end if;
 -- Disabled, actual epoch and enrollment fence, never actor->epoch guessing.
 select * into b from maintenance_private.household_stop_bindings where user_id=j.user_id for update;
 select value into app from jsonb_array_elements(j.scope->'apps') where value->>'app'='ouchi-maintenance';
 select * into n from maintenance_private.account_deletion_requests where id=(app->>'requestID')::uuid for update;
 if n.id is null or n.user_id<>j.user_id or n.app_epoch_id::text is distinct from app->>'scopeID'
 or n.state<>'running' or n.lease_token is distinct from p_native or n.completion_lease is not null
 or n.lease_until is null or n.lease_until<=clock_timestamp() or not n.inventory_captured
 or not n.receipt_sessions_captured or n.records_erased or n.identity_erased
 or public.maintenance_deletion_lease_is_current(n.id,n.user_id,n.app_epoch_id,p_native) is distinct from true
 then return;end if;
 perform user_id from maintenance_private.account_access where user_id=j.user_id and not enabled for update;if not found then return;end if;
 perform user_id from maintenance_private.app_epochs where user_id=j.user_id and epoch_id=n.app_epoch_id and not enabled for update;if not found then return;end if;
 -- Without these immutable/integrity guards an arbitrary stored DTO is not
 -- original custody. Do not silently accept disabled or replica-only guards.
 for guard in select * from(values
  ('maintenance_private.ouchi_owner_originals','immutable_owner_original','maintenance_private.refuse_owner_original_change()'),
  ('maintenance_private.shared_family_stage_contexts','immutable_shared_family_stage_context','maintenance_private.refuse_family_attachment_journal_change()'),
  ('maintenance_private.shared_prelogout_receipt_custody','authorized_prelogout_snapshot','maintenance_private.guard_prelogout_custody_insert()'),
  ('maintenance_private.shared_prelogout_receipt_custody','immutable_prelogout_custody','maintenance_private.refuse_prelogout_custody_change()'),
  ('maintenance_private.shared_prelogout_receipt_custody','exact_prelogout_snapshot','maintenance_private.verify_prelogout_custody_at_commit()'),
  ('maintenance_private.deletion_receipt_sessions','exact_prelogout_sessions','maintenance_private.verify_prelogout_custody_at_commit()')
 ) expected(relation_name,trigger_name,function_name) loop
  if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=to_regclass(guard.relation_name)
   and t.tgname=guard.trigger_name and t.tgenabled in('O','A') and t.tgfoid=to_regprocedure(guard.function_name)) then return;end if;
 end loop;
 select * into o from maintenance_private.ouchi_owner_originals where request_id=p_request for share;
 select * into c from maintenance_private.shared_prelogout_receipt_custody where request_id=n.id for share;
 if o.request_id is null or c.request_id is null or o.payload->>'domain' is distinct from 'OuchiMaintenance/owner-only-original/v1'
 or o.payload->'scope' is distinct from p_scope or o.payload->>'nativeLease' is distinct from p_native::text
 or o.payload->>'userID' is distinct from j.user_id::text or o.payload->>'epochID' is distinct from n.app_epoch_id::text
 or o.payload->>'aal' is distinct from 'aal2' or o.payload->>'sessionID' is null
 or c.scope is distinct from p_scope or c.native_epoch<>n.app_epoch_id or c.native_lease is distinct from p_native
 or not((o.payload->>'sessionID')::uuid=any(c.session_ids))
 or maintenance_private.prelogout_custody_is_exact(n.id) is distinct from true then return;end if;
 perform session_id from maintenance_private.app_session_epochs where user_id=j.user_id and session_id=any(c.session_ids) order by session_id for update;
 if (select count(*) from maintenance_private.app_session_epochs where user_id=j.user_id and epoch_id=n.app_epoch_id and session_id=any(c.session_ids))<>cardinality(c.session_ids)
 or j.lease_until<=clock_timestamp() or b.lease_until<=clock_timestamp() or n.lease_until<=clock_timestamp()
 or exists(select 1 from auth.sessions where user_id=j.user_id) then return;end if;
 return query select o.payload,o.signature,pg_backend_pid(),txid_current()::text;
end$$;
revoke all on function maintenance_private.read_ouchi_owner_after_logout_original(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
