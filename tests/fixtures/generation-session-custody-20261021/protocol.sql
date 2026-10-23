-- Isolated review fixture. No live migration/grant. FOURTH checkpoint only.
-- Native row, child-empty gate, canonical capture and old original bodies unchanged.
create table maintenance_private.generation_session_custody(
 generation_id uuid primary key references maintenance_private.family_preparation_generations(generation_id),
 proof jsonb not null,signature text not null check(signature~'^[a-f0-9]{64}$'),
 backend_pid integer not null,transaction_id bigint not null);
alter table maintenance_private.generation_session_custody enable row level security;
revoke all on maintenance_private.generation_session_custody from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend,ouchi_retention_checker_backend;
create trigger immutable_generation_session_custody before update or delete on maintenance_private.generation_session_custody for each row execute function maintenance_private.refuse_family_attachment_journal_change();
alter table maintenance_private.generation_session_custody enable always trigger immutable_generation_session_custody;
-- Retain exact old three-prefix body under a new private name.
do $w$declare d text;b text;expected text;begin
 select pg_get_functiondef(oid),prosrc into d,b from pg_proc where oid='maintenance_private.generation_stage_prefix_matches(uuid)'::regprocedure;
 if encode(sha256(convert_to(b,'UTF8')),'hex')<>'16ab498f2bb073a36de89c2fbc33c85cfab4ae532413a951c438a1d50a90b4c4' then raise exception 'Exact three-prefix dependency drift';end if;expected:=b;
 execute replace(d,'maintenance_private.generation_stage_prefix_matches(', 'maintenance_private.pre_session_generation_stage_prefix_matches(');
 if(select prosrc from pg_proc where oid='maintenance_private.pre_session_generation_stage_prefix_matches(uuid)'::regprocedure) is distinct from expected then raise exception 'Original three-prefix preservation failed';end if;
