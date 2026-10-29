-- Isolated review fixture only; no migration, production ACL or claim readiness.
-- Existing home-only plan/receipt PKs and all immutable original guards remain.
create table maintenance_private.family_preparation_generations(
 generation_id uuid primary key,root_request uuid not null unique,scope jsonb not null,
 native_request uuid not null unique,native_lease uuid not null,actor uuid not null,epoch uuid not null,
 targets jsonb not null,roster jsonb not null,preimage jsonb not null,catalog_digest text not null,
 backend_pid integer not null,transaction_id bigint not null);
create table maintenance_private.family_preparation_generation_homes(
 generation_id uuid not null references maintenance_private.family_preparation_generations(generation_id),
 home_id uuid not null,successor_id uuid not null,primary key(generation_id,home_id));
create table maintenance_private.family_preparation_generation_cancellations(
 generation_id uuid primary key references maintenance_private.family_preparation_generations(generation_id),
 backend_pid integer not null,transaction_id bigint not null,cancelled_at timestamptz not null default clock_timestamp());
create table maintenance_private.current_family_preparation_generations(
 home_id uuid primary key,generation_id uuid not null,
 foreign key(generation_id,home_id) references maintenance_private.family_preparation_generation_homes(generation_id,home_id));
-- Durable dispatch admission evidence, NOT a receipt inferred from success.
-- An entry of any outcome (including timeout/unknown) permanently blocks cancel.
create table maintenance_private.family_preparation_dispatches(
 generation_id uuid not null references maintenance_private.family_preparation_generations(generation_id),
 stage text not null check(stage in('copy','transfer','erase','logout')),
 outcome text not null check(outcome in('admitted','unknown','completed')),
 primary key(generation_id,stage));
do $$declare t text;begin foreach t in array array['family_preparation_generations','family_preparation_generation_homes','family_preparation_generation_cancellations','family_preparation_dispatches'] loop
 execute format('alter table maintenance_private.%I enable row level security',t);
 execute format('revoke all on maintenance_private.%I from public,anon,authenticated,service_role,shared_retirement_backend',t);
 execute format('create trigger immutable_family_preparation_history before update or delete on maintenance_private.%I for each row execute function maintenance_private.refuse_family_attachment_journal_change()',t);
 execute format('alter table maintenance_private.%I enable always trigger immutable_family_preparation_history',t);
end loop;end$$;
alter table maintenance_private.current_family_preparation_generations enable row level security;
revoke all on maintenance_private.current_family_preparation_generations from public,anon,authenticated,service_role,shared_retirement_backend;
create function maintenance_private.family_generation_roster(u uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('homeID',h.id,'ownerID',h.owner_id,
 'members',(select jsonb_agg(jsonb_build_object('actorID',p.actor,'epochID',e.epoch_id,'enabled',e.enabled,'access',a.enabled,
 'fence',(select to_jsonb(f) from maintenance_private.household_principal_fences f where f.user_id=p.actor),
 'binding',(select to_jsonb(b) from maintenance_private.household_stop_bindings b where b.user_id=p.actor),
 'nativeRequests',(select coalesce(jsonb_agg(to_jsonb(n) order by id),'[]') from maintenance_private.account_deletion_requests n where n.user_id=p.actor),
 'sessions',(select coalesce(jsonb_agg(s.id order by s.id),'[]') from auth.sessions s join maintenance_private.app_session_epochs m on m.session_id=s.id and m.user_id=s.user_id and m.epoch_id=e.epoch_id where s.user_id=p.actor)) order by p.actor)
 from(select u actor union select user_id from public.home_members where "homeId"=h.id) p
 left join maintenance_private.app_epochs e on e.user_id=p.actor left join maintenance_private.account_access a on a.user_id=p.actor)) order by h.id),'[]')
 from public.homes h where h.owner_id=u and exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id<>u);
$$;
create function maintenance_private.family_generation_pristine(u uuid,e uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from maintenance_private.app_epochs where user_id=u and epoch_id=e and enabled)
 and exists(select 1 from maintenance_private.account_access where user_id=u and enabled)
 and not exists(select 1 from maintenance_private.account_deletion_requests where user_id=u)
 and not exists(select 1 from maintenance_private.household_stop_bindings where user_id=u)
 and not exists(select 1 from maintenance_private.household_principal_fences where user_id=u and stopped)
 and not exists(select 1 from maintenance_private.household_handoff_plans where owner_id=u)
 and not exists(select 1 from maintenance_private.household_family_holds where principal=u)
 and not exists(select 1 from maintenance_private.household_copy_intents where user_id=u or source_uploader_id=u or source_captured_owner_id=u)
 and not exists(select 1 from maintenance_private.product_attachments where user_id=u or captured_owner_id=u or product_id in(select p.id from public.products p join public.homes h on h.id=p."homeId" where h.owner_id=u));
