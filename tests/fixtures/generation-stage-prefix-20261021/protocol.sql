-- Isolated stage-specific prefix/custody candidate. NO enabled erase path.
create table maintenance_private.generation_stage_checkpoints(
 generation_id uuid not null references maintenance_private.family_preparation_generations(generation_id),
 stage text not null check(stage in('prepare','handoff-family','verify-family-before')),
 proof jsonb not null,backend_pid integer not null,transaction_id bigint not null,
 primary key(generation_id,stage));
create table maintenance_private.generation_stage_custody(
 generation_id uuid primary key references maintenance_private.family_preparation_generations(generation_id),
 proof jsonb not null,backend_pid integer not null,transaction_id bigint not null);
do $$declare t text;begin foreach t in array array['generation_stage_checkpoints','generation_stage_custody'] loop
 execute format('alter table maintenance_private.%I enable row level security',t);
 execute format('revoke all on maintenance_private.%I from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend,ouchi_retention_checker_backend',t);
 execute format('create trigger immutable_generation_stage before update or delete on maintenance_private.%I for each row execute function maintenance_private.refuse_family_attachment_journal_change()',t);
 execute format('alter table maintenance_private.%I enable always trigger immutable_generation_stage',t);
end loop;end$$;
create function maintenance_private.generation_prepare_stage_evidence(gid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('domain','OuchiMaintenance/separate-family-preparation/v1','scope',g.scope,'generationID',gid,
 'nativePreparedOriginal',p.after_state,'targets',g.targets,'roster',g.roster,'preimage',g.preimage,
 'originals',maintenance_private.generation_original_set(gid),'retentionCertificate',c.payload,'retentionSignature',c.signature,'retentionAdmission',to_jsonb(a))
 from maintenance_private.family_preparation_generations g join maintenance_private.family_native_preparations p using(generation_id)
 join maintenance_private.generation_retention_certificates c using(generation_id) join maintenance_private.generation_retention_admissions a using(generation_id)
 where g.generation_id=gid and p.state='prepared';
$$;
create function maintenance_private.generation_stage_prefix_matches(gid uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;j private.kb_shared_deletion_journal;expected jsonb:='{}';k text;c maintenance_private.generation_stage_checkpoints;prep jsonb;begin
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request;
 if j.request_id is null or j.scope is distinct from g.scope-'leaseToken' then return false;end if;
 if j.receipts='{}' then return true;end if;
 prep:=maintenance_private.generation_prepare_stage_evidence(gid);if prep is null then return false;end if;
 foreach k in array array['prepare','handoff-family','verify-family-before'] loop
  select * into c from maintenance_private.generation_stage_checkpoints where generation_id=gid and stage=k;
  if c.generation_id is null or c.proof->'preparation' is distinct from prep then return false;end if;
  if k<>'prepare' and c.proof->'handoff' is distinct from(select to_jsonb(w) from maintenance_private.generation_family_handoffs w where generation_id=gid and state='captured') then return false;end if;
  if k='verify-family-before' and c.proof is distinct from(select proof from maintenance_private.generation_stage_custody where generation_id=gid) then return false;end if;
  expected:=expected||jsonb_build_object(k,(g.scope-'leaseToken')||jsonb_build_object('durable',true,'stage',k));
  if j.receipts=expected then return true;end if;
 end loop;return false;
end$$;
-- Replace only explicit empty-receipt predicates in three reviewed generation
-- frames. No old guard/plan/PK/canonical body is otherwise rewritten.
do $stage$declare oid_value oid:='maintenance_private.pre_handoff_generation_family_frame(uuid)'::regprocedure;definition text;begin
 if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid=oid_value)<>'ae7d90cb58aa7498a575ad588402462474c7fd1821c730f4764ec0a56d87ff41' then raise exception 'Exact stage dependency drift: pre_handoff_generation_family_frame';end if;
 select pg_get_functiondef(oid_value) into definition;definition:=replace(definition,'j.receipts<>''{}''','not maintenance_private.generation_stage_prefix_matches(gid)');execute definition;end$stage$;
do $stage$declare oid_value oid:='maintenance_private.generation_post_handoff_frame(uuid)'::regprocedure;definition text;begin
 if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid=oid_value)<>'bd794321268248acf989af36687424727847f01de142c86055f5549af5e83a31' then raise exception 'Exact stage dependency drift: generation_post_handoff_frame';end if;
 select pg_get_functiondef(oid_value) into definition;definition:=replace(definition,'j.receipts<>''{}''','not maintenance_private.generation_stage_prefix_matches(gid)');execute definition;end$stage$;
do $stage$declare oid_value oid:='maintenance_private.current_generation_handoff_context()'::regprocedure;definition text;begin
 if (select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid=oid_value)<>'247570cc7b1368042ff0e28db30da2e0698254271afcc0b5a2456e333444251e' then raise exception 'Exact stage dependency drift: current_generation_handoff_context';end if;
 select pg_get_functiondef(oid_value) into definition;definition:=replace(definition,'j.receipts=''{}''','maintenance_private.generation_stage_prefix_matches(g.generation_id)');execute definition;end$stage$;
