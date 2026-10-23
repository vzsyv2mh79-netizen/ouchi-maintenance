-- LOCAL review only. Dedicated checker is provisioned by isolated test setup,
-- never a production LOGIN/grant. No policy approval/default TTL is created.
create table maintenance_private.generation_retention_certificates(
 generation_id uuid primary key references maintenance_private.family_preparation_generations(generation_id),
 payload jsonb not null,signature text not null check(signature~'^[a-f0-9]{64}$'),
 backend_pid integer not null,transaction_id bigint not null);
create table maintenance_private.generation_retention_revocations(
 generation_id uuid primary key references maintenance_private.generation_retention_certificates(generation_id),
 reason_digest text not null check(reason_digest~'^[a-f0-9]{64}$'));
create table maintenance_private.generation_retention_admissions(
 generation_id uuid primary key references maintenance_private.generation_retention_certificates(generation_id),
 native_before jsonb not null,retention_after jsonb not null,
 backend_pid integer not null,transaction_id bigint not null);
create table maintenance_private.generation_retention_cancellations(
 generation_id uuid primary key references maintenance_private.generation_retention_admissions(generation_id),
 removed_row jsonb not null,backend_pid integer not null,transaction_id bigint not null);
create table maintenance_private.generation_retention_contexts(
 backend_pid integer not null,transaction_id bigint not null,generation_id uuid not null,
 operation text not null check(operation in('insert','cancel')),primary key(backend_pid,transaction_id));
do $$declare t text;begin foreach t in array array['generation_retention_certificates','generation_retention_revocations','generation_retention_admissions','generation_retention_cancellations','generation_retention_contexts'] loop
 execute format('alter table maintenance_private.%I enable row level security',t);execute format('revoke all on maintenance_private.%I from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend,ouchi_retention_checker_backend',t);
 if t<>'generation_retention_contexts' then execute format('create trigger immutable_generation_retention before update or delete on maintenance_private.%I for each row execute function maintenance_private.refuse_family_attachment_journal_change()',t);execute format('alter table maintenance_private.%I enable always trigger immutable_generation_retention',t);end if;
end loop;end$$;
create function maintenance_private.generation_retention_target(gid uuid) returns text
language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object('scope',g.scope,'generationID',g.generation_id,'native',g.native_request,'nativeLease',g.native_lease,'preimage',g.preimage,'roster',g.roster,'targets',g.targets,'catalog',g.catalog_digest)::text,'UTF8')),'hex') from maintenance_private.family_preparation_generations g where generation_id=gid;
$$;
create function maintenance_private.inspect_generation_retention(gid uuid,s jsonb,n uuid,targets jsonb)
returns table(target_digest text,checked_at text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;j private.kb_shared_deletion_journal;begin
 if session_user::text not in('ouchi_retention_checker_backend','shared_retirement_backend') or current_setting('role')<>'none'
 or not exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and(x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp()) and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid)) then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request for update;
 if g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets or j.status is distinct from 'requested' or j.scope is distinct from s-'leaseToken' or j.receipts<>'{}' or j.lease_token is not null or j.lease_until is not null or g.catalog_digest<>maintenance_private.requested_catalog_digest()
 or exists(select 1 from maintenance_private.family_preparation_generation_cancellations where generation_id=gid) then return;end if;
 perform pg_advisory_xact_lock(hashtext(g.actor::text));
 if not maintenance_private.family_generation_pristine(g.actor,g.epoch) or g.preimage is distinct from maintenance_private.requested_actor_observation(g.actor,g.epoch) or g.roster is distinct from maintenance_private.family_generation_roster(g.actor) then return;end if;
 return query select maintenance_private.generation_retention_target(gid),to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),pg_backend_pid(),txid_current()::text;
