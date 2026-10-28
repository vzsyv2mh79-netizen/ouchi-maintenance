-- ISOLATED REVIEW FIXTURE ONLY. Not a hosted migration or production grant.
-- Install after original family-preparation and controlled-provenance fixtures.
-- Original reserve/state/guards are intentionally not replaced.
create role ouchi_controlled_preparation_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema maintenance_private,private to ouchi_controlled_preparation_owner;
-- Local supplemental permissions: no Auth CRUD, managed ownership or role membership.
grant execute on function private.kb_read_controlled_generation_provenance(uuid,jsonb),private.kb_lock_controlled_operation(jsonb) to ouchi_controlled_preparation_owner;
grant execute on function maintenance_private.lock_family_generation(jsonb,text),maintenance_private.reserve_family_preparation_generation(uuid,jsonb,uuid,uuid,jsonb),maintenance_private.family_preparation_generation_state(uuid,jsonb,uuid,uuid,jsonb,text) to ouchi_controlled_preparation_owner;
grant select(generation_id,root_request,scope,native_lease,targets,backend_pid,transaction_id) on maintenance_private.family_preparation_generations to ouchi_controlled_preparation_owner;
create policy controlled_preparation_metadata on maintenance_private.family_preparation_generations for select to ouchi_controlled_preparation_owner using(true);

create table maintenance_private.controlled_family_preparation_bindings(
 generation_id uuid primary key references maintenance_private.family_preparation_generations(generation_id),
 root_request uuid not null unique,scope jsonb not null,native_lease uuid not null,targets jsonb not null,
 provenance jsonb not null,provenance_digest text not null check(provenance_digest ~ '^[a-f0-9]{64}$'),
 header_pid integer not null check(header_pid>0),header_xid text not null check(header_xid ~ '^[1-9][0-9]*$'),
 producer_pid integer not null check(producer_pid>0),producer_xid text not null check(producer_xid ~ '^[1-9][0-9]*$'));
alter table maintenance_private.controlled_family_preparation_bindings enable row level security;
alter table maintenance_private.controlled_family_preparation_bindings force row level security;
revoke all on maintenance_private.controlled_family_preparation_bindings from public,anon,authenticated,service_role,shared_retirement_backend;
grant select,insert on maintenance_private.controlled_family_preparation_bindings to ouchi_controlled_preparation_owner;
create policy controlled_preparation_read on maintenance_private.controlled_family_preparation_bindings for select to ouchi_controlled_preparation_owner using(true);
create policy controlled_preparation_insert on maintenance_private.controlled_family_preparation_bindings for insert to ouchi_controlled_preparation_owner with check(true);

create function maintenance_private.refuse_controlled_preparation_change() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'Controlled preparation binding is immutable';end$$;
create trigger immutable_controlled_preparation before update or delete or truncate on maintenance_private.controlled_family_preparation_bindings for each statement execute function maintenance_private.refuse_controlled_preparation_change();
alter table maintenance_private.controlled_family_preparation_bindings enable always trigger immutable_controlled_preparation;

