-- Undeployed review fixture. No role, grant, public endpoint or migration.
-- This port never consults current Auth or reclassifies original consent as AAL2.
-- Holds may be absent ONLY with an independently committed release receipt.
-- The separate release producer below is metadata-only and has no EXECUTE
-- grant. Its release must commit with exact controller COMPLETE evidence.
-- No cleanup mutation is authorized by a historical read.
create table maintenance_private.post_native_family_releases(
 request_id uuid primary key,scope jsonb not null,home_ids uuid[] not null,
 native_request_id uuid not null,owner_epoch uuid not null,completion_lease uuid not null,
 family_checkpoint_token uuid not null,coverage_digest text not null,
 root_lease uuid not null,backend_pid int not null,transaction_id bigint not null,
 released_at timestamptz not null default clock_timestamp()
);
alter table maintenance_private.post_native_family_releases enable row level security;
revoke all on maintenance_private.post_native_family_releases from public,anon,authenticated,service_role;
create trigger immutable_post_native_family_release before update or delete
on maintenance_private.post_native_family_releases for each row
execute function maintenance_private.refuse_family_attachment_journal_change();

-- Exact protocol prerequisites; all app stages are derived from frozen scope.
create function maintenance_private.post_native_root_prerequisites(s jsonb,r jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare stage text;stages text[]:=array['prepare','handoff-family','verify-family-before','verify-sessions-before'];app jsonb;proof jsonb;
begin
 for app in select value from jsonb_array_elements(s->'apps') loop
  stages:=array_append(array_append(stages,'erase:'||(app->>'app')),'verify:'||(app->>'app'));
 end loop;
 stages:=stages||array['verify-family','verify-sessions','erase-auth','verify-auth','verify-family-after-auth','verify-sessions-after-auth'];
 foreach stage in array stages loop
  proof:=r->stage;
  if proof is null or proof->>'durable' is distinct from 'true' or proof->>'stage' is distinct from stage
  or proof-'durable'-'stage'-'familyCoverageDigest' is distinct from s then return false;end if;
 end loop;
 return true;
end$$;
revoke all on function maintenance_private.post_native_root_prerequisites(jsonb,jsonb) from public,anon,authenticated,service_role;

create function maintenance_private.read_post_native_seal_consent(
 p_request uuid,p_home uuid,p_actor uuid,p_root_lease uuid,p_native_request uuid,p_epoch uuid,p_completion_lease uuid
) returns table(payload jsonb,signature text)
language plpgsql volatile security definer set search_path='' as $$
declare root private.kb_shared_deletion_journal;h maintenance_private.household_handoff_plans;
 v maintenance_private.scoped_consent_bindings;n maintenance_private.account_deletion_requests;
 checkpoint maintenance_private.shared_family_stage_contexts;
 journal maintenance_private.family_attachment_journals;r maintenance_private.family_attachment_completion_receipts;
 c maintenance_private.family_attachment_completion_contexts;a maintenance_private.family_attachment_activation_receipts;
 handoff maintenance_private.household_handoff_receipts;b maintenance_private.household_stop_bindings;
 released maintenance_private.post_native_family_releases;t jsonb;homes uuid[];expected_sources jsonb;expected_destinations jsonb;
begin
 if session_user::text<>'shared_retirement_backend'
 or coalesce(current_setting('role',true),'none') not in ('none',session_user::text)
 or not exists(select 1 from pg_catalog.pg_roles x where x.rolname=session_user and x.rolcanlogin
  and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication
  and (x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=x.oid or m.roleid=x.oid))
 or p_request is null or p_home is null or p_actor is null or p_root_lease is null
 or p_native_request is null or p_epoch is null or p_completion_lease is null then return;end if;
 -- Root is always first. Read authority is live controller custody; an old
 -- completed global root or expired lease alone grants nothing.
 select * into root from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found or not(
  (root.status='processing' and root.lease_token=p_root_lease and root.lease_until>clock_timestamp())
  or(root.status='complete' and root.lease_token is null and root.lease_until is null
   and exists(select 1 from maintenance_private.post_native_family_releases z where z.request_id=p_request and z.scope=root.scope and z.root_lease=p_root_lease)
   and root.receipts->'complete'=root.scope||jsonb_build_object('durable',true,'stage','complete')
   and maintenance_private.post_native_root_prerequisites(root.scope,root.receipts)))
 or root.scope->>'protocolVersion' is distinct from '2' or root.scope->>'kind' is distinct from 'shared-account'
 or root.scope->>'requestID' is distinct from p_request::text or root.scope->>'userID' is distinct from root.user_id::text
 then return;end if;
 perform pg_advisory_xact_lock(hashtext(root.user_id::text));
 perform 1 from maintenance_private.household_principal_fences f where f.user_id=root.user_id for update;
 select * into h from maintenance_private.household_handoff_plans where home_id=p_home for update;
 select * into v from maintenance_private.scoped_consent_bindings where request_id=p_request and home_id=p_home and actor_id=p_actor for update;
 if h.home_id is null or v.request_id is null or h.owner_id is distinct from root.user_id
 or h.owner_id=h.successor_id or p_actor not in(h.owner_id,h.successor_id)
 or h.scope is distinct from v.original_scope or h.plan is distinct from v.original_plan
 or v.original_scope-'leaseToken' is distinct from root.scope
 or v.original_plan->>'appRequestID' is distinct from p_native_request::text
 or v.original_plan->>'appScopeID' is distinct from p_epoch::text
 or v.original_plan->>'householdID' is distinct from p_home::text
 or v.original_plan->>'userID' is distinct from h.owner_id::text
 or v.original_plan->>'successorID' is distinct from h.successor_id::text
 or (select count(*) from jsonb_array_elements(root.scope->'apps') x
  where x->>'app'='ouchi-maintenance' and x->>'requestID'=p_native_request::text and x->>'scopeID'=p_epoch::text)<>1
 or v.payload->>'sessionID' is distinct from v.session_id::text
 or v.payload->>'authenticatedAt' is distinct from v.authenticated_at::text
 or v.payload->>'expiresAt' is distinct from v.expires_at::text
 or v.payload->>'authStateDigest' is distinct from v.auth_state_digest
 or v.payload->>'proofDomain' is distinct from v.proof_domain then return;end if;
 select * into b from maintenance_private.household_stop_bindings where user_id=root.user_id for update;
 if not found or b.scope-'leaseToken' is distinct from root.scope or b.scope->>'leaseToken' is distinct from p_root_lease::text
 or b.native_lease is distinct from p_completion_lease or b.state<>'processing'
 or (root.status='processing' and b.lease_until<=clock_timestamp())
 or not exists(select 1 from maintenance_private.household_principal_fences f where f.user_id=root.user_id and f.stopped) then return;end if;
 select * into n from maintenance_private.account_deletion_requests where id=p_native_request for update;
 if not found or n.user_id is distinct from root.user_id or n.app_epoch_id is distinct from p_epoch
 or n.state<>'complete' or n.completion_lease is distinct from p_completion_lease
 or n.lease_token is not null or n.lease_until is not null
 or public.maintenance_deletion_completion_is_confirmed(p_native_request,root.user_id,p_epoch,p_completion_lease) is not true then return;end if;
 select * into checkpoint from maintenance_private.shared_family_stage_contexts where request_id=p_request;
 if not found or checkpoint.scope-'leaseToken' is distinct from root.scope
 or root.receipts->'handoff-family' is distinct from checkpoint.receipt
 or checkpoint.receipt is distinct from root.scope||jsonb_build_object('durable',true,'stage','handoff-family','familyCoverageDigest',checkpoint.coverage_digest)
 or jsonb_typeof(checkpoint.targets) is distinct from 'array' then return;end if;
 select coalesce(array_agg(p.home_id order by p.home_id),'{}'::uuid[]) into homes
 from maintenance_private.household_handoff_plans p where p.owner_id=root.user_id and p.scope-'leaseToken'=root.scope;
 if cardinality(homes)=0 or not p_home=any(homes)
 or cardinality(homes)<>jsonb_array_length(checkpoint.targets)
 or (select coalesce(array_agg((x->'plan'->>'homeID')::uuid order by x->'plan'->>'homeID'),'{}'::uuid[]) from jsonb_array_elements(checkpoint.targets) x) is distinct from homes
 then return;end if;
 -- Read the real immutable completion/activation manifests, not DTO booleans.
 -- Do not re-run their write-time Auth/enrollment requirements after erasure.
 for t in select value from jsonb_array_elements(checkpoint.targets) loop
  select * into journal from maintenance_private.family_attachment_journals where request_id=p_request and home_id=(t->'plan'->>'homeID')::uuid;
  select * into r from maintenance_private.family_attachment_completion_receipts where request_id=p_request and home_id=journal.home_id;
  select * into c from maintenance_private.family_attachment_completion_contexts where token=r.completion_token;
  select * into a from maintenance_private.family_attachment_activation_receipts where request_id=p_request and home_id=journal.home_id;
  select * into handoff from maintenance_private.household_handoff_receipts where home_id=journal.home_id;
  if journal.request_id is null or r.request_id is null or c.token is null or a.request_id is null or handoff.home_id is null
  or journal.plan is distinct from t->'plan'
  or journal.scope-'nativeLease'-'controllerScope' is distinct from (t->'scope')-'nativeLease'-'controllerScope'
  or (journal.scope->'controllerScope')-'leaseToken' is distinct from root.scope
  or (t->'scope'->'controllerScope')-'leaseToken' is distinct from root.scope
  or journal.scope->>'nativeRequestID' is distinct from p_native_request::text or journal.scope->>'ownerEpoch' is distinct from p_epoch::text
  or r.scope-'nativeLease' is distinct from journal.scope-'nativeLease'
  or r.plan_digest is distinct from journal.plan_digest or r.inventory_digest is distinct from journal.inventory_digest
  or c.scope is distinct from r.scope or c.proof is distinct from r.proof or c.plan_digest is distinct from r.plan_digest
  or c.inventory_digest is distinct from r.inventory_digest or c.activation_token is distinct from r.activation_token
  or a.activation_token is distinct from r.activation_token or a.plan_digest is distinct from r.plan_digest or a.inventory_digest is distinct from r.inventory_digest
  or not exists(select 1 from maintenance_private.household_handoff_plans original where original.home_id=journal.home_id and original.owner_id=root.user_id
   and original.scope-'leaseToken'=root.scope and original.plan_digest=handoff.plan_digest and original.plan->>'familySnapshotDigest'=handoff.snapshot_digest)
  or handoff.scope-'leaseToken' is distinct from root.scope or handoff.successor_id::text is distinct from journal.plan->>'recipientID'
  or handoff.snapshot_digest is distinct from journal.plan->>'snapshotDigest'
  then return;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','path',x->'source'->>'path') order by x->>'id'),'[]') into expected_sources
   from jsonb_array_elements(journal.plan->'files') x where x->'source'->>'path'<>x->'destination'->>'path';
  select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','path',x->'destination'->>'path','size',x->'size','mime',x->>'mime','sha256',x->>'sha256') order by x->>'id'),'[]') into expected_destinations
   from jsonb_array_elements(journal.plan->'files') x;
  if r.proof is distinct from jsonb_build_object('sources',expected_sources,'destinations',expected_destinations) then return;end if;
 end loop;
 perform 1 from maintenance_private.household_family_holds f where f.principal=root.user_id or f.home_id=any(homes) order by f.home_id for update;
 if exists(select 1 from maintenance_private.household_family_holds f where f.home_id=p_home and f.principal=root.user_id and f.scope=v.original_scope) then
  -- A mixed partial release is never historical authority.
  if exists(select 1 from maintenance_private.post_native_family_releases x where x.request_id=p_request)
  or (select count(*) from maintenance_private.household_family_holds f where f.principal=root.user_id and f.home_id=any(homes) and f.scope=v.original_scope)<>cardinality(homes) then return;end if;
 else
  select * into released from maintenance_private.post_native_family_releases where request_id=p_request;
  if not found or released.root_lease is distinct from p_root_lease or released.scope is distinct from root.scope or released.home_ids is distinct from homes
  or released.native_request_id is distinct from p_native_request or released.owner_epoch is distinct from p_epoch
  or released.completion_lease is distinct from p_completion_lease or released.family_checkpoint_token is distinct from checkpoint.token
  or released.coverage_digest is distinct from checkpoint.coverage_digest
  or exists(select 1 from maintenance_private.household_family_holds f where f.principal=root.user_id or f.home_id=any(homes))
  or exists(select 1 from public.homes where owner_id=root.user_id)
  or exists(select 1 from public.home_members where user_id=root.user_id)
  then return;end if;
 end if;
 return query select v.payload,v.signature;
end$$;
revoke all on function maintenance_private.read_post_native_seal_consent(uuid,uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Separate dormant COMPLETE-stage metadata capability, never called by reads.
-- The controller must independently reverify all apps' retained family bytes,
-- sessions and Auth absence before recording the prior stage receipts.
create function maintenance_private.release_post_native_family_holds(
 p_request uuid,p_root_lease uuid,p_native_request uuid,p_epoch uuid,p_completion_lease uuid
) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare root private.kb_shared_deletion_journal;checkpoint maintenance_private.shared_family_stage_contexts;
 homes uuid[];h maintenance_private.household_handoff_plans;removed int;
begin
 if session_user::text<>'shared_retirement_backend' then return false;end if;
 select * into root from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found or root.status<>'processing' or root.lease_token is distinct from p_root_lease
 or root.lease_until<=clock_timestamp() or maintenance_private.post_native_root_prerequisites(root.scope,root.receipts) is not true
 or exists(select 1 from maintenance_private.post_native_family_releases where request_id=p_request)
 or exists(select 1 from auth.users where id=root.user_id) or exists(select 1 from auth.sessions where user_id=root.user_id)
 or exists(select 1 from public.homes where owner_id=root.user_id) or exists(select 1 from public.home_members where user_id=root.user_id)
 then return false;end if;
 select * into checkpoint from maintenance_private.shared_family_stage_contexts where request_id=p_request;
 select coalesce(array_agg(p.home_id order by p.home_id),'{}'::uuid[]) into homes
 from maintenance_private.household_handoff_plans p where p.owner_id=root.user_id and p.scope-'leaseToken'=root.scope;
 if cardinality(homes)=0 or checkpoint.token is null then return false;end if;
 for h in select * from maintenance_private.household_handoff_plans where home_id=any(homes) order by home_id loop
  perform 1 from maintenance_private.read_post_native_seal_consent(p_request,h.home_id,h.owner_id,p_root_lease,p_native_request,p_epoch,p_completion_lease);
  if not found then return false;end if;
  perform 1 from maintenance_private.read_post_native_seal_consent(p_request,h.home_id,h.successor_id,p_root_lease,p_native_request,p_epoch,p_completion_lease);
  if not found then return false;end if;
 end loop;
 delete from maintenance_private.household_family_holds f where f.home_id=any(homes) and f.principal=root.user_id and f.scope-'leaseToken'=root.scope;
 get diagnostics removed=row_count;
 if removed<>cardinality(homes) then raise exception 'Complete original family hold inventory required';end if;
 insert into maintenance_private.post_native_family_releases values(p_request,root.scope,homes,p_native_request,p_epoch,p_completion_lease,
  checkpoint.token,checkpoint.coverage_digest,p_root_lease,pg_backend_pid(),txid_current(),clock_timestamp());
 return true;
end$$;
revoke all on function maintenance_private.release_post_native_family_holds(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function maintenance_private.check_post_native_release_commit() returns trigger
language plpgsql security definer set search_path='' as $$
declare root private.kb_shared_deletion_journal;h maintenance_private.household_handoff_plans;
begin
 select * into root from private.kb_shared_deletion_journal where request_id=new.request_id for update;
 if new.backend_pid<>pg_backend_pid() or new.transaction_id<>txid_current()
 or root.status is distinct from 'complete' or root.lease_token is not null or root.lease_until is not null
 or root.scope is distinct from new.scope
 or root.receipts->'complete' is distinct from root.scope||jsonb_build_object('durable',true,'stage','complete')
 or maintenance_private.post_native_root_prerequisites(root.scope,root.receipts) is not true
 or exists(select 1 from auth.users where id=root.user_id) or exists(select 1 from auth.sessions where user_id=root.user_id)
 then raise exception 'Exact same-transaction global COMPLETE required for family release' using detail=format('pid:%s tx:%s status:%s scope:%s receipt:%s prerequisites:%s authAbsent:%s sessionsAbsent:%s',new.backend_pid=pg_backend_pid(),new.transaction_id=txid_current(),root.status='complete',root.scope=new.scope,(root.receipts->'complete')=(root.scope||jsonb_build_object('durable',true,'stage','complete')),maintenance_private.post_native_root_prerequisites(root.scope,root.receipts),not exists(select 1 from auth.users where id=root.user_id),not exists(select 1 from auth.sessions where user_id=root.user_id));end if;
 for h in select * from maintenance_private.household_handoff_plans where home_id=any(new.home_ids) order by home_id loop
  perform 1 from maintenance_private.read_post_native_seal_consent(new.request_id,h.home_id,h.owner_id,new.root_lease,new.native_request_id,new.owner_epoch,new.completion_lease);
  if not found then raise exception 'Retained original family release custody required at COMMIT';end if;
  perform 1 from maintenance_private.read_post_native_seal_consent(new.request_id,h.home_id,h.successor_id,new.root_lease,new.native_request_id,new.owner_epoch,new.completion_lease);
  if not found then raise exception 'Retained successor custody required at COMMIT';end if;
 end loop;
 return null;
end$$;
revoke all on function maintenance_private.check_post_native_release_commit() from public,anon,authenticated,service_role;
create constraint trigger post_native_family_release_commit after insert
on maintenance_private.post_native_family_releases deferrable initially deferred
for each row execute function maintenance_private.check_post_native_release_commit();