$$;
create function maintenance_private.lock_family_generation(s jsonb,wanted text) returns void
language plpgsql volatile security definer set search_path='' as $$
declare j private.kb_shared_deletion_journal;p uuid;
begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none'
 or not exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid))
 or maintenance_private.valid_household_scope(s) is distinct from true then raise exception 'Exact generation caller required';end if;
 select * into j from private.kb_shared_deletion_journal where request_id=(s->>'requestID')::uuid for update;
 if not found or j.scope is distinct from s-'leaseToken' or j.user_id::text is distinct from s->>'userID' or j.status<>wanted or j.lease_token is not null or j.lease_until is not null or j.receipts<>'{}' then raise exception 'Exact requested/cancelled generation root required';end if;
 -- Root first, then all current owner/member participants in stable order.
 for p in select actor from(select j.user_id actor union select m.user_id from public.home_members m join public.homes h on h.id=m."homeId" where h.owner_id=j.user_id) x order by actor loop perform pg_advisory_xact_lock(hashtext(p::text));end loop;
end$$;
create function maintenance_private.reserve_family_preparation_generation(r uuid,s jsonb,g uuid,n uuid,targets jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare prior maintenance_private.family_preparation_generations;roster jsonb;target jsonb;home_value jsonb;e uuid;native_id uuid;
begin
 if s->>'requestID' is distinct from r::text or g is null or n is null or n=(s->>'leaseToken')::uuid then raise exception 'Exact generation identity required';end if;
 perform maintenance_private.lock_family_generation(s,'requested');
 select * into prior from maintenance_private.family_preparation_generations where generation_id=g or root_request=r;
 if found then return prior.generation_id=g and prior.scope=s and prior.native_lease=n and prior.targets=targets and exists(select 1 from maintenance_private.family_preparation_generation_state(r,s,g,n,targets,'reserved') where ok);end if;
 select (a->>'scopeID')::uuid,(a->>'requestID')::uuid into e,native_id from jsonb_array_elements(s->'apps') a where a->>'app'='ouchi-maintenance';
 if e is null or native_id is null or not maintenance_private.family_generation_pristine((s->>'userID')::uuid,e) then raise exception 'No legacy/file/prepared generation adoption';end if;
 roster:=maintenance_private.family_generation_roster((s->>'userID')::uuid);
 if jsonb_typeof(targets)<>'array' or jsonb_array_length(targets)=0 or jsonb_array_length(targets)<>jsonb_array_length(roster)
 or (select jsonb_agg(t->>'homeID' order by t->>'homeID') from jsonb_array_elements(targets)t) is distinct from (select jsonb_agg(t->>'homeID' order by t->>'homeID') from jsonb_array_elements(roster)t)
 or exists(select 1 from jsonb_array_elements(roster) h cross join lateral jsonb_array_elements(h->'members') m where m->>'epochID' is null or m->>'enabled'<>'true' or m->>'access'<>'true' or jsonb_array_length(m->'sessions')=0 or m->'binding'<>'null'::jsonb or m->'fence'->>'stopped'='true' or jsonb_array_length(m->'nativeRequests')<>0)
 then raise exception 'Complete current family roster required';end if;
 for target in select value from jsonb_array_elements(targets) loop
  select value into home_value from jsonb_array_elements(roster) where value->>'homeID'=target->>'homeID';
  if (select count(*) from jsonb_object_keys(target))<>2 or not(target?'homeID' and target?'successorID') then raise exception 'Exact home/successor target required';end if;
  if target->>'successorID' is null or target->>'successorID'=s->>'userID' or not exists(select 1 from jsonb_array_elements(home_value->'members') m where m->>'actorID'=target->>'successorID') then raise exception 'Enrolled successor required';end if;
  perform 1 from public.homes where id=(target->>'homeID')::uuid for update;
  if exists(select 1 from maintenance_private.current_family_preparation_generations where home_id=(target->>'homeID')::uuid) then raise exception 'Current family generation already reserved';end if;
 end loop;
 insert into maintenance_private.family_preparation_generations values(g,r,s,native_id,n,(s->>'userID')::uuid,e,targets,roster,maintenance_private.requested_actor_observation((s->>'userID')::uuid,e),maintenance_private.requested_catalog_digest(),pg_backend_pid(),txid_current());
 for target in select value from jsonb_array_elements(targets) loop
  insert into maintenance_private.family_preparation_generation_homes values(g,(target->>'homeID')::uuid,(target->>'successorID')::uuid);
  insert into maintenance_private.current_family_preparation_generations values((target->>'homeID')::uuid,g);
 end loop;return true;
end$$;
create function maintenance_private.cancel_family_preparation_generation(r uuid,s jsonb,g uuid,n uuid,targets jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare p maintenance_private.family_preparation_generations;
begin
 perform maintenance_private.lock_family_generation(s,'cancelled');
 select * into p from maintenance_private.family_preparation_generations where generation_id=g for share;
 if p.root_request is distinct from r or p.scope is distinct from s or p.native_lease is distinct from n or p.targets is distinct from targets then raise exception 'Exact original generation required';end if;
 if exists(select 1 from maintenance_private.family_preparation_generation_cancellations where generation_id=g) then return true;end if;
 if p.catalog_digest<>maintenance_private.requested_catalog_digest() or not maintenance_private.family_generation_pristine(p.actor,p.epoch)
 or p.preimage is distinct from maintenance_private.requested_actor_observation(p.actor,p.epoch) or p.roster is distinct from maintenance_private.family_generation_roster(p.actor)
 or exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=g)
 or exists(select 1 from maintenance_private.family_preparation_generation_homes h left join maintenance_private.current_family_preparation_generations c using(home_id) where h.generation_id=g and c.generation_id is distinct from g)
 then raise exception 'Changed/prepared/dispatched generation cannot be cancelled';end if;
 insert into maintenance_private.family_preparation_generation_cancellations(generation_id,backend_pid,transaction_id) values(g,pg_backend_pid(),txid_current());
 delete from maintenance_private.current_family_preparation_generations where generation_id=g;return true;
end$$;
create function maintenance_private.family_preparation_generation_state(r uuid,s jsonb,g uuid,n uuid,targets jsonb,expected text)
returns table(ok boolean,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$
declare p maintenance_private.family_preparation_generations;c maintenance_private.family_preparation_generation_cancellations;j private.kb_shared_deletion_journal;
begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none' then return;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=r for update;
 select * into p from maintenance_private.family_preparation_generations where generation_id=g for share;
 if p.root_request is distinct from r or p.scope is distinct from s or p.native_lease is distinct from n or p.targets is distinct from targets or j.scope is distinct from s-'leaseToken' or j.receipts<>'{}' or j.lease_token is not null or j.lease_until is not null then return;end if;
 select * into c from maintenance_private.family_preparation_generation_cancellations where generation_id=g;
 if expected='reserved' then
  if j.status<>'requested' or c.generation_id is not null or p.catalog_digest<>maintenance_private.requested_catalog_digest() or not maintenance_private.family_generation_pristine(p.actor,p.epoch)
  or p.preimage is distinct from maintenance_private.requested_actor_observation(p.actor,p.epoch) or p.roster is distinct from maintenance_private.family_generation_roster(p.actor)
  or exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=g)
  or exists(select 1 from maintenance_private.family_preparation_generation_homes h left join maintenance_private.current_family_preparation_generations x using(home_id) where h.generation_id=g and x.generation_id is distinct from g) then return;end if;
 elsif expected='cancelled' then
  if j.status<>'cancelled' or c.generation_id is null or exists(select 1 from maintenance_private.current_family_preparation_generations where generation_id=g) then return;end if;
  if c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current() and (p.catalog_digest<>maintenance_private.requested_catalog_digest() or p.preimage is distinct from maintenance_private.requested_actor_observation(p.actor,p.epoch) or p.roster is distinct from maintenance_private.family_generation_roster(p.actor) or exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=g)) then return;end if;
 else return;end if;
 return query select true,pg_backend_pid(),txid_current()::text;
