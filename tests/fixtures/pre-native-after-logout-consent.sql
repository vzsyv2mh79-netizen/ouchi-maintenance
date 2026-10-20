-- Exact ordered early prerequisites. This is receipt grammar only; the reader
-- below separately pins immutable checkpoint, live leases and actual absence.
create function maintenance_private.pre_native_logout_prerequisites(s jsonb,receipts jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare required text[]:=array['prepare','handoff-family','verify-family-before','verify-sessions-before'];app jsonb;st text;proof jsonb;found_own boolean:=false;
begin
 if jsonb_typeof(s->'apps') is distinct from 'array' or jsonb_typeof(receipts) is distinct from 'object' then return false;end if;
 for app in select value from jsonb_array_elements(s->'apps') loop
  if app->>'app'='ouchi-maintenance' then found_own:=true;exit;end if;
  required:=required||array['erase:'||(app->>'app'),'verify:'||(app->>'app')];
 end loop;
 if not found_own or receipts ? 'erase:ouchi-maintenance' or receipts ? 'erase-auth' or receipts ? 'complete' then return false;end if;
 foreach st in array required loop
  proof:=receipts->st;
  if jsonb_typeof(proof) is distinct from 'object' or proof->'durable' is distinct from 'true'::jsonb or proof->>'stage' is distinct from st then return false;end if;
  if st='handoff-family' then
   if coalesce(proof->>'familyCoverageDigest','')!~'^[a-f0-9]{64}$' or proof-'durable'-'stage'-'familyCoverageDigest' is distinct from s then return false;end if;
  elsif proof-'durable'-'stage' is distinct from s then return false;end if;
 end loop;return true;
end$$;
revoke all on function maintenance_private.pre_native_logout_prerequisites(jsonb,jsonb) from public,anon,authenticated,service_role;

create function maintenance_private.pre_native_consent_body(token text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare body text;
begin
 if token is null or length(token)>8192 or token!~'^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then return null;end if;
 body:=split_part(token,'.',1);
 return convert_from(decode(translate(body,'-_','+/')||repeat('=',(4-length(body)%4)%4),'base64'),'UTF8')::jsonb;
exception when invalid_text_representation or invalid_parameter_value or character_not_in_repertoire then return null;
end$$;
revoke all on function maintenance_private.pre_native_consent_body(text) from public,anon,authenticated,service_role;

-- Every family's ORIGINAL Auth/epoch provenance and BOTH immutable activation
-- snapshots must correspond. This never reauthenticates a person after logout.
-- HMAC original authenticity is checked again by the app with its private key;
-- these private immutable rows were produced by the original checked issuers.
create function maintenance_private.pre_native_initial_origins_match(rid uuid,hid uuid,owner_epoch uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare hp maintenance_private.household_handoff_plans;j maintenance_private.family_attachment_journals;
 ac maintenance_private.family_attachment_activation_contexts;ar maintenance_private.family_attachment_activation_receipts;
 v maintenance_private.scoped_consent_bindings;o maintenance_private.initial_household_consent_origins;
 actor uuid;hh jsonb;inv jsonb;hc jsonb;ic jsonb;at_ms bigint;epoch uuid;
begin
 select * into hp from maintenance_private.household_handoff_plans where home_id=hid;
 select * into j from maintenance_private.family_attachment_journals where request_id=rid and home_id=hid;
 select * into ar from maintenance_private.family_attachment_activation_receipts where request_id=rid and home_id=hid;
 select * into ac from maintenance_private.family_attachment_activation_contexts where token=ar.activation_token;
 if hp.home_id is null or j.home_id is null or ac.token is null
 or ac.request_id is distinct from rid or ac.home_id is distinct from hid
 or ac.plan_digest is distinct from j.plan_digest or ac.inventory_digest is distinct from j.inventory_digest
 or ac.scope-'nativeLease' is distinct from j.scope-'nativeLease'
 or ar.expected_inventory_digest is distinct from ac.expected_inventory_digest
 or ac.inventory_approval->>'request_id' is distinct from rid::text or ac.inventory_approval->>'home_id' is distinct from hid::text
 or ac.inventory_approval->>'plan_digest' is distinct from j.plan_digest or ac.inventory_approval->>'inventory_digest' is distinct from j.inventory_digest
 or ac.inventory_approval->'scope' is distinct from ac.scope
 or jsonb_typeof(ac.consents) is distinct from 'array' or jsonb_array_length(ac.consents)<>2
 or jsonb_typeof(ac.inventory_approval->'consents') is distinct from 'array' or jsonb_array_length(ac.inventory_approval->'consents')<>2
 or(select count(*) from maintenance_private.scoped_consent_bindings where request_id=rid and home_id=hid)<>2
 or(select count(*) from maintenance_private.initial_household_consent_origins where request_id=rid and home_id=hid)<>2 then return false;end if;
 at_ms:=floor(extract(epoch from ar.activated_at)*1000)::bigint;
 foreach actor in array array[hp.owner_id,hp.successor_id] loop
  select * into v from maintenance_private.scoped_consent_bindings where request_id=rid and home_id=hid and actor_id=actor;
  select * into o from maintenance_private.initial_household_consent_origins where request_id=rid and home_id=hid and actor_id=actor;
  epoch:=case when actor=hp.owner_id then owner_epoch else (j.plan->>'recipientEpoch')::uuid end;
  if v.actor_id is null or o.actor_id is null or o.original_signature is distinct from v.signature or o.epoch_id is distinct from epoch
  or v.original_scope is distinct from hp.scope or v.original_plan is distinct from hp.plan
  or v.proof_domain is distinct from 'OuchiMaintenance/scoped-shared-consent-auth/v1'
  or v.payload->>'requestID' is distinct from rid::text or v.payload->>'homeID' is distinct from hid::text
  or v.payload->>'aal' is distinct from 'aal2' or v.payload->>'proofDomain' is distinct from v.proof_domain
  or v.payload->>'userID' is distinct from actor::text or v.payload->>'sessionID' is distinct from v.session_id::text
  or v.payload->>'authStateDigest' is distinct from v.auth_state_digest or v.payload->>'authenticatedAt' is distinct from v.authenticated_at::text
  or v.payload->>'expiresAt' is distinct from v.expires_at::text or v.authenticated_at>at_ms or v.expires_at<=at_ms
  then return false;end if;
  if(select count(*) from jsonb_array_elements(ac.consents) x where x->>'actor_id'=actor::text)<>1
  or(select count(*) from jsonb_array_elements(ac.inventory_approval->'consents') x where x->>'actorID'=actor::text)<>1 then return false;end if;
  select x into hh from jsonb_array_elements(ac.consents) x where x->>'actor_id'=actor::text;
  select x into inv from jsonb_array_elements(ac.inventory_approval->'consents') x where x->>'actorID'=actor::text;
  hc:=maintenance_private.pre_native_consent_body(hh->>'token');ic:=maintenance_private.pre_native_consent_body(inv->>'token');
  if hh->'revoked_at' is distinct from 'null'::jsonb or inv->'revokedAt' is distinct from 'null'::jsonb
  or o.token_hash is distinct from encode(sha256(convert_to(hh->>'token','UTF8')),'hex')
  or not exists(select 1 from maintenance_private.household_handoff_consents c where c.home_id=hid and c.actor_id=actor and c.token=hh->>'token')
  or not exists(select 1 from maintenance_private.family_attachment_inventory_consents c where c.request_id=rid and c.home_id=hid and c.actor_id=actor and c.token=inv->>'token')
  or jsonb_typeof(hc) is distinct from 'object' or(select count(*) from jsonb_object_keys(hc))<>7 or hc-array['purpose','planDigest','actorID','role','acceptedAt','authVerifiedAt','expiresAt'] is distinct from '{}'::jsonb
  or hc->>'purpose' is distinct from 'OuchiMaintenance/shared-family-handoff/v1' or hc->>'planDigest' is distinct from hp.plan_digest
  or hc->>'actorID' is distinct from actor::text or hc->>'role' is distinct from(case when actor=hp.owner_id then 'owner' else 'successor' end)
  or hc->>'authVerifiedAt' is distinct from v.authenticated_at::text
  or (hc->>'acceptedAt')::bigint>at_ms or (hc->>'expiresAt')::bigint<=at_ms
  or jsonb_typeof(ic) is distinct from 'object' or(select count(*) from jsonb_object_keys(ic))<>12 or ic-array['purpose','bindingDigest','actorID','role','epochID','sessionID','aal','authStateDigest','authenticatedAt','checkedAt','acceptedAt','expiresAt'] is distinct from '{}'::jsonb
  or ic->>'purpose' is distinct from 'OuchiMaintenance/family-attachment-inventory/v2' or ic->>'actorID' is distinct from actor::text
  or ic->>'role' is distinct from(case when actor=hp.owner_id then 'owner' else 'recipient' end)
  or ic->>'epochID' is distinct from epoch::text or ic->>'sessionID' is distinct from v.session_id::text
  or ic->>'aal' is distinct from 'aal2' or ic->>'authStateDigest' is distinct from v.auth_state_digest or ic->>'authenticatedAt' is distinct from v.authenticated_at::text
  or (ic->>'acceptedAt')::bigint>at_ms or (ic->>'expiresAt')::bigint<=at_ms
  or ic->>'bindingDigest' is distinct from ac.inventory_approval->>'binding_digest'
  then return false;end if;
 end loop;return true;
end$$;
revoke all on function maintenance_private.pre_native_initial_origins_match(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Separate dormant historical-only phase. No mutation/role/grant/migration.
-- Never broadens current or post-native-seal readers. Independent complete
-- writer/namespace/retained-byte checks remain mandatory at the app port.
create function maintenance_private.read_pre_native_after_logout_consent(
 p_request uuid,p_home uuid,p_actor uuid,p_root_lease uuid,p_native_request uuid,p_epoch uuid,p_native_lease uuid
) returns table(payload jsonb,signature text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$
declare root private.kb_shared_deletion_journal;h maintenance_private.household_handoff_plans;
 v maintenance_private.scoped_consent_bindings;n maintenance_private.account_deletion_requests;
 checkpoint maintenance_private.shared_family_stage_contexts;
 journal maintenance_private.family_attachment_journals;r maintenance_private.family_attachment_completion_receipts;
 c maintenance_private.family_attachment_completion_contexts;a maintenance_private.family_attachment_activation_receipts;
 handoff maintenance_private.household_handoff_receipts;b maintenance_private.household_stop_bindings;
 t jsonb;child record;activation_row maintenance_private.family_attachment_activation_rows;actual jsonb;actor uuid;homes uuid[];expected_sources jsonb;expected_destinations jsonb;
begin
 if session_user::text<>'shared_retirement_backend'
 or coalesce(current_setting('role',true),'none') not in ('none',session_user::text)
 or not exists(select 1 from pg_catalog.pg_roles x where x.rolname=session_user and x.rolcanlogin
  and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication
  and (x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=x.oid or m.roleid=x.oid))
 or p_request is null or p_home is null or p_actor is null or p_root_lease is null
 or p_native_request is null or p_epoch is null or p_native_lease is null then return;end if;
 -- Root is always first. Read authority is live controller custody; an old
 -- completed global root or expired lease alone grants nothing.
 select * into root from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found or root.status<>'processing' or root.lease_token is distinct from p_root_lease or root.lease_until is null or root.lease_until<=clock_timestamp()
 or maintenance_private.pre_native_logout_prerequisites(root.scope,root.receipts) is distinct from true
 or root.scope->>'protocolVersion' is distinct from '2' or root.scope->>'kind' is distinct from 'shared-account'
 or root.scope->>'requestID' is distinct from p_request::text or root.scope->>'userID' is distinct from root.user_id::text
 then return;end if;
 -- Pin schema prerequisites while relying on FK parent locks for empty
 -- child ranges. Files additionally require the independent writer/namespace
 -- anchor at the app port; there is no invented product FK for attachments.
 lock table public.homes,public.home_members,public.products,public.maintenance_tasks,public.maintenance_history,maintenance_private.product_attachments,maintenance_private.attachment_write_attempts in row share mode;
 for child in select * from(values
  ('public.home_members',array['homeId'],'public.homes',array['id']),
  ('public.products',array['homeId'],'public.homes',array['id']),
  ('public.maintenance_tasks',array['productId'],'public.products',array['id']),
  ('public.maintenance_history',array['taskId','productId'],'public.maintenance_tasks',array['id','productId'])
 ) needed(child_table,child_columns,parent_table,parent_columns) loop
  if not exists(select 1 from pg_catalog.pg_constraint fk where fk.contype='f' and fk.convalidated and not fk.condeferrable
   and fk.conrelid=to_regclass(child.child_table) and fk.confrelid=to_regclass(child.parent_table)
   and array(select att.attname::text from unnest(fk.conkey) with ordinality k(num,ord) join pg_catalog.pg_attribute att on att.attrelid=fk.conrelid and att.attnum=k.num order by k.ord)=child.child_columns
   and array(select att.attname::text from unnest(fk.confkey) with ordinality k(num,ord) join pg_catalog.pg_attribute att on att.attrelid=fk.confrelid and att.attnum=k.num order by k.ord)=child.parent_columns) then return;end if;
 end loop;
 for child in select * from(values
  ('public.homes','household_write_fence','maintenance_private.guard_household_write()'),
  ('public.home_members','household_write_fence','maintenance_private.guard_household_write()'),
  ('public.products','household_write_fence','maintenance_private.guard_household_write()'),
  ('public.maintenance_tasks','household_write_fence','maintenance_private.guard_household_write()'),
  ('public.maintenance_history','household_write_fence','maintenance_private.guard_household_write()'),
  ('maintenance_private.product_attachments','private_account_write_fence','maintenance_private.guard_private_account_write()'),
  ('maintenance_private.attachment_write_attempts','private_account_write_fence','maintenance_private.guard_private_account_write()')
 ) needed(relation_name,trigger_name,guard_function) loop
  if not exists(select 1 from pg_catalog.pg_trigger tr where tr.tgrelid=to_regclass(child.relation_name) and tr.tgname=child.trigger_name and tr.tgenabled='O' and not tr.tgisinternal and tr.tgfoid=to_regprocedure(child.guard_function)) then return;end if;
 end loop;
 for actor in select distinct id from(
  select root.user_id id union select p.successor_id from maintenance_private.household_handoff_plans p where p.owner_id=root.user_id and p.scope-'leaseToken'=root.scope
  union select (m#>>'{}')::uuid from maintenance_private.household_handoff_plans p cross join lateral jsonb_array_elements(p.plan->'memberIDs') m where p.owner_id=root.user_id and p.scope-'leaseToken'=root.scope
  union select (file->'source'->>'userID')::uuid from maintenance_private.family_attachment_journals j cross join lateral jsonb_array_elements(j.plan->'files') file where j.request_id=p_request
 ) actors where id is not null order by id loop perform pg_advisory_xact_lock(hashtext(actor::text));end loop;
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
 or b.native_lease is distinct from p_native_lease or b.state<>'processing'
 or b.lease_until is null or b.lease_until<=clock_timestamp()
 or not exists(select 1 from maintenance_private.household_principal_fences f where f.user_id=root.user_id and f.stopped) then return;end if;
 select * into n from maintenance_private.account_deletion_requests where id=p_native_request for update;
 if not found or n.user_id is distinct from root.user_id or n.app_epoch_id is distinct from p_epoch
 or n.state<>'running' or n.lease_token is distinct from p_native_lease or n.lease_until is null or n.lease_until<=clock_timestamp()
 or n.completion_lease is not null or not n.inventory_captured or n.records_erased or n.identity_erased
 or public.maintenance_deletion_lease_is_current(p_native_request,root.user_id,p_epoch,p_native_lease) is not true then return;end if;
 -- This boundary is before Auth-user erasure. The live parent plus immediate
 -- FK stops session insertions after the all-session absence scan.
 if not exists(select 1 from pg_catalog.pg_constraint fk
  join pg_catalog.pg_attribute col on col.attrelid=fk.conrelid and col.attnum=fk.conkey[1]
  join pg_catalog.pg_attribute target on target.attrelid=fk.confrelid and target.attnum=fk.confkey[1]
  where fk.contype='f' and fk.convalidated and not fk.condeferrable and cardinality(fk.conkey)=1 and cardinality(fk.confkey)=1
  and fk.conrelid='auth.sessions'::regclass and fk.confrelid='auth.users'::regclass and col.attname='user_id' and target.attname='id') then return;end if;
 perform id from auth.users where id=root.user_id and deleted_at is null for update;if not found then return;end if;
 if exists(select 1 from auth.sessions where user_id=root.user_id) then return;end if;
 perform 1 from maintenance_private.app_epochs e join maintenance_private.account_access ac using(user_id)
 where e.user_id=root.user_id and e.epoch_id=p_epoch and not e.enabled and not ac.enabled for update of e,ac;
 if not found then return;end if;
 select * into checkpoint from maintenance_private.shared_family_stage_contexts where request_id=p_request;
 if not found or checkpoint.scope-'leaseToken' is distinct from root.scope
 or root.receipts->'handoff-family' is distinct from checkpoint.receipt
 or checkpoint.receipt is distinct from root.scope||jsonb_build_object('durable',true,'stage','handoff-family','familyCoverageDigest',checkpoint.coverage_digest)
 or jsonb_typeof(checkpoint.targets) is distinct from 'array' then return;end if;
 select coalesce(array_agg(p.home_id order by p.home_id),'{}'::uuid[]) into homes
 from maintenance_private.household_handoff_plans p where p.owner_id=root.user_id and p.scope-'leaseToken'=root.scope;
 if exists(select 1 from public.homes owned where owned.owner_id=root.user_id and exists(select 1 from public.home_members m where m."homeId"=owned.id and m.user_id<>root.user_id))
 or cardinality(homes)=0 or cardinality(homes)>100 or not p_home=any(homes)
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
  perform id from public.homes where id=journal.home_id for update;
  perform user_id from public.home_members where "homeId"=journal.home_id order by user_id for update;
  perform id from public.products where "homeId"=journal.home_id order by id for update;
  perform task.id from public.maintenance_tasks task join public.products product on product.id=task."productId" where product."homeId"=journal.home_id order by task.id for update of task;
  perform hist.id from public.maintenance_history hist join public.products product on product.id=hist."productId" where product."homeId"=journal.home_id order by hist.id for update of hist;
  perform f.id from maintenance_private.product_attachments f join public.products prod on prod.id=f.product_id where prod."homeId"=journal.home_id order by f.id for update of f;
  perform w.attachment_id from maintenance_private.attachment_write_attempts w join maintenance_private.product_attachments f on f.id=w.attachment_id join public.products prod on prod.id=f.product_id where prod."homeId"=journal.home_id order by w.attachment_id for update of w;
  if not exists(select 1 from public.homes where id=journal.home_id and owner_id=handoff.successor_id)
  or maintenance_private.household_family_snapshot(journal.home_id) is distinct from (select p.snapshot from maintenance_private.household_handoff_plans p where p.home_id=journal.home_id)
  or maintenance_private.pre_native_initial_origins_match(p_request,journal.home_id,p_epoch) is distinct from true
  or(select count(*) from maintenance_private.family_attachment_activation_rows where token=a.activation_token)<>jsonb_array_length(journal.plan->'files')*2
  or(select count(*) from maintenance_private.product_attachments f join public.products prod on prod.id=f.product_id where prod."homeId"=journal.home_id and f.state<>'removed')<>jsonb_array_length(journal.plan->'files')
  then return;end if;
  for activation_row in select * from maintenance_private.family_attachment_activation_rows where token=a.activation_token order by table_name,attachment_id loop
   if activation_row.table_name='product_attachments' then select to_jsonb(x) into actual from maintenance_private.product_attachments x where id=activation_row.attachment_id;
   else select to_jsonb(x) into actual from maintenance_private.attachment_write_attempts x where attachment_id=activation_row.attachment_id;end if;
   if actual is distinct from activation_row.after_row then return;end if;
  end loop;
  if exists(select 1 from maintenance_private.family_attachment_quota q where q.request_id=p_request and q.home_id=journal.home_id and q.state<>'consumed')
  or(select count(*) from maintenance_private.family_attachment_quota q where q.request_id=p_request and q.home_id=journal.home_id)<>(select count(*) from jsonb_array_elements(journal.plan->'files') file where file->'source'->>'path'<>file->'destination'->>'path')
  then return;end if;
  if exists(select 1 from jsonb_array_elements(journal.plan->'files') file where file->'source'->>'path'<>file->'destination'->>'path'
   and not exists(select 1 from maintenance_private.family_attachment_quota q where q.request_id=p_request and q.home_id=journal.home_id
    and q.attachment_id=(file->>'id')::uuid and q.state='consumed' and q.recipient_id::text=journal.plan->>'recipientID'
    and q.recipient_epoch::text=journal.plan->>'recipientEpoch' and q.size_bytes=(file->>'size')::bigint)) then return;end if;
  if exists(with wanted as(
   select 'homes'::text kind,journal.home_id id union all select 'products',prod.id from public.products prod where prod."homeId"=journal.home_id
   union all select 'maintenance_tasks',task.id from public.maintenance_tasks task join public.products prod on prod.id=task."productId" where prod."homeId"=journal.home_id
  ) select 1 from wanted w left join maintenance_private.household_write_routes route on route.kind=w.kind and route.object_id=w.id
    where route.home_id is distinct from journal.home_id or route.owner_id is distinct from handoff.successor_id)
  or(select count(*) from maintenance_private.household_write_routes where home_id=journal.home_id)<>1+(select count(*) from public.products where "homeId"=journal.home_id)+(select count(*) from public.maintenance_tasks task join public.products prod on prod.id=task."productId" where prod."homeId"=journal.home_id)
  then return;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','path',x->'source'->>'path') order by x->>'id'),'[]') into expected_sources
   from jsonb_array_elements(journal.plan->'files') x where x->'source'->>'path'<>x->'destination'->>'path';
  select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','path',x->'destination'->>'path','size',x->'size','mime',x->>'mime','sha256',x->>'sha256') order by x->>'id'),'[]') into expected_destinations
   from jsonb_array_elements(journal.plan->'files') x;
  if r.proof is distinct from jsonb_build_object('sources',expected_sources,'destinations',expected_destinations) then return;end if;
 end loop;
 perform 1 from maintenance_private.household_family_holds f where f.principal=root.user_id or f.home_id=any(homes) order by f.home_id for update;
 if(select count(*) from maintenance_private.household_family_holds f where f.principal=root.user_id or f.home_id=any(homes))<>cardinality(homes)
 or(select count(*) from maintenance_private.household_family_holds f where f.principal=root.user_id and f.home_id=any(homes) and f.scope=v.original_scope)<>cardinality(homes)
 or exists(select 1 from auth.sessions where user_id=root.user_id)
 or root.lease_until is null or root.lease_until<=clock_timestamp() or b.lease_until<=clock_timestamp() or n.lease_until<=clock_timestamp() then return;end if;
 return query select v.payload,v.signature,pg_backend_pid(),txid_current()::text;
end$$;
revoke all on function maintenance_private.read_pre_native_after_logout_consent(uuid,uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