end$$;
create function maintenance_private.record_generation_retention_certificate(gid uuid,s jsonb,n uuid,targets jsonb,payload jsonb,signature text) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare f record;g maintenance_private.family_preparation_generations;prior maintenance_private.generation_retention_certificates;begin
 if session_user::text<>'ouchi_retention_checker_backend' then return false;end if;
 select * into f from maintenance_private.inspect_generation_retention(gid,s,n,targets);if not found then return false;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if jsonb_typeof(payload) is distinct from 'object' or(select count(*) from jsonb_object_keys(payload))<>10 or not(payload?&array['domain','generationID','requestID','nativeID','targetDigest','policyVersion','checkedAt','confirmedUntil','receiptLifetimeSeconds','evidenceDigest'])
 or payload->>'domain' is distinct from 'OuchiMaintenance/generation-retention-check/v1' or payload->>'generationID' is distinct from gid::text or payload->>'requestID' is distinct from g.root_request::text or payload->>'nativeID' is distinct from g.native_request::text or payload->>'targetDigest' is distinct from f.target_digest
 or jsonb_typeof(payload->'policyVersion') is distinct from 'string' or length(payload->>'policyVersion') not between 1 and 128
 or jsonb_typeof(payload->'checkedAt') is distinct from 'string' or jsonb_typeof(payload->'confirmedUntil') is distinct from 'string' or signature is null or signature!~'^[a-f0-9]{64}$' or coalesce(payload->>'evidenceDigest','')!~'^[a-f0-9]{64}$'
 or jsonb_typeof(payload->'receiptLifetimeSeconds') is distinct from 'number' or(payload->>'receiptLifetimeSeconds')::integer not between 1 and 2592000
 or(payload->>'checkedAt')::timestamptz>clock_timestamp() or(payload->>'checkedAt')::timestamptz<clock_timestamp()-interval '60 seconds'
 or(payload->>'confirmedUntil')::timestamptz<=clock_timestamp() or(payload->>'confirmedUntil')::timestamptz>(payload->>'checkedAt')::timestamptz+interval '1 hour'
 then return false;end if;
 select * into prior from maintenance_private.generation_retention_certificates where generation_id=gid;
 if found then return prior.payload=payload and prior.signature=signature;end if;
 insert into maintenance_private.generation_retention_certificates values(gid,payload,signature,pg_backend_pid(),txid_current());return true;
end$$;
create function maintenance_private.read_generation_retention_certificate(gid uuid,s jsonb,n uuid,targets jsonb)
returns table(payload jsonb,signature text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;j private.kb_shared_deletion_journal;p maintenance_private.generation_retention_certificates;begin
 if session_user::text not in('shared_retirement_backend','ouchi_retention_checker_backend') or current_setting('role')<>'none' or not exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and(x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp()) and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid)) then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request for update;
 select * into p from maintenance_private.generation_retention_certificates where generation_id=gid;
 if g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets or g.catalog_digest<>maintenance_private.requested_catalog_digest() or p.generation_id is null
 or p.payload->>'targetDigest' is distinct from maintenance_private.generation_retention_target(gid) or j.scope is distinct from s-'leaseToken' or j.status not in('requested','processing') or exists(select 1 from maintenance_private.generation_retention_revocations where generation_id=gid)
 or(p.payload->>'confirmedUntil')::timestamptz<=clock_timestamp() then return;end if;
 return query select p.payload,p.signature,pg_backend_pid(),txid_current()::text;
end$$;
-- Exact owned retention row, not a table-prefix/unknown-row exemption.
create function maintenance_private.generation_retention_children_match(gid uuid,require_live boolean) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;a maintenance_private.generation_retention_admissions;p maintenance_private.generation_retention_certificates;c record;row_value jsonb;has_row boolean;begin
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 select * into a from maintenance_private.generation_retention_admissions where generation_id=gid;
 if a.generation_id is null then return maintenance_private.requested_native_children_are_empty(g.native_request);end if;
 select * into p from maintenance_private.generation_retention_certificates where generation_id=gid;
 if p.generation_id is null or p.payload->>'targetDigest' is distinct from maintenance_private.generation_retention_target(gid)
 or a.native_before is distinct from(select after_state->'native' from maintenance_private.family_native_preparations where generation_id=gid)
 or a.retention_after is distinct from jsonb_build_object('request_id',g.native_request,'policy_version',p.payload->>'policyVersion','checked_at',(p.payload->>'checkedAt')::timestamptz,'confirmed_until',(p.payload->>'confirmedUntil')::timestamptz,'receipt_lifetime_seconds',(p.payload->>'receiptLifetimeSeconds')::integer) then return false;end if;
 if require_live and(exists(select 1 from maintenance_private.generation_retention_revocations where generation_id=gid) or(p.payload->>'confirmedUntil')::timestamptz<=clock_timestamp()) then return false;end if;
 select to_jsonb(x) into row_value from maintenance_private.deletion_retention_checks x where request_id=g.native_request;
 if row_value is distinct from a.retention_after then return false;end if;
 for c in select k.*,ns.nspname,cl.relname,aa.attname,pa.attname parent_column from pg_constraint k join pg_class cl on cl.oid=k.conrelid join pg_namespace ns on ns.oid=cl.relnamespace join pg_attribute aa on aa.attrelid=k.conrelid and aa.attnum=k.conkey[1] join pg_attribute pa on pa.attrelid=k.confrelid and pa.attnum=k.confkey[1] where k.contype='f' and k.confrelid='maintenance_private.account_deletion_requests'::regclass loop
  if not c.convalidated or c.condeferrable or cardinality(c.conkey)<>1 or cardinality(c.confkey)<>1 or c.parent_column<>'id' or c.nspname<>'maintenance_private'
  or c.relname not in('account_deletion_objects','deletion_receipt_sessions','deletion_retention_checks','deletion_capacity_moves','closure_read_windows','closure_submission_jobs','reviewed_retirements','reviewed_retirement_files')
  or c.attname<>(case when c.relname='reviewed_retirements' then 'deletion_request_id' else 'request_id' end) then return false;end if;
  if c.relname<>'deletion_retention_checks' then execute format('select exists(select 1 from %I.%I where %I=$1)',c.nspname,c.relname,c.attname) into has_row using g.native_request;if has_row then return false;end if;end if;
 end loop;return true;