end$$;
-- Partial reservations/cancellation cannot COMMIT outside checked SQL facts.
create function maintenance_private.check_family_generation_commit() returns trigger
language plpgsql security definer set search_path='' as $$declare p maintenance_private.family_preparation_generations;wanted text;begin
 select * into p from maintenance_private.family_preparation_generations where generation_id=new.generation_id;
 wanted:=case when exists(select 1 from maintenance_private.family_preparation_generation_cancellations where generation_id=p.generation_id) then 'cancelled' else 'reserved' end;
 if not exists(select 1 from maintenance_private.family_preparation_generation_state(p.root_request,p.scope,p.generation_id,p.native_lease,p.targets,wanted) where ok) then raise exception 'Exact family generation COMMIT required';end if;return null;
end$$;
create constraint trigger complete_family_generation after insert on maintenance_private.family_preparation_generations deferrable initially deferred for each row execute function maintenance_private.check_family_generation_commit();
create constraint trigger cancelled_family_generation after insert on maintenance_private.family_preparation_generation_cancellations deferrable initially deferred for each row execute function maintenance_private.check_family_generation_commit();
alter table maintenance_private.family_preparation_generations enable always trigger complete_family_generation;
alter table maintenance_private.family_preparation_generation_cancellations enable always trigger cancelled_family_generation;
-- Helpers are fixture-owned private observers, NOT an approved hosted profile.
do $$declare p record;begin for p in select oid::regprocedure f from pg_proc where pronamespace='maintenance_private'::regnamespace and proname in('family_generation_roster','family_generation_pristine','lock_family_generation','reserve_family_preparation_generation','cancel_family_preparation_generation','family_preparation_generation_state','check_family_generation_commit') loop execute format('revoke all on function %s from public,anon,authenticated,service_role,shared_retirement_backend',p.f);end loop;end$$;
grant execute on function maintenance_private.reserve_family_preparation_generation(uuid,jsonb,uuid,uuid,jsonb),maintenance_private.cancel_family_preparation_generation(uuid,jsonb,uuid,uuid,jsonb),maintenance_private.family_preparation_generation_state(uuid,jsonb,uuid,uuid,jsonb,text) to shared_retirement_backend;