-- Initial read discovers the operation only. Authority is reread AFTER its lock.
create function maintenance_private.lock_controlled_preparation_header(r uuid,s jsonb,g uuid,d text)
returns table(provenance jsonb,producer_pid integer,producer_xid text)
language plpgsql volatile security definer set search_path='' as $$
declare first_header record;locked_header record;
begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none'
 or r is null or g is null or s->>'requestID' is distinct from r::text or d is null or d !~ '^[a-f0-9]{64}$' then raise exception 'Exact controlled preparation identity required';end if;
 select * into strict first_header from private.kb_read_controlled_generation_provenance(g,s);
 if first_header.provenance->>'domain' is distinct from 'Kakei/shared-retirement/controlled-generation/v1'
 or first_header.provenance->>'generationID' is distinct from g::text or first_header.provenance->'scope' is distinct from s
 or first_header.provenance->>'digest' is distinct from d
 or first_header.producer_pid is null or first_header.producer_pid<=0
 or first_header.producer_xid is null or first_header.producer_xid !~ '^[1-9][0-9]*$'
 or first_header.producer_xid=txid_current()::text
 or private.kb_lock_controlled_operation(first_header.provenance->'operation') is distinct from true
 then raise exception 'Prior committed current controlled header required';end if;
 select * into strict locked_header from private.kb_read_controlled_generation_provenance(g,s);
 if locked_header.provenance is distinct from first_header.provenance
 or locked_header.producer_pid is distinct from first_header.producer_pid
 or locked_header.producer_xid is distinct from first_header.producer_xid then raise exception 'Controlled header changed';end if;
 -- Original helper validates exact least-privilege session principal and root,
 -- then acquires sorted owner/member locks. No copied weaker root predicate.
 perform maintenance_private.lock_family_generation(s,'requested');
 return query select locked_header.provenance,locked_header.producer_pid,locked_header.producer_xid;
end$$;

create function maintenance_private.controlled_family_preparation_generation_state(r uuid,s jsonb,g uuid,n uuid,t jsonb,d text)
returns table(ok boolean,pid integer,xid text,provenance_digest text,phase text)
language plpgsql volatile security definer set search_path='' as $$
declare h record;b maintenance_private.controlled_family_preparation_bindings;p record;
begin
 select * into strict h from maintenance_private.lock_controlled_preparation_header(r,s,g,d);
 select * into b from maintenance_private.controlled_family_preparation_bindings where generation_id=g;
 if not found or b.root_request is distinct from r or b.scope is distinct from s or b.native_lease is distinct from n
 or b.targets is distinct from t or b.provenance_digest is distinct from d or b.provenance is distinct from h.provenance
 or b.header_pid is distinct from h.producer_pid or b.header_xid is distinct from h.producer_xid then return;end if;
 select generation_id,root_request,scope,native_lease,targets,backend_pid,transaction_id into p from maintenance_private.family_preparation_generations where generation_id=g;
 if not found or p.root_request is distinct from r or p.scope is distinct from s or p.native_lease is distinct from n or p.targets is distinct from t
 or p.backend_pid is distinct from b.producer_pid or p.transaction_id::text is distinct from b.producer_xid then return;end if;
 if not exists(select 1 from maintenance_private.family_preparation_generation_state(r,s,g,n,t,'reserved') f where f.ok is true and f.backend_pid=pg_backend_pid() and f.transaction_id=txid_current()::text) then return;end if;
 return query select true,pg_backend_pid(),txid_current()::text,b.provenance_digest,'reserved'::text;
end$$;