end$w$;
create function maintenance_private.generation_session_prefix_matches(gid uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;j private.kb_shared_deletion_journal;c maintenance_private.generation_stage_checkpoints;w maintenance_private.generation_session_custody;expected jsonb:='{}';k text;prep jsonb;begin
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request;
 if j.scope is distinct from g.scope-'leaseToken' then return false;end if;
 prep:=maintenance_private.generation_prepare_stage_evidence(gid);if prep is null then return false;end if;
 foreach k in array array['prepare','handoff-family','verify-family-before'] loop
  select * into c from maintenance_private.generation_stage_checkpoints where generation_id=gid and stage=k;
  if c.generation_id is null or c.proof->'preparation' is distinct from prep then return false;end if;
  if k<>'prepare' and c.proof->'handoff' is distinct from(select to_jsonb(h) from maintenance_private.generation_family_handoffs h where generation_id=gid and state='captured') then return false;end if;
  if k='verify-family-before' and c.proof is distinct from(select proof from maintenance_private.generation_stage_custody where generation_id=gid) then return false;end if;
  expected:=expected||jsonb_build_object(k,(g.scope-'leaseToken')||jsonb_build_object('durable',true,'stage',k));
 end loop;
 expected:=expected||jsonb_build_object('verify-sessions-before',(g.scope-'leaseToken')||jsonb_build_object('durable',true,'stage','verify-sessions-before'));
 select * into w from maintenance_private.generation_session_custody where generation_id=gid;
 return coalesce(j.receipts=expected and w.generation_id is not null
 and w.proof->>'domain'='OuchiMaintenance/generation-session-custody/v1'
 and w.proof->'scope'=g.scope and w.proof->>'generationID'=gid::text and w.proof->>'nativeID'=g.native_request::text
 and w.proof->>'nativeLease'=g.native_lease::text and w.proof->>'epochID'=g.epoch::text and w.proof->'targets'=g.targets
 and w.proof->'preparation'=prep and w.proof->'familyCustody'=(select proof from maintenance_private.generation_stage_custody where generation_id=gid)
 and w.proof->'handoff'=(select to_jsonb(h) from maintenance_private.generation_family_handoffs h where generation_id=gid and state='captured')
 and w.proof->'sessionIDs'=g.preimage->'sessions' and w.proof->'appMappings'=g.preimage->'sessionMappings',false);
end$$;
create or replace function maintenance_private.generation_stage_prefix_matches(gid uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 if maintenance_private.pre_session_generation_stage_prefix_matches(gid) then return true;end if;
 return maintenance_private.generation_session_prefix_matches(gid);
end$$;
create function maintenance_private.generation_session_frame(gid uuid,s jsonb,n uuid,targets jsonb)
returns table(backend_pid integer,transaction_id text,session_digest text,captured boolean)
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;j private.kb_shared_deletion_journal;ids jsonb;maps jsonb;dependency record;w maintenance_private.generation_session_custody;begin
 -- Old strict frame supplies safe actual LOGIN, root FIRST, ordered participant
 -- locks, exact post-handoff native snapshot, stops, retention and no-file gates.
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets then return;end if;
 perform 1 from maintenance_private.generation_post_handoff_frame(gid);if not found then return;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request;
 if not(j.receipts?'verify-family-before') or not exists(select 1 from maintenance_private.generation_stage_custody where generation_id=gid) then return;end if;
 for dependency in select * from(values('auth.sessions','user_id','auth.users','id'),('maintenance_private.app_session_epochs','user_id','maintenance_private.app_epochs','user_id')) req(child,col,parent,parent_col) loop
  if not exists(select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] join pg_attribute p on p.attrelid=c.confrelid and p.attnum=c.confkey[1]
   where c.contype='f' and c.convalidated and not c.condeferrable and cardinality(c.conkey)=1 and cardinality(c.confkey)=1 and c.conrelid=to_regclass(dependency.child) and c.confrelid=to_regclass(dependency.parent) and a.attname=dependency.col and p.attname=dependency.parent_col) then return;end if;
 end loop;
 perform id from auth.users where id=g.actor and deleted_at is null for update;if not found then return;end if;
 perform 1 from maintenance_private.app_epochs where user_id=g.actor and epoch_id=g.epoch and not enabled for update;if not found then return;end if;
 perform id from auth.sessions where user_id=g.actor order by id for update;
 perform session_id from maintenance_private.app_session_epochs where user_id=g.actor order by session_id for update;
 select coalesce(jsonb_agg(id order by id),'[]') into ids from auth.sessions where user_id=g.actor;
 select coalesce(jsonb_agg(to_jsonb(m) order by session_id),'[]') into maps from maintenance_private.app_session_epochs m where user_id=g.actor;
 if ids is distinct from g.preimage->'sessions' or jsonb_array_length(ids)=0 or maps is distinct from g.preimage->'sessionMappings'
 or jsonb_array_length(maps)=0 or exists(select 1 from jsonb_array_elements(maps) m where m->>'epoch_id'<>g.epoch::text or not(ids? (m->>'session_id')))
 then return;end if;
 select * into w from maintenance_private.generation_session_custody where generation_id=gid;
 if found and (w.proof->'sessionIDs' is distinct from ids or w.proof->'appMappings' is distinct from maps) then return;end if;
 return query select pg_backend_pid(),txid_current()::text,encode(sha256(convert_to(array_to_json(array(select id::text from auth.sessions where user_id=g.actor order by id))::text,'UTF8')),'hex'),w.generation_id is not null;
end$$;
create function maintenance_private.generation_session_evidence(gid uuid,coverage jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('domain','OuchiMaintenance/generation-session-custody/v1','scope',g.scope,'generationID',gid,'nativeID',g.native_request,'nativeLease',g.native_lease,'epochID',g.epoch,'targets',g.targets,
 'preparation',maintenance_private.generation_prepare_stage_evidence(gid),'familyCustody',c.proof,'handoff',to_jsonb(h),'sessionIDs',g.preimage->'sessions','appMappings',g.preimage->'sessionMappings','coverage',coverage)
 from maintenance_private.family_preparation_generations g join maintenance_private.generation_stage_custody c using(generation_id) join maintenance_private.generation_family_handoffs h using(generation_id) where g.generation_id=gid and h.state='captured';
$$;
create function maintenance_private.preview_generation_sessions(gid uuid,s jsonb,n uuid,targets jsonb,coverage jsonb)
returns table(proof jsonb,signature text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare f record;w maintenance_private.generation_session_custody;expected jsonb;begin
 select * into f from maintenance_private.generation_session_frame(gid,s,n,targets);if not found then return;end if;
 if jsonb_typeof(coverage) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(coverage) k) is distinct from array['apps','authSessionsDigest','domain','generationID','nativeLease','scopeDigest']
 or coverage->>'domain' is distinct from 'SharedAccount/generation-session-coverage/v1' or coverage->>'authSessionsDigest' is distinct from f.session_digest or coverage->>'generationID' is distinct from gid::text or coverage->>'nativeLease' is distinct from n::text
 or coalesce(coverage->>'scopeDigest','')!~'^[a-f0-9]{64}$' 
 or jsonb_typeof(coverage->'apps') is distinct from 'array' or jsonb_array_length(coverage->'apps')<>jsonb_array_length(s->'apps')
 or exists(select 1 from jsonb_array_elements(coverage->'apps') with ordinality a(v,i) full join jsonb_array_elements(s->'apps') with ordinality b(v,i) using(i) where a.v-array['sessionDigest','originalsDigest','writerCoverageDigest'] is distinct from b.v or coalesce(a.v->>'sessionDigest','')!~'^[a-f0-9]{64}$' or coalesce(a.v->>'originalsDigest','')!~'^[a-f0-9]{64}$' or coalesce(a.v->>'writerCoverageDigest','')!~'^[a-f0-9]{64}$' or (select count(*) from jsonb_object_keys(a.v))<>6) then return;end if;
 if (select a->>'sessionDigest' from jsonb_array_elements(coverage->'apps') a where a->>'app'='ouchi-maintenance') is distinct from (select encode(sha256(convert_to(array_to_json(array(select session_id::text from maintenance_private.app_session_epochs where user_id=(s->>'userID')::uuid order by session_id))::text,'UTF8')),'hex')) then return;end if;
 expected:=maintenance_private.generation_session_evidence(gid,coverage);if expected is null then return;end if;
 select * into w from maintenance_private.generation_session_custody where generation_id=gid;
 if found and w.proof is distinct from expected then return;end if;
 return query select expected,w.signature,f.backend_pid,f.transaction_id;
end$$;
create function maintenance_private.record_generation_sessions(gid uuid,s jsonb,n uuid,targets jsonb,coverage jsonb,signed text) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare p record;begin
 if coalesce(signed,'')!~'^[a-f0-9]{64}$' then return false;end if;
 select * into p from maintenance_private.preview_generation_sessions(gid,s,n,targets,coverage);if not found then return false;end if;
 if p.signature is not null then return p.signature=signed;end if;
 insert into maintenance_private.generation_session_custody values(gid,p.proof,signed,pg_backend_pid(),txid_current());return true;
end$$;
create function maintenance_private.read_generation_session_history(gid uuid,s jsonb,n uuid,targets jsonb)
returns table(proof jsonb,signature text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;w maintenance_private.generation_session_custody;begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none' or not exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and(x.rolvaliduntil is null or x.rolvaliduntil>clock_timestamp()) and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid)) then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.scope is distinct from s or g.native_lease is distinct from n or g.targets is distinct from targets or g.catalog_digest<>maintenance_private.requested_catalog_digest() or not maintenance_private.generation_session_prefix_matches(gid) then return;end if;
 select * into w from maintenance_private.generation_session_custody where generation_id=gid;
 if w.proof is distinct from maintenance_private.generation_session_evidence(gid,w.proof->'coverage') then return;end if;
 return query select w.proof,w.signature,pg_backend_pid(),txid_current()::text;
end$$;
create function maintenance_private.check_generation_sessions_commit() returns trigger
language plpgsql security definer set search_path='' as $$declare gid uuid;g maintenance_private.family_preparation_generations;w maintenance_private.generation_session_custody;begin
 if tg_table_name='kb_shared_deletion_journal' then select generation_id into gid from maintenance_private.family_preparation_generations where root_request=new.request_id;else gid:=new.generation_id;end if;
 select * into w from maintenance_private.generation_session_custody where generation_id=gid;
 if not found then return null;end if;
 if not maintenance_private.generation_session_prefix_matches(gid) then raise exception 'Exact fourth session receipt required at COMMIT';end if;
 if w.backend_pid=pg_backend_pid() and w.transaction_id=txid_current() then
  select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
  if not exists(select 1 from maintenance_private.preview_generation_sessions(gid,g.scope,g.native_lease,g.targets,w.proof->'coverage')) then raise exception 'Current exact generation sessions required at producing COMMIT';end if;
 end if;return null;
end$$;
create constraint trigger exact_generation_sessions_commit after insert on maintenance_private.generation_session_custody deferrable initially deferred for each row execute function maintenance_private.check_generation_sessions_commit();
create constraint trigger exact_generation_sessions_root_commit after update on private.kb_shared_deletion_journal deferrable initially deferred for each row execute function maintenance_private.check_generation_sessions_commit();
alter table maintenance_private.generation_session_custody enable always trigger exact_generation_sessions_commit;
alter table private.kb_shared_deletion_journal enable always trigger exact_generation_sessions_root_commit;
do $$declare p record;begin for p in select oid::regprocedure f from pg_proc where pronamespace='maintenance_private'::regnamespace and proname in('pre_session_generation_stage_prefix_matches','generation_session_prefix_matches','generation_session_frame','generation_session_evidence','preview_generation_sessions','record_generation_sessions','read_generation_session_history','check_generation_sessions_commit') loop execute format('revoke all on function %s from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend,ouchi_retention_checker_backend',p.f);end loop;end$$;
grant execute on function maintenance_private.generation_session_frame(uuid,jsonb,uuid,jsonb),maintenance_private.preview_generation_sessions(uuid,jsonb,uuid,jsonb,jsonb),maintenance_private.record_generation_sessions(uuid,jsonb,uuid,jsonb,jsonb,text),maintenance_private.read_generation_session_history(uuid,jsonb,uuid,jsonb) to shared_retirement_backend;