create function maintenance_private.record_generation_stage_checkpoint(gid uuid,s jsonb,n uuid,targets jsonb,wanted text,coordinator_proof jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;j private.kb_shared_deletion_journal;proof_value jsonb;prior maintenance_private.generation_stage_checkpoints;required jsonb:='{}';k text;begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none' or wanted not in('prepare','handoff-family','verify-family-before') then return false;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets then return false;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request for update;
 if j.status is distinct from 'processing' or j.lease_token::text is distinct from s->>'leaseToken' or j.lease_until is null or j.lease_until<=clock_timestamp() or not maintenance_private.generation_stage_prefix_matches(gid)
 or jsonb_typeof(coordinator_proof) is distinct from 'object' or coordinator_proof->>'domain' is distinct from 'SharedAccount/coordinator-preparation/v1'
 then return false;end if;
 foreach k in array array['prepare','handoff-family','verify-family-before'] loop
  exit when k=wanted;required:=required||jsonb_build_object(k,(s-'leaseToken')||jsonb_build_object('durable',true,'stage',k));
 end loop;
 select * into prior from maintenance_private.generation_stage_checkpoints where generation_id=gid and stage=wanted;
 if prior.generation_id is not null then return prior.proof->'coordinator'=coordinator_proof and j.receipts=required||jsonb_build_object(wanted,(s-'leaseToken')||jsonb_build_object('durable',true,'stage',wanted));end if;
 if j.receipts is distinct from required then return false;end if;
 perform 1 from maintenance_private.verify_generation_retention_admission(gid,s,n,targets) where ok;if not found then return false;end if;
 perform 1 from maintenance_private.generation_family_claim_frame(gid) where status='processing';if not found then return false;end if;
 if wanted='prepare' then
  if exists(select 1 from maintenance_private.generation_family_handoffs where generation_id=gid) or not exists(select 1 from maintenance_private.account_deletion_requests where id=g.native_request and not inventory_captured)
  or not exists(select 1 from maintenance_private.pre_handoff_generation_family_frame(gid)) then return false;end if;
 else
  perform 1 from maintenance_private.generation_post_handoff_frame(gid);if not found then return false;end if;
 end if;
 proof_value:=jsonb_build_object('preparation',maintenance_private.generation_prepare_stage_evidence(gid),'coordinator',coordinator_proof);
 if wanted<>'prepare' then proof_value:=proof_value||jsonb_build_object('handoff',(select to_jsonb(w) from maintenance_private.generation_family_handoffs w where generation_id=gid and state='captured'));end if;
 if wanted='verify-family-before' then
  proof_value:=proof_value||jsonb_build_object('custodyDomain','OuchiMaintenance/generation-original-custody/v1','originals',maintenance_private.generation_original_set(gid),'ownerSessions',g.preimage->'sessions','rosterSessions',g.roster);
  insert into maintenance_private.generation_stage_custody values(gid,proof_value,pg_backend_pid(),txid_current());
 end if;
 insert into maintenance_private.generation_stage_checkpoints values(gid,wanted,proof_value,pg_backend_pid(),txid_current());return true;
end$$;
create function maintenance_private.verify_generation_stage_checkpoint(gid uuid,s jsonb,n uuid,targets jsonb,wanted text) returns table(proof jsonb,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;c maintenance_private.generation_stage_checkpoints;begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none' then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets or not maintenance_private.generation_stage_prefix_matches(gid) then return;end if;
 select * into c from maintenance_private.generation_stage_checkpoints where generation_id=gid and stage=wanted;if not found then return;end if;
 perform 1 from maintenance_private.generation_family_claim_frame(gid) where status='processing';if not found then return;end if;
 perform 1 from maintenance_private.verify_generation_retention_admission(gid,s,n,targets) where ok;if not found then return;end if;
 return query select c.proof,pg_backend_pid(),txid_current()::text;
end$$;
create function maintenance_private.check_generation_stage_commit() returns trigger
language plpgsql security definer set search_path='' as $$declare gid uuid;j private.kb_shared_deletion_journal;c maintenance_private.generation_stage_checkpoints;begin
 if tg_table_name='kb_shared_deletion_journal' then
  select generation_id into gid from maintenance_private.family_preparation_generations where root_request=new.request_id;
  if gid is null then return null;end if;
  select * into j from private.kb_shared_deletion_journal where request_id=new.request_id;
  if j.receipts='{}' then
   if exists(select 1 from maintenance_private.generation_stage_checkpoints where generation_id=gid) then raise exception 'Prepared stage receipt required at COMMIT';end if;return null;
  end if;
 else gid:=new.generation_id;select * into j from private.kb_shared_deletion_journal where request_id=(select root_request from maintenance_private.family_preparation_generations where generation_id=gid);end if;
 if not maintenance_private.generation_stage_prefix_matches(gid) or j.status is distinct from 'processing' or j.lease_until is null or j.lease_until<=clock_timestamp() then raise exception 'Exact ordered generation stage prefix required at COMMIT';end if;
 for c in select * from maintenance_private.generation_stage_checkpoints where generation_id=gid loop
  if not(j.receipts?c.stage) then raise exception 'Missing exact generation stage receipt at COMMIT';end if;
  if c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current() and not exists(select 1 from maintenance_private.verify_generation_stage_checkpoint(gid,(select scope from maintenance_private.family_preparation_generations where generation_id=gid),(select native_lease from maintenance_private.family_preparation_generations where generation_id=gid),(select targets from maintenance_private.family_preparation_generations where generation_id=gid),c.stage)) then raise exception 'Current generation stage proof required at producing COMMIT';end if;
 end loop;return null;
end$$;
create constraint trigger exact_generation_stage_root_commit after update on private.kb_shared_deletion_journal deferrable initially deferred for each row execute function maintenance_private.check_generation_stage_commit();
create constraint trigger exact_generation_stage_checkpoint_commit after insert on maintenance_private.generation_stage_checkpoints deferrable initially deferred for each row execute function maintenance_private.check_generation_stage_commit();
create constraint trigger exact_generation_stage_custody_commit after insert on maintenance_private.generation_stage_custody deferrable initially deferred for each row execute function maintenance_private.check_generation_stage_commit();
alter table private.kb_shared_deletion_journal enable always trigger exact_generation_stage_root_commit;
alter table maintenance_private.generation_stage_checkpoints enable always trigger exact_generation_stage_checkpoint_commit;
alter table maintenance_private.generation_stage_custody enable always trigger exact_generation_stage_custody_commit;
create function maintenance_private.is_new_generation_family_stage(r uuid) returns boolean
language sql stable security definer set search_path='' as $$select session_user::text='shared_retirement_backend' and current_setting('role')='none' and exists(select 1 from maintenance_private.generation_stage_checkpoints c join maintenance_private.family_preparation_generations g using(generation_id) where g.root_request=r and c.stage='handoff-family')$$;
-- Branch the legacy trigger ONLY for the exact new-generation checkpoint.
-- All previous context/legacy checks remain the original fallback body.
do $stage$declare def text;body text;begin
 select pg_get_functiondef(oid),prosrc into def,body from pg_proc where oid='maintenance_private.check_shared_family_stage_commit()'::regprocedure;
 if encode(sha256(convert_to(body,'UTF8')),'hex')<>'39ef3cab55fbcefa55323c40f33934a7d428d93fb12534090c7559f6d1e50715' then raise exception 'Legacy family stage dependency drift';end if;
 def:=replace(def,'begin'||chr(10),'begin'||chr(10)||' if tg_table_name=''kb_shared_deletion_journal'' and maintenance_private.is_new_generation_family_stage(new.request_id) then perform maintenance_private.assert_generation_stage_root(new.request_id);return null;end if;'||chr(10));
 execute def;
end$stage$;
create function maintenance_private.assert_generation_stage_root(r uuid) returns void
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;begin
 select * into g from maintenance_private.family_preparation_generations where root_request=r;
 if not maintenance_private.generation_stage_prefix_matches(g.generation_id) or not exists(select 1 from maintenance_private.verify_generation_stage_checkpoint(g.generation_id,g.scope,g.native_lease,g.targets,'handoff-family')) then raise exception 'Exact new generation family checkpoint required';end if;
end$$;
-- Historical fact only: metadata snapshot contains no Auth FK/read/lock. It does
-- not prove actual logout/Auth absence, worker identity, global completion or
-- grant post-Auth exclusion/erasure authority. Independent HMAC still required.
create function maintenance_private.read_generation_stage_custody(gid uuid,s jsonb,n uuid,targets jsonb) returns table(proof jsonb,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;c maintenance_private.generation_stage_custody;begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none' or not exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and(x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp()) and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid)) then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets or g.catalog_digest<>maintenance_private.requested_catalog_digest() or not maintenance_private.generation_stage_prefix_matches(gid) then return;end if;
 select * into c from maintenance_private.generation_stage_custody where generation_id=gid;
 if c.generation_id is null or c.proof is distinct from(select sc.proof from maintenance_private.generation_stage_checkpoints sc where sc.generation_id=gid and sc.stage='verify-family-before') then return;end if;
 return query select c.proof,pg_backend_pid(),txid_current()::text;
end$$;
do $$declare p record;begin for p in select oid::regprocedure f from pg_proc where pronamespace='maintenance_private'::regnamespace and proname in('generation_prepare_stage_evidence','generation_stage_prefix_matches','record_generation_stage_checkpoint','verify_generation_stage_checkpoint','check_generation_stage_commit','assert_generation_stage_root','read_generation_stage_custody','is_new_generation_family_stage') loop execute format('revoke all on function %s from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend,ouchi_retention_checker_backend',p.f);end loop;end$$;
grant execute on function maintenance_private.record_generation_stage_checkpoint(uuid,jsonb,uuid,jsonb,text,jsonb),maintenance_private.verify_generation_stage_checkpoint(uuid,jsonb,uuid,jsonb,text),maintenance_private.read_generation_stage_custody(uuid,jsonb,uuid,jsonb),maintenance_private.assert_generation_stage_root(uuid),maintenance_private.is_new_generation_family_stage(uuid) to shared_retirement_backend;
