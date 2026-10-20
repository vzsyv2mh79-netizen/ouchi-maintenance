-- LOCAL empty-file generation handoff/canonical capture review only. No global receipt/erasure/production activation.

create function maintenance_private.pre_handoff_generation_family_frame(gid uuid) returns table(status text,backend_pid integer,transaction_id text)
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
 or not maintenance_private.family_native_empty_scope(g.actor) or not maintenance_private.requested_native_children_are_empty(g.native_request)
 or exists(select 1 from maintenance_private.family_native_preparation_contexts where generation_id=gid)
 or exists(select 1 from maintenance_private.family_native_preparation_cancellations where generation_id=gid)
 or exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=gid)
 or exists(select 1 from maintenance_private.family_preparation_generation_homes h left join maintenance_private.current_family_preparation_generations c using(home_id) where h.generation_id=gid and c.generation_id is distinct from gid)
 or not exists(select 1 from maintenance_private.household_stop_bindings b where b.user_id=g.actor and b.scope=g.scope and b.native_lease=g.native_lease and b.state='processing' and b.lease_until>clock_timestamp())
 or not exists(select 1 from maintenance_private.household_principal_fences where user_id=g.actor and stopped) then return;end if;
 perform id from public.homes where owner_id=g.actor order by id for update;
 return query select j.status,pg_backend_pid(),txid_current()::text;
end$$;