create function maintenance_private.reserve_controlled_family_preparation_generation(r uuid,s jsonb,g uuid,n uuid,t jsonb,d text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare h record;p record;
begin
 select * into strict h from maintenance_private.lock_controlled_preparation_header(r,s,g,d);
 -- Checked under global/operation/root/participant locks. Never enter the old
 -- reserve's idempotent adoption branch, including a mapped retry.
 if exists(select 1 from maintenance_private.controlled_family_preparation_bindings where generation_id=g or root_request=r)
 or exists(select 1 from maintenance_private.family_preparation_generations where generation_id=g or root_request=r)
 then raise exception 'Fresh preparation only; reconcile protected state';end if;
 if maintenance_private.reserve_family_preparation_generation(r,s,g,n,t) is distinct from true then raise exception 'Actual family reservation refused';end if;
 select generation_id,root_request,scope,native_lease,targets,backend_pid,transaction_id into strict p from maintenance_private.family_preparation_generations where generation_id=g;
 if p.root_request is distinct from r or p.scope is distinct from s or p.native_lease is distinct from n or p.targets is distinct from t
 or p.backend_pid is distinct from pg_backend_pid() or p.transaction_id is distinct from txid_current() then raise exception 'Same transaction actual preparation required';end if;
 insert into maintenance_private.controlled_family_preparation_bindings values(g,r,s,n,t,h.provenance,d,h.producer_pid,h.producer_xid,p.backend_pid,p.transaction_id::text);
 if not exists(select 1 from maintenance_private.controlled_family_preparation_generation_state(r,s,g,n,t,d) f where f.ok is true) then raise exception 'Controlled preparation facts refused';end if;
 return true;
end$$;

create function maintenance_private.check_controlled_preparation_commit() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.producer_pid is distinct from pg_backend_pid() or new.producer_xid is distinct from txid_current()::text
 or not exists(select 1 from maintenance_private.controlled_family_preparation_generation_state(new.root_request,new.scope,new.generation_id,new.native_lease,new.targets,new.provenance_digest) f where f.ok is true)
 then raise exception 'Controlled preparation COMMIT refused';end if;return null;
end$$;
create constraint trigger complete_controlled_preparation after insert on maintenance_private.controlled_family_preparation_bindings deferrable initially deferred for each row execute function maintenance_private.check_controlled_preparation_commit();
alter table maintenance_private.controlled_family_preparation_bindings enable always trigger complete_controlled_preparation;

-- Historical metadata only, including after processing/terminal completion.
-- No current-operation/root lock, XID allocation, admission or execution grant.
create function maintenance_private.read_controlled_family_preparation_binding(r uuid,s jsonb,g uuid,d text)
returns table(kind text,native_lease uuid,targets jsonb,provenance_digest text,header_pid integer,header_xid text,producer_pid integer,producer_xid text)
language plpgsql stable security definer set search_path='' as $$
begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none'
 or r is null or g is null or s is null or s->>'requestID' is distinct from r::text
 or d is null or d !~ '^[a-f0-9]{64}$'
 or not exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid))
 then raise exception 'Exact controlled history principal and identity required';end if;
 return query
 select 'controlled-family-preparation-history'::text,b.native_lease,b.targets,b.provenance_digest,b.header_pid,b.header_xid,b.producer_pid,b.producer_xid
 from maintenance_private.controlled_family_preparation_bindings b
 join maintenance_private.family_preparation_generations p on p.generation_id=b.generation_id
 join private.kb_read_controlled_generation_provenance(g,s) h on h.provenance=b.provenance and h.producer_pid=b.header_pid and h.producer_xid=b.header_xid
 where b.generation_id=g and b.root_request=r and b.scope=s and b.provenance_digest=d
 and b.provenance->>'domain'='Kakei/shared-retirement/controlled-generation/v1'
 and b.provenance->>'generationID'=g::text and b.provenance->'scope'=s and b.provenance->>'digest'=d
 and p.root_request=b.root_request and p.scope=b.scope and p.native_lease=b.native_lease and p.targets=b.targets
 and p.backend_pid=b.producer_pid and p.transaction_id::text=b.producer_xid;
end$$;

-- Run installer only in isolated fixture. The NOLOGIN owner receives no schema
-- CREATE, table ownership, Auth privileges, or membership in another role.
do $$declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='maintenance_private'::regnamespace and proname in('refuse_controlled_preparation_change','lock_controlled_preparation_header','controlled_family_preparation_generation_state','reserve_controlled_family_preparation_generation','check_controlled_preparation_commit','read_controlled_family_preparation_binding') loop
  execute format('alter function %s owner to ouchi_controlled_preparation_owner',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role,shared_retirement_backend',f.signature);
 end loop;
end$$;
grant execute on function maintenance_private.reserve_controlled_family_preparation_generation(uuid,jsonb,uuid,uuid,jsonb,text),maintenance_private.controlled_family_preparation_generation_state(uuid,jsonb,uuid,uuid,jsonb,text) to shared_retirement_backend;
grant execute on function maintenance_private.read_controlled_family_preparation_binding(uuid,jsonb,uuid,text) to shared_retirement_backend;
