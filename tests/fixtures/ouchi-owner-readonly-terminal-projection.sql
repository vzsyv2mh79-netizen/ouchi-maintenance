-- Undeployed, SELECT-only projection. No roles/grants/migration or mutation.
-- Requires an already READ ONLY transaction. STABLE uses the caller statement
-- snapshot. No row/advisory lock, transaction ID allocation, original renewal,
-- token issuance, execution lease, current write exclusion, delivery or SLA proof.
create function maintenance_private.read_ouchi_owner_terminal_projection(
 p_request uuid,p_root_lease uuid,p_scope jsonb,p_completion uuid
) returns table(payload jsonb,signature text,backend_pid integer,snapshot_id text,read_only boolean)
language plpgsql stable security definer set search_path='' as $$
declare j private.kb_shared_deletion_journal;n maintenance_private.account_deletion_requests;
 b maintenance_private.household_stop_bindings;o maintenance_private.ouchi_owner_originals;
 c maintenance_private.shared_prelogout_receipt_custody;f maintenance_private.shared_family_stage_contexts;
 z maintenance_private.ouchi_owner_terminal_closures;
 app jsonb;guard record;stage text;proof jsonb;
 required text[]:=array['prepare','handoff-family','verify-family-before','verify-sessions-before'];
 allowed text[];missing boolean:=false;present_count int:=0;