end$$;
-- Preserve old dispatcher/cancel bodies and change only exact typed admissions.

create function maintenance_private.pre_retention_native_write(sch text,tbl text,op text,prior jsonb,next_value jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare c jsonb:=maintenance_private.current_generation_handoff_context();begin
 if c is null then return maintenance_private.pre_generation_capture_write(sch,tbl,op,prior,next_value);end if;
 if c->>'phase'='handoff' and sch='public' and tbl='homes' and op='UPDATE' then return false;end if;
 if c->>'phase'='capture' and sch='maintenance_private' and op='UPDATE' then
  if tbl='account_deletion_requests' and prior=c->'nativeBefore' and next_value->>'inventory_captured'='true' and(prior-array['inventory_captured','updated_at'])=(next_value-array['inventory_captured','updated_at']) then return true;end if;
  if tbl in('account_access','app_epochs') and prior->>'user_id'=c->>'actor' and(tbl='account_access' or prior->>'epoch_id'=c->>'epoch') and prior=next_value and next_value->>'enabled'='false' then return true;end if;
 end if;raise exception 'Exact generation handoff/capture write required';
end$$;

create function maintenance_private.pre_retention_family_cancel(r uuid,s jsonb,gid uuid,n uuid,targets jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare g maintenance_private.family_preparation_generations;p maintenance_private.family_native_preparations;
begin
 perform maintenance_private.lock_family_generation(s,'cancelled');
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid for share;
 select * into p from maintenance_private.family_native_preparations where generation_id=gid for share;
 if g.root_request is distinct from r or g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets or p.state is distinct from 'prepared' then raise exception 'Exact family native preparation required';end if;
 if exists(select 1 from maintenance_private.family_native_preparation_cancellations where generation_id=gid) then return exists(select 1 from maintenance_private.family_native_generation_state(r,s,gid,n,targets,'cancelled') where ok);end if;
 perform id from maintenance_private.account_deletion_requests where id=g.native_request for update;
 if not found or g.catalog_digest<>maintenance_private.requested_catalog_digest() or p.after_state is distinct from maintenance_private.family_native_observation(gid)
 or not maintenance_private.family_native_empty_scope(g.actor) or not maintenance_private.requested_native_children_are_empty(g.native_request)
 or exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=gid)
 then raise exception 'Changed/dispatched/unknown family preparation cannot restore';end if;
 insert into maintenance_private.family_native_preparation_contexts values(pg_backend_pid(),txid_current(),gid,'cancel');
 delete from maintenance_private.account_deletion_requests where id=g.native_request;
 delete from maintenance_private.private_writer_routes where kind='deletion-request' and object_id=g.native_request and principal=g.actor;
 update maintenance_private.account_access set enabled=(p.before_owner->'access'->>'enabled')::boolean where user_id=g.actor;
 update maintenance_private.app_epochs set enabled=(p.before_owner->'epoch'->>'enabled')::boolean where user_id=g.actor and epoch_id=g.epoch;
 delete from maintenance_private.household_stop_bindings where user_id=g.actor and scope=s and native_lease=n;
 if p.before_owner->'fence'='null'::jsonb then delete from maintenance_private.household_principal_fences where user_id=g.actor;
 else update maintenance_private.household_principal_fences set stopped=(p.before_owner->'fence'->>'stopped')::boolean where user_id=g.actor;end if;
 if p.before_owner is distinct from maintenance_private.requested_actor_observation(g.actor,g.epoch) or g.roster is distinct from maintenance_private.family_generation_roster(g.actor) then raise exception 'Exact family restoration unavailable';end if;
 delete from maintenance_private.family_native_preparation_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 insert into maintenance_private.family_native_preparation_cancellations values(gid,pg_backend_pid(),txid_current());
 if maintenance_private.cancel_family_preparation_generation(r,s,gid,n,targets) is distinct from true then raise exception 'Family generation cancellation required';end if;
 return true;
end$$;
do $$begin
 if(select prosrc from pg_proc where oid='maintenance_private.pre_retention_native_write(text,text,text,jsonb,jsonb)'::regprocedure) is distinct from(select prosrc from pg_proc where oid='maintenance_private.allowed_shared_native_stage_write(text,text,text,jsonb,jsonb)'::regprocedure)
 or(select prosrc from pg_proc where oid='maintenance_private.pre_retention_family_cancel(uuid,jsonb,uuid,uuid,jsonb)'::regprocedure) is distinct from(select prosrc from pg_proc where oid='maintenance_private.cancel_family_native_generation(uuid,jsonb,uuid,uuid,jsonb)'::regprocedure) then raise exception 'Retention dependency drift';end if;
end$$;
create function maintenance_private.current_generation_retention_context() returns jsonb
language sql stable security definer set search_path='' as $$select jsonb_build_object('operation',c.operation,'native',g.native_request,'retention',a.retention_after)
 from maintenance_private.generation_retention_contexts c join maintenance_private.family_preparation_generations g using(generation_id) join maintenance_private.generation_retention_admissions a using(generation_id) join private.kb_shared_deletion_journal j on j.request_id=g.root_request
 where session_user::text='shared_retirement_backend' and current_setting('role')='none' and c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current() and j.scope=g.scope-'leaseToken' and j.receipts='{}' and j.lease_token is null and j.lease_until is null
 and((c.operation='insert' and j.status='requested') or(c.operation='cancel' and j.status='cancelled'))$$;
create or replace function maintenance_private.allowed_shared_native_stage_write(sch text,tbl text,op text,prior jsonb,next_value jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare c jsonb:=maintenance_private.current_generation_retention_context();begin
 if c is null then return maintenance_private.pre_retention_native_write(sch,tbl,op,prior,next_value);end if;
 if sch='maintenance_private' and tbl='deletion_retention_checks' and((c->>'operation'='insert' and op='INSERT' and next_value=c->'retention') or(c->>'operation'='cancel' and op='DELETE' and prior=c->'retention')) then return true;end if;raise exception 'Exact generation retention write required';
end$$;
create function maintenance_private.admit_generation_retention(gid uuid,s jsonb,n uuid,targets jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;p maintenance_private.generation_retention_certificates;before_native jsonb;ret jsonb;begin
 perform maintenance_private.lock_family_generation(s,'requested');
 perform 1 from maintenance_private.read_generation_retention_certificate(gid,s,n,targets);if not found then raise exception 'Independent current retention certificate required';end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets then raise exception 'Exact retention generation required';end if;
 if exists(select 1 from maintenance_private.generation_retention_admissions where generation_id=gid) then return maintenance_private.generation_retention_children_match(gid,true);end if;
 perform 1 from maintenance_private.family_native_generation_state(g.root_request,s,gid,n,targets,'prepared') where ok;if not found then raise exception 'Actual prepared native required before retention';end if;
 select * into p from maintenance_private.generation_retention_certificates where generation_id=gid;
 if p.generation_id is null or p.payload->>'targetDigest' is distinct from maintenance_private.generation_retention_target(gid) or(p.payload->>'confirmedUntil')::timestamptz<=clock_timestamp() or exists(select 1 from maintenance_private.generation_retention_revocations where generation_id=gid) then raise exception 'Independent current retention certificate required';end if;
 select to_jsonb(x) into before_native from maintenance_private.account_deletion_requests x where id=g.native_request;
 ret:=jsonb_build_object('request_id',g.native_request,'policy_version',p.payload->>'policyVersion','checked_at',(p.payload->>'checkedAt')::timestamptz,'confirmed_until',(p.payload->>'confirmedUntil')::timestamptz,'receipt_lifetime_seconds',(p.payload->>'receiptLifetimeSeconds')::integer);
 insert into maintenance_private.generation_retention_admissions values(gid,before_native,ret,pg_backend_pid(),txid_current());
 insert into maintenance_private.generation_retention_contexts values(pg_backend_pid(),txid_current(),gid,'insert');
 insert into maintenance_private.deletion_retention_checks values(g.native_request,p.payload->>'policyVersion',(p.payload->>'checkedAt')::timestamptz,(p.payload->>'confirmedUntil')::timestamptz,(p.payload->>'receiptLifetimeSeconds')::integer);
 delete from maintenance_private.generation_retention_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 if not maintenance_private.generation_retention_children_match(gid,true) then raise exception 'Exact admitted retention row required';end if;return true;
end$$;
create or replace function maintenance_private.cancel_family_native_generation(r uuid,s jsonb,gid uuid,n uuid,targets jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;a maintenance_private.generation_retention_admissions;begin
 select * into a from maintenance_private.generation_retention_admissions where generation_id=gid;
 if not found then return maintenance_private.pre_retention_family_cancel(r,s,gid,n,targets);end if;
 perform maintenance_private.lock_family_generation(s,'cancelled');select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.root_request is distinct from r or g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets then raise exception 'Exact retention cancellation required';end if;
 if exists(select 1 from maintenance_private.generation_retention_cancellations where generation_id=gid) then return maintenance_private.pre_retention_family_cancel(r,s,gid,n,targets);end if;
 if not maintenance_private.generation_retention_children_match(gid,false) then raise exception 'Unknown retention row cannot be cancelled';end if;
 insert into maintenance_private.generation_retention_contexts values(pg_backend_pid(),txid_current(),gid,'cancel');
 delete from maintenance_private.deletion_retention_checks where request_id=g.native_request;
 delete from maintenance_private.generation_retention_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 if maintenance_private.pre_retention_family_cancel(r,s,gid,n,targets) is distinct from true then raise exception 'Exact native restoration required';end if;
 insert into maintenance_private.generation_retention_cancellations values(gid,a.retention_after,pg_backend_pid(),txid_current());return true;
end$$;
create function maintenance_private.check_generation_retention_commit() returns trigger
language plpgsql security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;j private.kb_shared_deletion_journal;begin
 select * into g from maintenance_private.family_preparation_generations where generation_id=new.generation_id;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request;
 if exists(select 1 from maintenance_private.generation_retention_contexts where generation_id=new.generation_id) then raise exception 'Retention context residue';end if;
 if j.status='cancelled' then
  if not exists(select 1 from maintenance_private.generation_retention_cancellations where generation_id=g.generation_id) or exists(select 1 from maintenance_private.account_deletion_requests where id=g.native_request) or exists(select 1 from maintenance_private.deletion_retention_checks where request_id=g.native_request) then raise exception 'Exact retention cancellation COMMIT required';end if;
 elsif not maintenance_private.generation_retention_children_match(g.generation_id,true) then raise exception 'Exact current retention COMMIT required';end if;return null;
end$$;
create constraint trigger exact_generation_retention_commit after insert on maintenance_private.generation_retention_admissions deferrable initially deferred for each row execute function maintenance_private.check_generation_retention_commit();
create constraint trigger exact_generation_retention_cancel_commit after insert on maintenance_private.generation_retention_cancellations deferrable initially deferred for each row execute function maintenance_private.check_generation_retention_commit();
alter table maintenance_private.generation_retention_admissions enable always trigger exact_generation_retention_commit;
alter table maintenance_private.generation_retention_cancellations enable always trigger exact_generation_retention_cancel_commit;
-- Only reviewed family frame calls change, retaining unknown-child refusal.

create or replace function maintenance_private.family_native_generation_state(r uuid,s jsonb,gid uuid,n uuid,targets jsonb,expected text)
returns table(ok boolean,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$
declare g maintenance_private.family_preparation_generations;p maintenance_private.family_native_preparations;c maintenance_private.family_native_preparation_cancellations;j private.kb_shared_deletion_journal;job maintenance_private.account_deletion_requests;
begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none' then return;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=r for update;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid for share;
 select * into p from maintenance_private.family_native_preparations where generation_id=gid for share;
 if g.root_request is distinct from r or g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets or p.state is distinct from 'prepared'
 or j.scope is distinct from s-'leaseToken' or j.user_id is distinct from g.actor or j.receipts<>'{}' or j.lease_token is not null or j.lease_until is not null
 or exists(select 1 from maintenance_private.family_native_preparation_contexts where generation_id=gid) then return;end if;
 select * into c from maintenance_private.family_native_preparation_cancellations where generation_id=gid;
 if expected='prepared' then
  select * into job from maintenance_private.account_deletion_requests where id=g.native_request for update;
  if j.status<>'requested' or c.generation_id is not null or job.id is null or job.state<>'running' or job.lease_token is distinct from n or job.lease_until<=clock_timestamp() or job.inventory_captured or job.records_erased or job.identity_erased or job.receipt_sessions_captured
  or g.catalog_digest<>maintenance_private.requested_catalog_digest() or p.after_state is distinct from maintenance_private.family_native_observation(gid)
  or not maintenance_private.family_native_empty_scope(g.actor) or not maintenance_private.generation_retention_children_match(g.generation_id,true) or exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=gid)
  or exists(select 1 from maintenance_private.family_preparation_generation_homes h left join maintenance_private.current_family_preparation_generations x using(home_id) where h.generation_id=gid and x.generation_id is distinct from gid) then return;end if;
 elsif expected='cancelled' then
  if j.status<>'cancelled' or c.generation_id is null or exists(select 1 from maintenance_private.account_deletion_requests where id=g.native_request)
  or exists(select 1 from maintenance_private.current_family_preparation_generations where generation_id=gid)
  or not exists(select 1 from maintenance_private.family_preparation_generation_cancellations where generation_id=gid) then return;end if;
  if c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current() and (g.catalog_digest<>maintenance_private.requested_catalog_digest() or p.before_owner is distinct from maintenance_private.requested_actor_observation(g.actor,g.epoch) or g.roster is distinct from maintenance_private.family_generation_roster(g.actor) or exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=gid)) then return;end if;
 else return;end if;
 return query select true,pg_backend_pid(),txid_current()::text;
end$$;

create or replace function maintenance_private.pre_handoff_generation_family_frame(gid uuid) returns table(status text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$
declare g maintenance_private.family_preparation_generations;p maintenance_private.family_native_preparations;j private.kb_shared_deletion_journal;n maintenance_private.account_deletion_requests;actor uuid;
begin
 if session_user::text not in('ouchi_shared_consent_backend','shared_retirement_backend') or current_setting('role')<>'none'
 or not exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and (x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp()) and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid)) then return;end if;
 -- Locate immutable root, then root FIRST before scope/participant/native locks.
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if not found then return;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request for update;
 if j.user_id is distinct from g.actor or j.scope is distinct from g.scope-'leaseToken' or j.receipts<>'{}'
 or not coalesce((j.status='requested' and j.lease_token is null and j.lease_until is null) or(j.status='processing' and j.lease_token::text=g.scope->>'leaseToken' and j.lease_until>clock_timestamp()),false) then return;end if;
 for actor in select distinct (m->>'actorID')::uuid from jsonb_array_elements(g.roster) h cross join lateral jsonb_array_elements(h->'members') m order by 1 loop perform pg_advisory_xact_lock(hashtext(actor::text));end loop;
 select * into p from maintenance_private.family_native_preparations where generation_id=gid for share;
 select * into n from maintenance_private.account_deletion_requests where id=g.native_request for update;
 if p.state is distinct from 'prepared' or n.id is null or n.user_id<>g.actor or n.app_epoch_id<>g.epoch or n.state<>'running' or n.lease_token is distinct from g.native_lease or n.lease_until is null or n.lease_until<=clock_timestamp()
 or n.inventory_captured or n.records_erased or n.identity_erased or n.receipt_sessions_captured
 or p.after_state is distinct from maintenance_private.family_native_observation(gid) or g.catalog_digest<>maintenance_private.requested_catalog_digest()
 or not maintenance_private.family_native_empty_scope(g.actor) or not maintenance_private.generation_retention_children_match(g.generation_id,true)
 or exists(select 1 from maintenance_private.family_native_preparation_contexts where generation_id=gid)
 or exists(select 1 from maintenance_private.family_native_preparation_cancellations where generation_id=gid)
 or exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=gid)
 or exists(select 1 from maintenance_private.family_preparation_generation_homes h left join maintenance_private.current_family_preparation_generations c using(home_id) where h.generation_id=gid and c.generation_id is distinct from gid)
 or not exists(select 1 from maintenance_private.household_stop_bindings b where b.user_id=g.actor and b.scope=g.scope and b.native_lease=g.native_lease and b.state='processing' and b.lease_until>clock_timestamp())
 or not exists(select 1 from maintenance_private.household_principal_fences where user_id=g.actor and stopped) then return;end if;
 perform id from public.homes where owner_id=g.actor order by id for update;
 return query select j.status,pg_backend_pid(),txid_current()::text;
end$$;

create or replace function maintenance_private.generation_post_handoff_frame(gid uuid) returns table(status text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;p maintenance_private.family_native_preparations;w maintenance_private.generation_family_handoffs;j private.kb_shared_deletion_journal;n maintenance_private.account_deletion_requests;after_value jsonb;begin
 if session_user::text not in('shared_retirement_backend','ouchi_shared_consent_backend') or current_setting('role')<>'none'
 or not exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and (x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp()) and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid)) then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request for update;
 if g.generation_id is null or j.status is distinct from 'processing' or j.scope is distinct from g.scope-'leaseToken' or j.user_id is distinct from g.actor or j.lease_token::text is distinct from g.scope->>'leaseToken' or j.lease_until is null or j.lease_until<=clock_timestamp() or j.receipts<>'{}' then return;end if;
 select * into p from maintenance_private.family_native_preparations where generation_id=gid for share;
 select * into w from maintenance_private.generation_family_handoffs where generation_id=gid for share;
 select * into n from maintenance_private.account_deletion_requests where id=g.native_request for update;
 if w.state is distinct from 'captured' or w.before_state is distinct from p.after_state or g.catalog_digest<>maintenance_private.requested_catalog_digest()
 or n.id is null or n.state<>'running' or n.user_id<>g.actor or n.app_epoch_id<>g.epoch or n.lease_token is distinct from g.native_lease or n.lease_until is null or n.lease_until<=clock_timestamp()
 or not n.inventory_captured or n.records_erased or n.identity_erased or n.receipt_sessions_captured or not maintenance_private.family_native_empty_scope(g.actor)
 or exists(select 1 from maintenance_private.generation_family_handoff_contexts where generation_id=gid)
 or exists(select 1 from maintenance_private.family_native_preparation_cancellations where generation_id=gid)
 or not maintenance_private.generation_retention_children_match(g.generation_id,true)
 or w.originals is distinct from maintenance_private.generation_original_set(gid)
 or w.outside_memberships is distinct from(select coalesce(jsonb_agg(to_jsonb(m) order by m."homeId"),'[]') from public.home_members m where m.user_id=g.actor and not exists(select 1 from jsonb_array_elements(w.before_homes) h where h->'home'->>'id'=m."homeId"::text))
 or exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=gid and(stage<>'transfer' or outcome<>'admitted'))
 or not exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=gid and stage='transfer' and outcome='admitted') then return;end if;
 after_value:=maintenance_private.family_native_observation(gid);
 if after_value is distinct from w.after_state or maintenance_private.generation_all_home_snapshots(w.before_homes) is distinct from w.after_homes
 or not maintenance_private.generation_handoff_homes_match(gid,w.before_homes,w.after_homes)
 or(w.before_state-array['owner','roster','native','dispatches']) is distinct from (after_value-array['owner','roster','native','dispatches'])
 or((w.before_state->'owner')-'contentDigest') is distinct from ((after_value->'owner')-'contentDigest')
 or((w.before_state->'native')-array['inventory_captured','updated_at']) is distinct from (to_jsonb(n)-array['inventory_captured','updated_at'])
 or after_value->'roster'<>'[]'::jsonb
 or exists(select 1 from maintenance_private.generation_family_home_handoffs r where r.generation_id=gid and(
 not exists(select 1 from maintenance_private.family_preparation_generation_homes t where t.generation_id=gid and t.home_id=r.home_id)
 or r.before_snapshot is distinct from(select v from jsonb_array_elements(w.before_homes) v where v->'home'->>'id'=r.home_id::text)
 or r.after_snapshot is distinct from(select v from jsonb_array_elements(w.after_homes) v where v->'home'->>'id'=r.home_id::text)))
 or(select count(*) from maintenance_private.generation_family_home_handoffs where generation_id=gid)<>(select count(*) from maintenance_private.family_preparation_generation_homes where generation_id=gid)
 or exists(select 1 from maintenance_private.family_preparation_generation_homes h left join maintenance_private.current_family_preparation_generations c using(home_id) where h.generation_id=gid and c.generation_id is distinct from gid) then return;end if;
 return query select j.status,pg_backend_pid(),txid_current()::text;