create function maintenance_private.pre_generation_household_handoff(before_row jsonb,after_row jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare t text:=current_setting('maintenance.handoff_context',true);c maintenance_private.household_handoff_contexts;
 p maintenance_private.household_handoff_plans;b maintenance_private.household_stop_bindings;
begin
 if t is null or t='' then return false;end if;
 select x.* into c from maintenance_private.household_handoff_contexts x where x.token=t::uuid;
 if c.token is null or c.backend_pid<>pg_backend_pid() or c.transaction_id<>txid_current() or c.expires_at<=clock_timestamp() then return false;end if;
 select * into p from maintenance_private.household_handoff_plans where home_id=c.home_id for update;
 select * into b from maintenance_private.household_stop_bindings where user_id=c.owner_id for update;
 if p.home_id is null or b.user_id is null or p.scope is distinct from c.scope or p.plan_digest is distinct from c.plan_digest
  or p.owner_id is distinct from c.owner_id or p.successor_id is distinct from c.successor_id
  or b.scope is distinct from c.scope or b.native_lease is distinct from c.native_lease or b.state<>'processing' or b.lease_until<=clock_timestamp()
  or not exists(select 1 from maintenance_private.household_principal_fences where user_id=c.owner_id and stopped)
  or not exists(select 1 from maintenance_private.household_family_holds where home_id=c.home_id and principal=c.owner_id and scope=c.scope)
  or not exists(select 1 from auth.users where id=c.successor_id)
  or exists(select 1 from maintenance_private.household_principal_fences where user_id=c.successor_id and stopped)
  or not exists(select 1 from public.home_members where "homeId"=c.home_id and user_id=c.successor_id)
  or before_row->>'id' is distinct from c.home_id::text or before_row->>'owner_id' is distinct from c.owner_id::text
  or after_row->>'owner_id' is distinct from c.successor_id::text or (before_row-'owner_id') is distinct from (after_row-'owner_id')
  or maintenance_private.household_family_snapshot(c.home_id) is distinct from p.snapshot then return false;end if;
 return true;
end $$;

create function maintenance_private.pre_generation_capture_write(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$begin
 if maintenance_private.current_family_native_context() is not null then return maintenance_private.allowed_family_native_write(sch,tbl,op,prior,next_value);end if;
 return maintenance_private.pre_family_native_write(sch,tbl,op,prior,next_value);
end$$;
create function maintenance_private.pre_generation_native_observation(gid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('owner',maintenance_private.requested_actor_observation(g.actor,g.epoch),'roster',maintenance_private.family_generation_roster(g.actor),
 'native',(select to_jsonb(n) from maintenance_private.account_deletion_requests n where n.id=g.native_request),
 'route',(select to_jsonb(x) from maintenance_private.private_writer_routes x where kind='deletion-request' and object_id=g.native_request),
 'dispatches',(select coalesce(jsonb_agg(to_jsonb(x) order by stage),'[]') from maintenance_private.family_preparation_dispatches x where generation_id=gid),
 'prelogout',(select coalesce(jsonb_agg(to_jsonb(x) order by request_id),'[]') from maintenance_private.shared_prelogout_receipt_custody x where scope->>'requestID'=g.root_request::text),
 'familyContext',(select to_jsonb(x) from maintenance_private.shared_family_stage_contexts x where request_id=g.root_request),
 'terminal',(select to_jsonb(x) from maintenance_private.ouchi_owner_terminal_closures x where request_id=g.root_request),
 'householdFiles',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from maintenance_private.household_attachments x where home_id in(select id from public.homes where owner_id=g.actor)),
 'writeAttempts',(select coalesce(jsonb_agg(to_jsonb(x) order by attachment_id),'[]') from maintenance_private.attachment_write_attempts x where uploader_id=g.actor or owner_id=g.actor),
 'legacyPlans',(select coalesce(jsonb_agg(to_jsonb(x) order by home_id),'[]') from maintenance_private.household_handoff_plans x where owner_id=g.actor),
 'legacyHolds',(select coalesce(jsonb_agg(to_jsonb(x) order by home_id),'[]') from maintenance_private.household_family_holds x where principal=g.actor),
 'files',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from maintenance_private.product_attachments x where user_id=g.actor or captured_owner_id=g.actor or product_id in(select id from public.products where "homeId" in(select id from public.homes where owner_id=g.actor))),
 'copies',(select coalesce(jsonb_agg(to_jsonb(x) order by intent_id),'[]') from maintenance_private.household_copy_intents x where user_id=g.actor or source_uploader_id=g.actor or source_captured_owner_id=g.actor))
 from maintenance_private.family_preparation_generations g where generation_id=gid;
$$;
-- Installation refuses dispatcher/reader drift instead of accepting arbitrary bodies.
do $$begin
 if not exists(select 1 from pg_proc where oid='public.capture_maintenance_deletion_objects(uuid,uuid,uuid,uuid)'::regprocedure and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='77108701d1e59146d1f9cfd40e9293bc1712997023dfe94a0921c2fdfbefdd1c') then raise exception 'Canonical capture body drift';end if;
 if (select prosrc from pg_proc where oid='maintenance_private.pre_generation_native_observation(uuid)'::regprocedure) is distinct from (select prosrc from pg_proc where oid='maintenance_private.family_native_observation(uuid)'::regprocedure) then raise exception 'Native observation drift';end if;
 if (select prosrc from pg_proc where oid='maintenance_private.pre_handoff_generation_family_frame(uuid)'::regprocedure) is distinct from (select prosrc from pg_proc where oid='maintenance_private.generation_family_frame(uuid)'::regprocedure)
 or (select prosrc from pg_proc where oid='maintenance_private.pre_generation_household_handoff(jsonb,jsonb)'::regprocedure) is distinct from (select prosrc from pg_proc where oid='maintenance_private.allowed_household_handoff(jsonb,jsonb)'::regprocedure)
 or (select prosrc from pg_proc where oid='maintenance_private.pre_generation_capture_write(text,text,text,jsonb,jsonb)'::regprocedure) is distinct from (select prosrc from pg_proc where oid='maintenance_private.allowed_shared_native_stage_write(text,text,text,jsonb,jsonb)'::regprocedure)
 then raise exception 'Generation handoff dependency drift';end if;
end$$;
create or replace function maintenance_private.family_native_observation(gid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select maintenance_private.pre_generation_native_observation(gid)||jsonb_build_object('homeInstances',(
 select coalesce(jsonb_agg(to_jsonb(i) order by home_id),'[]') from maintenance_private.closure_home_instances i where home_id in(
 select h.id from public.homes h join maintenance_private.family_preparation_generations g on g.actor=h.owner_id where g.generation_id=gid
 union select home_id from maintenance_private.family_preparation_generation_homes where generation_id=gid)));
$$;
create table maintenance_private.generation_family_handoffs(
 generation_id uuid primary key references maintenance_private.family_native_preparations(generation_id),
 before_state jsonb not null,before_homes jsonb not null,outside_memberships jsonb not null,originals jsonb not null,
 after_state jsonb,after_homes jsonb,state text not null check(state in('staging','captured')),
 backend_pid integer not null,transaction_id bigint not null);
create table maintenance_private.generation_family_home_handoffs(
 generation_id uuid not null references maintenance_private.generation_family_handoffs(generation_id),home_id uuid not null,
 before_snapshot jsonb not null,after_snapshot jsonb not null,primary key(generation_id,home_id));
create table maintenance_private.generation_family_handoff_contexts(
 backend_pid integer not null,transaction_id bigint not null,generation_id uuid not null references maintenance_private.generation_family_handoffs(generation_id),
 phase text not null check(phase in('handoff','capture')),home_id uuid,primary key(backend_pid,transaction_id),check((phase='handoff')=(home_id is not null)));
do $$declare t text;begin foreach t in array array['generation_family_handoffs','generation_family_home_handoffs','generation_family_handoff_contexts'] loop
 execute format('alter table maintenance_private.%I enable row level security',t);execute format('revoke all on maintenance_private.%I from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend',t);
end loop;end$$;
create function maintenance_private.guard_generation_handoff_history() returns trigger
language plpgsql set search_path='' as $$begin
 if tg_op='UPDATE' and old.state='staging' and new.state='captured' and old.after_state is null and old.after_homes is null and new.after_state is not null and new.after_homes is not null
 and(to_jsonb(old)-array['state','after_state','after_homes'])=(to_jsonb(new)-array['state','after_state','after_homes'])
 and new.backend_pid=pg_backend_pid() and new.transaction_id=txid_current() then return new;end if;raise exception 'Immutable generation handoff history';
end$$;
create trigger immutable_generation_handoff before update or delete on maintenance_private.generation_family_handoffs for each row execute function maintenance_private.guard_generation_handoff_history();
alter table maintenance_private.generation_family_handoffs enable always trigger immutable_generation_handoff;
create trigger immutable_generation_home_handoff before update or delete on maintenance_private.generation_family_home_handoffs for each row execute function maintenance_private.refuse_family_attachment_journal_change();
alter table maintenance_private.generation_family_home_handoffs enable always trigger immutable_generation_home_handoff;
create function maintenance_private.generation_home_snapshot(h uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('home',(select to_jsonb(x) from public.homes x where id=h),
 'family',maintenance_private.household_family_snapshot(h),
 'routes',(select coalesce(jsonb_agg(to_jsonb(r) order by kind,object_id),'[]') from maintenance_private.household_write_routes r where home_id=h),
 'householdFiles',(select coalesce(jsonb_agg(to_jsonb(f) order by id),'[]') from maintenance_private.household_attachments f where home_id=h),
 'personalFiles',(select coalesce(jsonb_agg(to_jsonb(f) order by id),'[]') from maintenance_private.product_attachments f where product_id in(select id from public.products where "homeId"=h)),
 'writes',(select coalesce(jsonb_agg(to_jsonb(w) order by attachment_id),'[]') from maintenance_private.attachment_write_attempts w where attachment_id in(select f.id from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p."homeId"=h)));
$$;
create function maintenance_private.generation_original_set(gid uuid) returns jsonb
language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(to_jsonb(p) order by home_id,actor_id),'[]') from maintenance_private.generation_family_originals p where generation_id=gid$$;
create function maintenance_private.generation_all_home_snapshots(ids jsonb) returns jsonb
language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(maintenance_private.generation_home_snapshot((v->'home'->>'id')::uuid) order by v->'home'->>'id'),'[]') from jsonb_array_elements(ids) v$$;
-- Full before/after home comparison permits ONLY the selected owner replacement.
create function maintenance_private.generation_handoff_homes_match(gid uuid,before_homes jsonb,after_homes jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$declare b jsonb;a jsonb;t maintenance_private.family_preparation_generation_homes;g maintenance_private.family_preparation_generations;begin
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.generation_id is null or jsonb_typeof(before_homes)<>'array' or jsonb_array_length(before_homes)<>jsonb_array_length(after_homes) then return false;end if;
 for b in select value from jsonb_array_elements(before_homes) loop
  select value into a from jsonb_array_elements(after_homes) where value->'home'->>'id'=b->'home'->>'id';
  if a is null or b->'home'->>'owner_id'<>g.actor::text then return false;end if;
  select * into t from maintenance_private.family_preparation_generation_homes where generation_id=gid and home_id=(b->'home'->>'id')::uuid;
  if found then
   if a->'home'->>'owner_id'<>t.successor_id::text or (a#-'{home,owner_id}') is distinct from (b#-'{home,owner_id}') then return false;end if;
  elsif a is distinct from b then return false;end if;
 end loop;
 return not exists(select 1 from maintenance_private.family_preparation_generation_homes known_target where known_target.generation_id=gid and not exists(select 1 from jsonb_array_elements(before_homes) v where v->'home'->>'id'=known_target.home_id::text))
 and not exists(select 1 from public.homes h where h.owner_id=g.actor and not exists(select 1 from jsonb_array_elements(before_homes) v where v->'home'->>'id'=h.id::text));
end$$;
create function maintenance_private.current_generation_handoff_context() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('phase',c.phase,'homeID',c.home_id,'actor',g.actor,'native',g.native_request,'epoch',g.epoch,'lease',g.native_lease,'generationID',g.generation_id,'nativeBefore',w.before_state->'native')
 from maintenance_private.generation_family_handoff_contexts c join maintenance_private.generation_family_handoffs w using(generation_id)
 join maintenance_private.family_preparation_generations g using(generation_id) join private.kb_shared_deletion_journal j on j.request_id=g.root_request
 where session_user::text='shared_retirement_backend' and current_setting('role')='none' and c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current()
 and w.state='staging' and w.backend_pid=pg_backend_pid() and w.transaction_id=txid_current() and g.catalog_digest=maintenance_private.requested_catalog_digest()
 and j.status='processing' and j.scope=g.scope-'leaseToken' and j.user_id=g.actor and j.lease_token::text=g.scope->>'leaseToken' and j.lease_until>clock_timestamp() and j.receipts='{}'
 and exists(select 1 from maintenance_private.account_deletion_requests n where n.id=g.native_request and n.user_id=g.actor and n.app_epoch_id=g.epoch and n.state='running' and n.lease_token=g.native_lease and n.lease_until>clock_timestamp() and not n.records_erased and not n.identity_erased)
 and exists(select 1 from maintenance_private.household_stop_bindings b where b.user_id=g.actor and b.scope=g.scope and b.native_lease=g.native_lease and b.state='processing' and b.lease_until>clock_timestamp())
 and exists(select 1 from maintenance_private.household_principal_fences where user_id=g.actor and stopped);
$$;
create or replace function maintenance_private.allowed_household_handoff(before_row jsonb,after_row jsonb) returns boolean
language plpgsql security definer set search_path='' as $$declare c jsonb:=maintenance_private.current_generation_handoff_context();t maintenance_private.family_preparation_generation_homes;w maintenance_private.generation_family_handoffs;b jsonb;begin
 if c is null then return maintenance_private.pre_generation_household_handoff(before_row,after_row);end if;
 if c->>'phase'<>'handoff' or before_row->>'id' is distinct from c->>'homeID' then raise exception 'Exact generation home context required';end if;
 select * into t from maintenance_private.family_preparation_generation_homes where generation_id=(c->>'generationID')::uuid and home_id=(c->>'homeID')::uuid;
 select * into w from maintenance_private.generation_family_handoffs where generation_id=t.generation_id;
 select value into b from jsonb_array_elements(w.before_homes) where value->'home'->>'id'=t.home_id::text;
 return t.home_id is not null and before_row=b->'home' and after_row->>'owner_id'=t.successor_id::text and before_row->>'owner_id'=c->>'actor'
 and(before_row-'owner_id')=(after_row-'owner_id') and maintenance_private.generation_home_snapshot(t.home_id)=b;
end$$;
create or replace function maintenance_private.allowed_shared_native_stage_write(sch text,tbl text,op text,prior jsonb,next_value jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare c jsonb:=maintenance_private.current_generation_handoff_context();begin
 if c is null then return maintenance_private.pre_generation_capture_write(sch,tbl,op,prior,next_value);end if;
 if c->>'phase'='handoff' and sch='public' and tbl='homes' and op='UPDATE' then return false;end if;
 if c->>'phase'='capture' and sch='maintenance_private' and op='UPDATE' then
  if tbl='account_deletion_requests' and prior=c->'nativeBefore' and next_value->>'inventory_captured'='true' and(prior-array['inventory_captured','updated_at'])=(next_value-array['inventory_captured','updated_at']) then return true;end if;
  if tbl in('account_access','app_epochs') and prior->>'user_id'=c->>'actor' and(tbl='account_access' or prior->>'epoch_id'=c->>'epoch') and prior=next_value and next_value->>'enabled'='false' then return true;end if;
 end if;raise exception 'Exact generation handoff/capture write required';
end$$;
-- This proves the legitimate delta without verifying signatures recursively.
-- The original/claim reader and final hook then verify the same new-domain HMACs.
create function maintenance_private.generation_post_handoff_frame(gid uuid) returns table(status text,backend_pid integer,transaction_id text)
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
 or not maintenance_private.requested_native_children_are_empty(g.native_request)
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
create or replace function maintenance_private.generation_family_frame(gid uuid) returns table(status text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$begin
 if exists(select 1 from maintenance_private.generation_family_handoffs where generation_id=gid) then return query select * from maintenance_private.generation_post_handoff_frame(gid);return;end if;
 return query select * from maintenance_private.pre_handoff_generation_family_frame(gid);
end$$;
create function maintenance_private.execute_generation_family_handoff(gid uuid,s jsonb,native_lease uuid,targets jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;p maintenance_private.family_native_preparations;w maintenance_private.generation_family_handoffs;t maintenance_private.family_preparation_generation_homes;b jsonb;a jsonb;all_before jsonb;all_after jsonb;begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none' then raise exception 'Dedicated generation handoff caller required';end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.scope is distinct from s or g.native_lease is distinct from native_lease or g.targets is distinct from targets then raise exception 'Exact generation handoff scope required';end if;
 perform 1 from maintenance_private.generation_family_claim_frame(gid) where status='processing';if not found then raise exception 'All current original generations required';end if;
 select * into w from maintenance_private.generation_family_handoffs where generation_id=gid;
 if found then return exists(select 1 from maintenance_private.generation_post_handoff_frame(gid));end if;
 select * into p from maintenance_private.family_native_preparations where generation_id=gid;
 select coalesce(jsonb_agg(maintenance_private.generation_home_snapshot(h.id) order by h.id::text),'[]') into all_before from public.homes h where owner_id=g.actor;
 if not maintenance_private.family_native_empty_scope(g.actor) then raise exception 'Empty-file generation handoff only';end if;
 insert into maintenance_private.generation_family_handoffs values(gid,p.after_state,all_before,(select coalesce(jsonb_agg(to_jsonb(m) order by m."homeId"),'[]') from public.home_members m where m.user_id=g.actor and not exists(select 1 from jsonb_array_elements(all_before) h where h->'home'->>'id'=m."homeId"::text)),maintenance_private.generation_original_set(gid),null,null,'staging',pg_backend_pid(),txid_current());
 insert into maintenance_private.family_preparation_dispatches values(gid,'transfer','admitted');
 for t in select * from maintenance_private.family_preparation_generation_homes where generation_id=gid order by home_id loop
  b:=maintenance_private.generation_home_snapshot(t.home_id);
  insert into maintenance_private.generation_family_handoff_contexts values(pg_backend_pid(),txid_current(),gid,'handoff',t.home_id);
  update public.homes set owner_id=t.successor_id where id=t.home_id and owner_id=g.actor;if not found then raise exception 'Exact original home required';end if;
  delete from maintenance_private.generation_family_handoff_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();
  a:=maintenance_private.generation_home_snapshot(t.home_id);
  if(a#-'{home,owner_id}') is distinct from (b#-'{home,owner_id}') then raise exception 'Family data changed during handoff';end if;
  insert into maintenance_private.generation_family_home_handoffs values(gid,t.home_id,b,a);
 end loop;
 all_after:=maintenance_private.generation_all_home_snapshots(all_before);
 if not maintenance_private.generation_handoff_homes_match(gid,all_before,all_after) then raise exception 'Complete household preservation required';end if;
 insert into maintenance_private.generation_family_handoff_contexts values(pg_backend_pid(),txid_current(),gid,'capture',null);
 if public.capture_maintenance_deletion_objects(g.native_request,g.actor,g.epoch,g.native_lease) is distinct from true then raise exception 'Actual unchanged post-handoff canonical capture required';end if;
 delete from maintenance_private.generation_family_handoff_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 update maintenance_private.generation_family_handoffs set state='captured',after_state=maintenance_private.family_native_observation(gid),after_homes=all_after where generation_id=gid;
 perform 1 from maintenance_private.generation_family_claim_frame(gid) where status='processing';if not found then raise exception 'Same original set required after lawful handoff/capture';end if;return true;
end$$;
create function maintenance_private.verify_generation_family_handoff(gid uuid,s jsonb,native_lease uuid,targets jsonb) returns table(ok boolean,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$declare g maintenance_private.family_preparation_generations;f record;begin
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if g.scope is distinct from s or g.native_lease is distinct from native_lease or g.targets is distinct from targets then return;end if;
 select * into f from maintenance_private.generation_post_handoff_frame(gid);if not found then return;end if;
 perform 1 from maintenance_private.generation_family_claim_frame(gid) where status='processing';if not found then return;end if;
 return query select true,f.backend_pid,f.transaction_id;
end$$;
create function maintenance_private.check_generation_handoff_commit() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from maintenance_private.generation_family_handoffs w where w.generation_id=new.generation_id and w.backend_pid=pg_backend_pid() and w.transaction_id=txid_current() and w.state='captured')
 or not exists(select 1 from maintenance_private.generation_family_claim_frame(new.generation_id) where status='processing') then raise exception 'Exact generation handoff/capture COMMIT required';end if;return null;
end$$;
create constraint trigger exact_generation_handoff_commit after insert or update on maintenance_private.generation_family_handoffs deferrable initially deferred for each row execute function maintenance_private.check_generation_handoff_commit();
alter table maintenance_private.generation_family_handoffs enable always trigger exact_generation_handoff_commit;
-- Fixture-owned observers/core only, NOT a hosted least-privilege profile.
do $$declare p record;begin for p in select oid::regprocedure f from pg_proc where pronamespace='maintenance_private'::regnamespace and proname in('pre_generation_native_observation','pre_handoff_generation_family_frame','pre_generation_household_handoff','pre_generation_capture_write','guard_generation_handoff_history','generation_home_snapshot','generation_original_set','generation_all_home_snapshots','generation_handoff_homes_match','current_generation_handoff_context','generation_post_handoff_frame','execute_generation_family_handoff','verify_generation_family_handoff','check_generation_handoff_commit') loop execute format('revoke all on function %s from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend',p.f);end loop;end$$;
grant execute on function maintenance_private.execute_generation_family_handoff(uuid,jsonb,uuid,jsonb),maintenance_private.verify_generation_family_handoff(uuid,jsonb,uuid,jsonb) to shared_retirement_backend;