begin
 if current_setting('transaction_read_only')<>'on' or session_user::text<>'shared_retirement_backend'
 or coalesce(current_setting('role',true),'none') not in('none',session_user::text)
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and r.rolcanlogin
  and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication
  and(r.rolvaliduntil is null or r.rolvaliduntil>statement_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid))
 or p_request is null or p_root_lease is null or p_completion is null or p_completion=p_root_lease
 or maintenance_private.valid_household_scope(p_scope) is distinct from true
 or p_scope->>'requestID' is distinct from p_request::text or p_scope->>'leaseToken' is distinct from p_root_lease::text then return;end if;
 -- One STABLE call observes one statement snapshot; no explicit locks.
 -- Historical projection is never an execution or current-exclusion proof.
 select * into j from private.kb_shared_deletion_journal where request_id=p_request;
 if not found or j.status<>'complete' or j.scope is distinct from p_scope-'leaseToken'
 or j.user_id::text is distinct from p_scope->>'userID'
 or j.lease_token is not null or j.lease_until is not null then return;end if;
 select * into z from maintenance_private.ouchi_owner_terminal_closures where request_id=p_request;
 if z.request_id is null then return;end if;
 if(select count(*) from jsonb_array_elements(j.scope->'apps') a where a->>'app'='ouchi-maintenance')<>1 then return;end if;
 select * into f from maintenance_private.shared_family_stage_contexts where request_id=p_request;
 if not found or f.scope is distinct from p_scope or f.targets is distinct from '[]'::jsonb
 or f.coverage_digest is distinct from encode(sha256(convert_to('[]','UTF8')),'hex')
 or f.receipt is distinct from j.scope||jsonb_build_object('durable',true,'stage','handoff-family','familyCoverageDigest',f.coverage_digest)
 or j.receipts->'handoff-family' is distinct from f.receipt then return;end if;
 for app in select value from jsonb_array_elements(j.scope->'apps') loop
  required:=required||array['erase:'||(app->>'app'),'verify:'||(app->>'app')];
 end loop;
 required:=required||array['verify-family','verify-sessions','erase-auth','verify-auth','verify-family-after-auth','verify-sessions-after-auth'];
 -- Exact terminal fifteen-stage grammar for a two-app frozen scope.
 required:=required||array['complete'];allowed:=required;
 foreach stage in array allowed loop
  proof:=j.receipts->stage;
  if proof is null then missing:=true;continue;end if;
  if missing or jsonb_typeof(proof) is distinct from 'object' then return;end if;
  if stage='handoff-family' then
   if proof is distinct from f.receipt then return;end if;
  elsif proof is distinct from j.scope||jsonb_build_object('durable',true,'stage',stage) then return;end if;
  present_count:=present_count+1;
 end loop;
 if present_count<cardinality(required) or (select count(*) from jsonb_object_keys(j.receipts))<>present_count then return;end if;
 -- Snapshot absence is only a projection condition, never an insertion
 -- barrier. No execution lease or authorizing capability is returned.
 if exists(select 1 from auth.users where id=j.user_id)
 or exists(select 1 from auth.sessions where user_id=j.user_id)
 or exists(select 1 from public.homes where owner_id=j.user_id)
 or exists(select 1 from public.home_members where user_id=j.user_id)
 or exists(select 1 from maintenance_private.household_handoff_plans where owner_id=j.user_id or root_request_id=p_request)
 or exists(select 1 from maintenance_private.household_family_holds where principal=j.user_id or root_request_id=p_request) then return;end if;
 perform user_id from maintenance_private.household_principal_fences where user_id=j.user_id and stopped;if not found then return;end if;
 select * into b from maintenance_private.household_stop_bindings where user_id=j.user_id;
 if not found or b.scope is distinct from p_scope or b.native_lease is distinct from p_completion
 or b.state<>'closed' then return;end if;
 select value into app from jsonb_array_elements(j.scope->'apps') where value->>'app'='ouchi-maintenance';
 if not exists(select 1 from pg_catalog.pg_proc p where p.oid='public.maintenance_deletion_completion_is_confirmed(uuid,uuid,uuid,uuid)'::regprocedure and p.provolatile='s' and not p.prosecdef) then return;end if;
 select * into n from maintenance_private.account_deletion_requests where id=(app->>'requestID')::uuid;
 if not found or n.user_id<>j.user_id or n.app_epoch_id::text is distinct from app->>'scopeID'
 or n.state<>'complete' or n.completion_lease is distinct from p_completion
 or n.lease_token is not null or n.lease_until is not null
 or public.maintenance_deletion_completion_is_confirmed(n.id,j.user_id,n.app_epoch_id,p_completion) is distinct from true then return;end if;
 -- Native enrollment/session mappings were actually erased. Bind the original
 -- epoch/session to canonical completion and immutable custody, never infer or
 -- re-create a current app registration from missing rows.
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
 select * into o from maintenance_private.ouchi_owner_originals where request_id=p_request;
 select * into c from maintenance_private.shared_prelogout_receipt_custody where request_id=n.id;
 if o.request_id is null or c.request_id is null or o.payload->>'domain' is distinct from 'OuchiMaintenance/owner-only-original/v1'
 or o.payload->'scope' is distinct from p_scope or o.payload->>'nativeLease' is distinct from p_completion::text
 or o.payload->>'userID' is distinct from j.user_id::text or o.payload->>'epochID' is distinct from n.app_epoch_id::text
 or o.payload->>'aal' is distinct from 'aal2' or o.payload->>'sessionID' is null
 or c.scope is distinct from p_scope or c.native_epoch<>n.app_epoch_id or c.native_lease is distinct from p_completion
 or not((o.payload->>'sessionID')::uuid=any(c.session_ids))
 or c.session_ids is distinct from (select array_agg(s.session_id order by s.session_id) from maintenance_private.deletion_receipt_sessions s where s.request_id=n.id)
 or cardinality(c.session_ids)<>(select count(distinct value) from unnest(c.session_ids) value)
 or exists(select 1 from auth.users where id=j.user_id) or exists(select 1 from auth.sessions where user_id=j.user_id)

 or public.maintenance_deletion_completion_is_confirmed(n.id,j.user_id,n.app_epoch_id,p_completion) is distinct from true then return;end if;
 if z.request_id is not null and (z.scope is distinct from p_scope or z.root_lease is distinct from p_root_lease
 or z.native_request_id<>n.id or z.native_epoch<>n.app_epoch_id or z.completion_lease is distinct from p_completion
 or z.original_record is distinct from to_jsonb(o) or z.session_custody is distinct from to_jsonb(c)
 or z.native_seal is distinct from to_jsonb(n) or z.family_checkpoint is distinct from to_jsonb(f)
 or z.closed_user<>j.user_id or z.home_ids is distinct from '{}'::uuid[])
 then return;end if;
 if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='maintenance_private.ouchi_owner_terminal_closures'::regclass
  and t.tgname='immutable_owner_terminal_closure' and t.tgenabled='A'
  and t.tgfoid='maintenance_private.refuse_owner_terminal_closure_change()'::regprocedure)
 or not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='maintenance_private.ouchi_owner_terminal_closures'::regclass
  and t.tgname='owner_terminal_closure_commit' and t.tgenabled='A' and t.tgdeferrable and t.tginitdeferred
  and t.tgfoid='maintenance_private.check_owner_terminal_closure_commit()'::regprocedure) then return;end if;
 return query select o.payload,o.signature,pg_backend_pid(),pg_current_snapshot()::text,true;
end$$;
revoke all on function maintenance_private.read_ouchi_owner_terminal_projection(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;