end$$;

do $$declare p record;begin for p in select oid::regprocedure f from pg_proc where pronamespace='maintenance_private'::regnamespace and proname in('generation_retention_target','inspect_generation_retention','record_generation_retention_certificate','read_generation_retention_certificate','generation_retention_children_match','pre_retention_native_write','pre_retention_family_cancel','current_generation_retention_context','admit_generation_retention','check_generation_retention_commit') loop execute format('revoke all on function %s from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend,ouchi_retention_checker_backend',p.f);end loop;end$$;
grant usage on schema private,maintenance_private to ouchi_retention_checker_backend;
grant execute on function maintenance_private.inspect_generation_retention(uuid,jsonb,uuid,jsonb),maintenance_private.read_generation_retention_certificate(uuid,jsonb,uuid,jsonb) to ouchi_retention_checker_backend,shared_retirement_backend;
grant execute on function maintenance_private.record_generation_retention_certificate(uuid,jsonb,uuid,jsonb,jsonb,text) to ouchi_retention_checker_backend;
grant execute on function maintenance_private.admit_generation_retention(uuid,jsonb,uuid,jsonb) to shared_retirement_backend;

create function maintenance_private.verify_generation_retention_admission(gid uuid,s jsonb,n uuid,targets jsonb) returns table(ok boolean,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;j private.kb_shared_deletion_journal;begin
 if session_user::text<>'shared_retirement_backend' then return;end if;
 perform 1 from maintenance_private.read_generation_retention_certificate(gid,s,n,targets);if not found then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request for update;
 if not exists(select 1 from maintenance_private.generation_retention_admissions where generation_id=gid) or not maintenance_private.generation_retention_children_match(gid,true)
 or not exists(select 1 from maintenance_private.account_deletion_requests where id=g.native_request and user_id=g.actor and app_epoch_id=g.epoch and state='running' and lease_token=n and lease_until>clock_timestamp() and not records_erased and not identity_erased)
 or not coalesce((j.status='requested' and j.lease_token is null and j.lease_until is null) or(j.status='processing' and j.lease_token::text=s->>'leaseToken' and j.lease_until>clock_timestamp()),false) then return;end if;
 return query select true,pg_backend_pid(),txid_current()::text;
end$$;
create function maintenance_private.revoke_generation_retention_certificate(gid uuid,s jsonb,n uuid,targets jsonb,reason text) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;begin
 if session_user::text<>'ouchi_retention_checker_backend' or current_setting('role')<>'none' or not exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and(x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp()) and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid)) or reason is null or reason!~'^[a-f0-9]{64}$' then return false;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets or not exists(select 1 from maintenance_private.generation_retention_certificates where generation_id=gid) then return false;end if;
 insert into maintenance_private.generation_retention_revocations values(gid,reason) on conflict do nothing;
 return exists(select 1 from maintenance_private.generation_retention_revocations where generation_id=gid and reason_digest=reason);
end$$;
revoke all on function maintenance_private.verify_generation_retention_admission(uuid,jsonb,uuid,jsonb),maintenance_private.revoke_generation_retention_certificate(uuid,jsonb,uuid,jsonb,text) from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend,ouchi_retention_checker_backend;
grant execute on function maintenance_private.verify_generation_retention_admission(uuid,jsonb,uuid,jsonb) to shared_retirement_backend;
grant execute on function maintenance_private.revoke_generation_retention_certificate(uuid,jsonb,uuid,jsonb,text) to ouchi_retention_checker_backend;
