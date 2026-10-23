-- Undeployed app-owned non-deleting prelogout boundary. No role, grant or
-- migration. Depends on the separately reviewed dedicated capture stage.
-- The canonical public producer and existing erasure boundaries stay unchanged.
-- Requires the peer-owned exact immutable manifest overlay; this boundary
-- does not duplicate its storage, replay or deferred set-integrity ownership.
create function maintenance_private.ouchi_prelogout_frame(p_scope jsonb,p_native uuid,p_required boolean)
returns table(backend_pid integer,transaction_id text,session_digest text,captured boolean)
language plpgsql volatile security definer set search_path='' as $$
declare j private.kb_shared_deletion_journal;b maintenance_private.household_stop_bindings;
 n maintenance_private.account_deletion_requests;app jsonb;st text;proof jsonb;expected jsonb;stored jsonb;
 original maintenance_private.shared_prelogout_receipt_custody;has_original boolean;dependency record;
begin
 if session_user::text not in('ouchi_prelogout_custody_backend','shared_retirement_backend')
 or coalesce(current_setting('role',true),'none') not in('none',session_user::text)
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and r.rolcanlogin
  and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication
  and(r.rolvaliduntil is null or r.rolvaliduntil>clock_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid))
 or p_native is null or p_required is null or maintenance_private.valid_household_scope(p_scope) is distinct from true
 or p_scope->>'leaseToken'=p_native::text then return;end if;
 -- FIRST row lock. Current gates and the dedicated stage use this same tx.
 select * into j from private.kb_shared_deletion_journal where request_id=(p_scope->>'requestID')::uuid for update;
 if not found or j.scope is distinct from p_scope-'leaseToken' or j.user_id::text is distinct from p_scope->>'userID'
 or j.status<>'processing' or j.lease_token::text is distinct from p_scope->>'leaseToken' or j.lease_until<=clock_timestamp() then return;end if;
 if(select count(*) from jsonb_array_elements(p_scope->'apps') a where a->>'app'='ouchi-maintenance')<>1 then return;end if;
 select a into app from jsonb_array_elements(p_scope->'apps') a where a->>'app'='ouchi-maintenance';
 -- Earlier app erasure and verify-sessions-before are deliberately NOT early
 -- prerequisites. Actual current family/session/writer readbacks remain mandatory.
 foreach st in array array['prepare','handoff-family','verify-family-before'] loop
  proof:=j.receipts->st;
  if jsonb_typeof(proof) is distinct from 'object' or proof->'durable' is distinct from 'true'::jsonb or proof->>'stage' is distinct from st then return;end if;
  if st='handoff-family' then
   if coalesce(proof->>'familyCoverageDigest','')!~'^[a-f0-9]{64}$' or proof-'durable'-'stage'-'familyCoverageDigest' is distinct from j.scope
   or not exists(select 1 from maintenance_private.shared_family_stage_contexts f where f.request_id=j.request_id and f.scope-'leaseToken'=j.scope and f.receipt=proof and f.coverage_digest=proof->>'familyCoverageDigest') then return;end if;
  elsif proof-'durable'-'stage' is distinct from j.scope then return;end if;
 end loop;
 perform pg_advisory_xact_lock(hashtext(j.user_id::text));
 select * into b from maintenance_private.household_stop_bindings where user_id=j.user_id for update;
 if not found or b.scope is distinct from p_scope or b.native_lease is distinct from p_native or b.state<>'processing' or b.lease_until<=clock_timestamp()
 or not exists(select 1 from maintenance_private.household_principal_fences where user_id=j.user_id and stopped) then return;end if;
 select * into n from maintenance_private.account_deletion_requests where id=(app->>'requestID')::uuid for update;
 if not found or n.user_id<>j.user_id or n.app_epoch_id::text is distinct from app->>'scopeID' or n.lease_token is distinct from p_native
 or n.state<>'running' or n.lease_until<=clock_timestamp() or not n.inventory_captured or n.records_erased or n.identity_erased
 or public.maintenance_deletion_lease_is_current(n.id,n.user_id,n.app_epoch_id,p_native) is distinct from true then return;end if;
 for dependency in select * from(values('auth.sessions','user_id','auth.users','id'),('maintenance_private.app_session_epochs','user_id','maintenance_private.app_epochs','user_id')) required(child,column_name,parent,parent_column) loop
  if not exists(select 1 from pg_catalog.pg_constraint c
   join pg_catalog.pg_attribute col on col.attrelid=c.conrelid and col.attnum=c.conkey[1]
   join pg_catalog.pg_attribute target on target.attrelid=c.confrelid and target.attnum=c.confkey[1]
   where c.contype='f' and c.convalidated and not c.condeferrable and cardinality(c.conkey)=1 and cardinality(c.confkey)=1
   and c.conrelid=to_regclass(dependency.child) and c.confrelid=to_regclass(dependency.parent) and col.attname=dependency.column_name and target.attname=dependency.parent_column) then return;end if;
 end loop;
 perform id from auth.users where id=j.user_id for update;if not found then return;end if;
 perform 1 from maintenance_private.app_epochs where user_id=j.user_id and epoch_id=n.app_epoch_id and not enabled for update;if not found then return;end if;
 perform 1 from maintenance_private.account_access where user_id=j.user_id and not enabled for update;if not found then return;end if;
 perform id from auth.sessions where user_id=j.user_id order by id for update;
 perform session_id from maintenance_private.app_session_epochs where user_id=j.user_id order by session_id for update;
 select coalesce(jsonb_agg(a.session_id::text order by a.session_id),'[]') into expected
 from maintenance_private.app_session_epochs a join auth.sessions s on s.id=a.session_id and s.user_id=a.user_id where a.user_id=j.user_id and a.epoch_id=n.app_epoch_id;
 if jsonb_array_length(expected)=0 then return;end if;
 select * into original from maintenance_private.shared_prelogout_receipt_custody where request_id=n.id for update;has_original:=found;
 select coalesce(jsonb_agg(s.session_id::text order by s.session_id),'[]') into stored from maintenance_private.deletion_receipt_sessions s where s.request_id=n.id;
 if n.receipt_sessions_captured then
  if not has_original or original.scope is distinct from p_scope or original.native_epoch<>n.app_epoch_id or original.native_lease is distinct from p_native or to_jsonb(original.session_ids) is distinct from expected or stored is distinct from to_jsonb(original.session_ids) or maintenance_private.prelogout_custody_is_exact(n.id) is distinct from true then return;end if;
 elsif has_original or jsonb_array_length(stored)<>0 or p_required then return;end if;
 if j.lease_until<=clock_timestamp() or b.lease_until<=clock_timestamp() or n.lease_until<=clock_timestamp() then return;end if;
 return query select pg_backend_pid(),txid_current()::text,encode(sha256(convert_to(expected::text,'UTF8')),'hex'),n.receipt_sessions_captured;
end$$;
revoke all on function maintenance_private.ouchi_prelogout_frame(jsonb,uuid,boolean) from public,anon,authenticated,service_role;

create function maintenance_private.ouchi_capture_prelogout_custody(p_scope jsonb,p_native uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare pin record;
begin
 select * into pin from maintenance_private.ouchi_prelogout_frame(p_scope,p_native,false);if not found then return false;end if;
 if pin.captured then return true;end if;
 -- Closed constant phase; never expose a caller work callback or stage selector.
 if maintenance_private.run_shared_native_stage(p_scope,p_native,'captureReceiptSessions') is distinct from true then raise exception 'Dedicated prelogout capture refused';end if;
 perform 1 from maintenance_private.ouchi_prelogout_frame(p_scope,p_native,true);if not found then raise exception 'Exact prelogout snapshot unconfirmed';end if;
 return true;
end$$;
revoke all on function maintenance_private.ouchi_capture_prelogout_custody(jsonb,uuid) from public,anon,authenticated,service_role;
