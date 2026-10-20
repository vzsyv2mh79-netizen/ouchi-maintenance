-- Local owner-zero / no personal files prototype. NOT a migration or enabled
-- profile. Old prepared rows cannot be adopted. No customer file/Auth erasure.
create table maintenance_private.ouchi_requested_preparations(
 root_request uuid primary key,scope jsonb not null,native_request uuid not null unique,native_lease uuid not null,
 actor uuid not null,epoch uuid not null,before_state jsonb not null,prepared_state jsonb,
 catalog_digest text not null,created_pid integer not null,created_xid bigint not null,
 state text not null check(state in('capturing','prepared','cancelled')),cancelled_at timestamptz,cancelled_pid integer,cancelled_xid bigint);
create table maintenance_private.ouchi_requested_preparation_contexts(
 backend_pid integer not null,transaction_id bigint not null,root_request uuid not null,
 operation text not null check(operation in('prepare','cancel')),primary key(backend_pid,transaction_id));
alter table maintenance_private.ouchi_requested_preparations enable row level security;
alter table maintenance_private.ouchi_requested_preparation_contexts enable row level security;
revoke all on maintenance_private.ouchi_requested_preparations,maintenance_private.ouchi_requested_preparation_contexts from public,anon,authenticated,service_role,shared_retirement_backend;

create function maintenance_private.requested_catalog_digest() returns text
language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'owner',c.relowner,'acl',c.relacl::text,
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select jsonb_agg(jsonb_build_object('name',q.conname,'definition',pg_get_constraintdef(q.oid),'validated',q.convalidated) order by q.conname) from pg_constraint q where q.conrelid=c.oid),
 'triggers',(select jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid),
 'policies',(select jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=c.oid)) order by n.nspname,c.relname)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','maintenance_private','auth') and c.relkind in('r','p')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',p.proargtypes::text,'body',p.prosrc,'owner',p.proowner,'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text) order by n.nspname,p.proname,p.proargtypes::text)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private','maintenance_private','auth'))
, 'roles',(select jsonb_agg(jsonb_build_object('name',x.rolname,'login',x.rolcanlogin,'inherit',x.rolinherit,'super',x.rolsuper,'bypass',x.rolbypassrls,'createdb',x.rolcreatedb,'createrole',x.rolcreaterole,'replication',x.rolreplication,'validUntil',x.rolvaliduntil) order by x.rolname) from pg_roles x),
 'memberships',(select jsonb_agg(jsonb_build_object('role',m.roleid,'member',m.member,'admin',m.admin_option) order by m.roleid,m.member) from pg_auth_members m)
 )::text,'UTF8')),'hex');
$$;
create function maintenance_private.requested_actor_observation(u uuid,e uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'access',(select to_jsonb(a) from maintenance_private.account_access a where user_id=u),
 'epoch',(select to_jsonb(a) from maintenance_private.app_epochs a where user_id=u and epoch_id=e),
 'fence',(select to_jsonb(a) from maintenance_private.household_principal_fences a where user_id=u),
 'binding',(select to_jsonb(a) from maintenance_private.household_stop_bindings a where user_id=u),
 'sessions',(select coalesce(jsonb_agg(id order by id),'[]') from auth.sessions where user_id=u),
 'sessionMappings',(select coalesce(jsonb_agg(to_jsonb(a) order by session_id),'[]') from maintenance_private.app_session_epochs a where user_id=u),
 'otherEpochs',(select coalesce(jsonb_agg(to_jsonb(a) order by epoch_id),'[]') from maintenance_private.app_epochs a where user_id=u and epoch_id<>e),
 'contentDigest',encode(sha256(convert_to(jsonb_build_object(
  'homes',(select coalesce(jsonb_agg(to_jsonb(h) order by id),'[]') from public.homes h where owner_id=u),
  'members',(select coalesce(jsonb_agg(to_jsonb(m) order by m."homeId",m.user_id),'[]') from public.home_members m where m.user_id=u or m."homeId" in(select id from public.homes where owner_id=u)),
  'products',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.products p where p."homeId" in(select id from public.homes where owner_id=u)),
  'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.maintenance_tasks t where t."productId" in(select id from public.products where "homeId" in(select id from public.homes where owner_id=u))),
  'history',(select coalesce(jsonb_agg(to_jsonb(h) order by id),'[]') from public.maintenance_history h where h."productId" in(select id from public.products where "homeId" in(select id from public.homes where owner_id=u)))
 )::text,'UTF8')),'hex'));
$$;
create function maintenance_private.requested_native_children_are_empty(n uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare c record;found_row boolean;
begin
 for c in select k.*,ns.nspname,cl.relname,a.attname,pa.attname as parent_column from pg_constraint k
  join pg_class cl on cl.oid=k.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
  join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1]
  join pg_attribute pa on pa.attrelid=k.confrelid and pa.attnum=k.confkey[1]
  where k.contype='f' and k.confrelid='maintenance_private.account_deletion_requests'::regclass loop
  if not c.convalidated or c.condeferrable or cardinality(c.conkey)<>1 or cardinality(c.confkey)<>1 or c.parent_column<>'id'
  or c.nspname<>'maintenance_private' or c.relname not in('account_deletion_objects','deletion_receipt_sessions','deletion_retention_checks','deletion_capacity_moves','closure_read_windows','closure_submission_jobs','reviewed_retirements','reviewed_retirement_files')
  or c.attname<>(case when c.relname='reviewed_retirements' then 'deletion_request_id' else 'request_id' end)
  then return false;end if;
  execute format('select exists(select 1 from %I.%I where %I=$1)',c.nspname,c.relname,c.attname) into found_row using n;
  if found_row then return false;end if;
 end loop;return true;
end$$;
create function maintenance_private.requested_scope_is_pristine(u uuid,r uuid,n uuid,e uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from maintenance_private.private_writer_routes where kind='deletion-request' and object_id=n)
 and not exists(select 1 from maintenance_private.account_deletion_requests where user_id=u or id=n)
 and not exists(select 1 from maintenance_private.household_stop_bindings where user_id=u)
 and not exists(select 1 from maintenance_private.household_principal_fences where user_id=u and stopped)
 and not exists(select 1 from public.homes h where h.owner_id=u and exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id<>u))
 and not exists(select 1 from maintenance_private.household_handoff_plans where owner_id=u or root_request_id=r)
 and not exists(select 1 from maintenance_private.household_family_holds where principal=u or root_request_id=r)
 and not exists(select 1 from maintenance_private.household_copy_intents where user_id=u or source_uploader_id=u or source_captured_owner_id=u)
 and not exists(select 1 from maintenance_private.product_attachments f where f.user_id=u or f.captured_owner_id=u or f.product_id in(select p.id from public.products p join public.homes h on h.id=p."homeId" where h.owner_id=u))
 and not exists(select 1 from maintenance_private.shared_prelogout_receipt_custody where scope->>'requestID'=r::text)
 and not exists(select 1 from maintenance_private.shared_family_stage_contexts where request_id=r)
 and not exists(select 1 from maintenance_private.reviewed_retirements where user_id=u)
 and not exists(select 1 from maintenance_private.account_closure_reviews where user_id=u)
 and not exists(select 1 from maintenance_private.closure_coverage_plans where user_id=u)
 and exists(select 1 from maintenance_private.account_access where user_id=u and enabled)
 and exists(select 1 from maintenance_private.app_epochs where user_id=u and epoch_id=e and enabled)
 and exists(select 1 from auth.sessions s join maintenance_private.app_session_epochs m on m.session_id=s.id and m.user_id=s.user_id where s.user_id=u and m.epoch_id=e);
$$;
create function maintenance_private.requested_provenance_context() returns jsonb
language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('operation',c.operation,'root',p.root_request,'scope',p.scope,'native',p.native_request,'lease',p.native_lease,'actor',p.actor,'epoch',p.epoch,'before',p.before_state,'after',p.prepared_state)
 from maintenance_private.ouchi_requested_preparation_contexts c join maintenance_private.ouchi_requested_preparations p on p.root_request=c.root_request
 join private.kb_shared_deletion_journal j on j.request_id=p.root_request
 where c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current()
 and j.scope=p.scope-'leaseToken' and j.user_id=p.actor and j.lease_token is null and j.lease_until is null and j.receipts='{}'
 and ((c.operation='prepare' and j.status='requested' and p.state='capturing') or(c.operation='cancel' and j.status='cancelled' and p.state='prepared'));
$$;
create function maintenance_private.requested_provenance_write(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare c jsonb:=maintenance_private.requested_provenance_context();u text;n text;e text;prep boolean;
begin
 if c is null then return false;end if;
 if sch<>'maintenance_private' then raise exception 'Unexpected provenance write';end if;
 u:=c->>'actor';n:=c->>'native';e:=c->>'epoch';prep:=c->>'operation'='prepare';
 if tbl='account_deletion_requests' then
  if prep and op='INSERT' and next_value->>'id'=n and next_value->>'user_id'=u and next_value->>'app_epoch_id'=e and next_value->>'state'='running'
   and next_value->>'lease_token'=c->>'lease' and next_value->>'attempts'='1'
   and next_value->>'inventory_captured'='false' and next_value->>'records_erased'='false' and next_value->>'identity_erased'='false' and next_value->>'receipt_sessions_captured'='false' then return true;end if;
  if prep and op='UPDATE' and prior->>'id'=n and (prior-array['inventory_captured','updated_at'])=(next_value-array['inventory_captured','updated_at']) and next_value->>'inventory_captured'='true' then return true;end if;
  if not prep and op='DELETE' and prior=(c->'after'->'native') then return true;end if;
 elsif tbl in('account_access','app_epochs') and op='UPDATE' then
  if prior->>'user_id'=u and (tbl='account_access' or prior->>'epoch_id'=e) and (prior-'enabled')=(next_value-'enabled')
   and next_value->'enabled'=(case when prep then 'false'::jsonb else (c->'before'->(case when tbl='account_access' then 'access' else 'epoch' end)->'enabled') end) then return true;end if;
 elsif tbl='account_deletion_objects' and not prep and op='DELETE' then
  return prior->>'request_id'=n and prior->>'absence_confirmed'='false';
 end if;
 raise exception 'Exact provenance write required';
end$$;
create or replace function maintenance_private.allowed_shared_native_stage_write(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$begin
 if maintenance_private.requested_provenance_context() is not null then return maintenance_private.requested_provenance_write(sch,tbl,op,prior,next_value);end if;
 return maintenance_private.legacy_native_write_for_requested_provenance(sch,tbl,op,prior,next_value);
end$$;

create function maintenance_private.lock_requested_preparation(r uuid,s jsonb,wanted text) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare j private.kb_shared_deletion_journal;app jsonb;
begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none'
 or not exists(select 1 from pg_roles x where x.rolname=session_user and x.rolcanlogin and not x.rolsuper and not x.rolbypassrls and not x.rolcreatedb and not x.rolcreaterole and not x.rolreplication and not exists(select 1 from pg_auth_members m where m.member=x.oid or m.roleid=x.oid))
 or maintenance_private.valid_household_scope(s) is distinct from true or s->>'requestID' is distinct from r::text then raise exception 'Scoped preparation caller required';end if;
 select * into j from private.kb_shared_deletion_journal where request_id=r for update;
 if not found or j.scope is distinct from s-'leaseToken' or j.user_id::text is distinct from s->>'userID' or j.status<>wanted or j.lease_token is not null or j.lease_until is not null or j.receipts<>'{}' then raise exception 'Exact requested/cancelled root required';end if;
 select value into app from jsonb_array_elements(s->'apps') where value->>'app'='ouchi-maintenance';if app is null then raise exception 'Ouchi mapping required';end if;
 perform pg_advisory_xact_lock(hashtext(j.user_id::text));
 return (app->>'requestID')::uuid;
end$$;
create function maintenance_private.save_ouchi_requested_preparation(r uuid,s jsonb,n uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare native_id uuid;e uuid;prior maintenance_private.ouchi_requested_preparations;before_value jsonb;
begin
 native_id:=maintenance_private.lock_requested_preparation(r,s,'requested');
 select (a->>'scopeID')::uuid into e from jsonb_array_elements(s->'apps') a where a->>'app'='ouchi-maintenance';
 select * into prior from maintenance_private.ouchi_requested_preparations where root_request=r;
 if found then return prior.scope=s and prior.native_request=native_id and prior.native_lease=n and prior.state='prepared';end if;
 if n is null or n=(s->>'leaseToken')::uuid or not maintenance_private.requested_native_children_are_empty(native_id) or not maintenance_private.requested_scope_is_pristine((s->>'userID')::uuid,r,native_id,e) then raise exception 'No legacy preparation retrofit';end if;
 before_value:=maintenance_private.requested_actor_observation((s->>'userID')::uuid,e);
 insert into maintenance_private.ouchi_requested_preparations values(r,s,native_id,n,(s->>'userID')::uuid,e,before_value,null,maintenance_private.requested_catalog_digest(),pg_backend_pid(),txid_current(),'capturing',null,null,null);
 return true;
end$$;
create function maintenance_private.prepare_ouchi_requested(r uuid,s jsonb,n uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare p maintenance_private.ouchi_requested_preparations;after_value jsonb;native_id uuid;
begin
 native_id:=maintenance_private.lock_requested_preparation(r,s,'requested');
 select * into p from maintenance_private.ouchi_requested_preparations where root_request=r for update;
 if not found or p.scope is distinct from s or p.native_request<>native_id or p.native_lease<>n then raise exception 'Preimage must precede actual preparation';end if;
 if p.state='prepared' then
  perform 1 from maintenance_private.ouchi_owner_only_frame(r,(s->>'leaseToken')::uuid,s,n);
  return found and p.prepared_state=maintenance_private.requested_prepared_observation(r) and p.catalog_digest=maintenance_private.requested_catalog_digest();end if;
 if p.state<>'capturing' or p.created_pid<>pg_backend_pid() or p.created_xid<>txid_current()
 or p.before_state is distinct from maintenance_private.requested_actor_observation(p.actor,p.epoch)
 or p.catalog_digest<>maintenance_private.requested_catalog_digest() then raise exception 'Original preimage changed';end if;
 insert into maintenance_private.ouchi_requested_preparation_contexts values(pg_backend_pid(),txid_current(),r,'prepare');
 insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts)
 values(native_id,p.actor,p.epoch,'running',n,clock_timestamp()+interval '2 minutes',1);
 insert into maintenance_private.private_writer_routes values('deletion-request',native_id,p.actor);
 if public.capture_maintenance_deletion_objects(native_id,p.actor,p.epoch,n) is distinct from true then raise exception 'Canonical preparation unavailable';end if;
 if exists(select 1 from maintenance_private.account_deletion_objects where request_id=native_id) then raise exception 'Empty-file preparation only';end if;
 insert into maintenance_private.household_stop_bindings values(p.actor,s,n,clock_timestamp()+interval '2 minutes','requested');
 update maintenance_private.household_stop_bindings set state='processing' where user_id=p.actor and scope=s and native_lease=n and state='requested';
 if not found then raise exception 'Exact new stop binding required';end if;
 insert into maintenance_private.household_principal_fences(user_id) values(p.actor) on conflict do nothing;
 update maintenance_private.household_principal_fences set stopped=true where user_id=p.actor;
 perform 1 from maintenance_private.ouchi_owner_only_frame(r,(s->>'leaseToken')::uuid,s,n);if not found then raise exception 'Actual zero-owner preparation frame required';end if;
 after_value:=maintenance_private.requested_prepared_observation(r);
 update maintenance_private.ouchi_requested_preparations set prepared_state=after_value,state='prepared' where root_request=r;
 delete from maintenance_private.ouchi_requested_preparation_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();return true;
end$$;
create function maintenance_private.requested_prepared_observation(r uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('actor',maintenance_private.requested_actor_observation(p.actor,p.epoch),
 'native',(select to_jsonb(n) from maintenance_private.account_deletion_requests n where n.id=p.native_request),
 'inventory',(select coalesce(jsonb_agg(to_jsonb(o) order by attachment_id),'[]') from maintenance_private.account_deletion_objects o where request_id=p.native_request),
 'route',(select to_jsonb(x) from maintenance_private.private_writer_routes x where kind='deletion-request' and object_id=p.native_request),
 'holds',(select coalesce(jsonb_agg(to_jsonb(x) order by home_id),'[]') from maintenance_private.household_family_holds x where principal=p.actor or root_request_id=r),
 'plans',(select coalesce(jsonb_agg(to_jsonb(x) order by home_id),'[]') from maintenance_private.household_handoff_plans x where owner_id=p.actor or root_request_id=r),
 'custody',(select to_jsonb(x) from maintenance_private.shared_prelogout_receipt_custody x where request_id=p.native_request),
 'family',(select to_jsonb(x) from maintenance_private.shared_family_stage_contexts x where request_id=r),
 'terminal',(select to_jsonb(x) from maintenance_private.ouchi_owner_terminal_closures x where request_id=r),
 'receiptSessions',(select coalesce(jsonb_agg(to_jsonb(x) order by session_id),'[]') from maintenance_private.deletion_receipt_sessions x where request_id=p.native_request),
 'retention',(select to_jsonb(x) from maintenance_private.deletion_retention_checks x where request_id=p.native_request),
 'readWindow',(select to_jsonb(x) from maintenance_private.closure_read_windows x where request_id=p.native_request),
 'submission',(select to_jsonb(x) from maintenance_private.closure_submission_jobs x where request_id=p.native_request),
 'files',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from maintenance_private.product_attachments x where user_id=p.actor or captured_owner_id=p.actor or product_id in(select id from public.products where "homeId" in(select id from public.homes where owner_id=p.actor))),
 'copies',(select coalesce(jsonb_agg(to_jsonb(x) order by intent_id),'[]') from maintenance_private.household_copy_intents x where user_id=p.actor or source_uploader_id=p.actor or source_captured_owner_id=p.actor),
 'reviews',(select coalesce(jsonb_agg(to_jsonb(x) order by review_request_id),'[]') from maintenance_private.account_closure_reviews x where user_id=p.actor),
 'reviewPlans',(select coalesce(jsonb_agg(to_jsonb(x) order by plan_id),'[]') from maintenance_private.closure_coverage_plans x where user_id=p.actor),
 'retirements',(select coalesce(jsonb_agg(to_jsonb(x) order by event_id),'[]') from maintenance_private.reviewed_retirements x where user_id=p.actor))
 from maintenance_private.ouchi_requested_preparations p where p.root_request=r;
$$;
create function maintenance_private.cancel_ouchi_requested_preparation(r uuid,s jsonb,n uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare p maintenance_private.ouchi_requested_preparations;native_id uuid;before_value jsonb;
begin
 native_id:=maintenance_private.lock_requested_preparation(r,s,'cancelled');
 select * into p from maintenance_private.ouchi_requested_preparations where root_request=r for update;
 if not found or p.scope is distinct from s or p.native_request<>native_id or p.native_lease<>n then raise exception 'No original preparation provenance';end if;
 if p.state='cancelled' then return not exists(select 1 from maintenance_private.account_deletion_requests where id=p.native_request);end if;
 perform id from maintenance_private.account_deletion_requests where id=p.native_request for update;
 if p.state<>'prepared' or not found or not maintenance_private.requested_native_children_are_empty(p.native_request) or p.prepared_state is distinct from maintenance_private.requested_prepared_observation(r)
 or p.catalog_digest<>maintenance_private.requested_catalog_digest() then raise exception 'Prepared footprint/writer changed; no restoration';end if;
 before_value:=p.before_state;
 insert into maintenance_private.ouchi_requested_preparation_contexts values(pg_backend_pid(),txid_current(),r,'cancel');
 -- Only metadata CREATED by this same protocol is removed. No Storage/Auth/
 -- original/family content, shared consent or result-token row is deleted.
 delete from maintenance_private.account_deletion_objects where request_id=p.native_request;
 delete from maintenance_private.account_deletion_requests where id=p.native_request;
 delete from maintenance_private.private_writer_routes where kind='deletion-request' and object_id=p.native_request and principal=p.actor;
 update maintenance_private.account_access set enabled=(before_value->'access'->>'enabled')::boolean where user_id=p.actor;
 update maintenance_private.app_epochs set enabled=(before_value->'epoch'->>'enabled')::boolean where user_id=p.actor and epoch_id=p.epoch;
 delete from maintenance_private.household_stop_bindings where user_id=p.actor and scope=s and native_lease=n;
 if before_value->'fence'='null'::jsonb then delete from maintenance_private.household_principal_fences where user_id=p.actor;
 else update maintenance_private.household_principal_fences set stopped=(before_value->'fence'->>'stopped')::boolean where user_id=p.actor;end if;
 if maintenance_private.requested_actor_observation(p.actor,p.epoch) is distinct from p.before_state then raise exception 'Exact original restoration unavailable';end if;
 update maintenance_private.ouchi_requested_preparations set state='cancelled',cancelled_at=clock_timestamp(),cancelled_pid=pg_backend_pid(),cancelled_xid=txid_current() where root_request=r;
 delete from maintenance_private.ouchi_requested_preparation_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();return true;
end$$;
create function maintenance_private.ouchi_requested_preparation_state(r uuid,s jsonb,n uuid,expected text)
returns table(ok boolean,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$
declare p maintenance_private.ouchi_requested_preparations;j private.kb_shared_deletion_journal;
begin
 if session_user::text<>'shared_retirement_backend' or current_setting('role')<>'none' then return;end if;
 if not exists(select 1 from pg_trigger where tgrelid='maintenance_private.ouchi_requested_preparations'::regclass and tgname='exact_requested_preparation_record' and tgenabled='A')
 or not exists(select 1 from pg_trigger where tgrelid='maintenance_private.ouchi_requested_preparations'::regclass and tgname='requested_preparation_commit' and tgenabled='A' and tgdeferrable and tginitdeferred) then return;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=r for update;
 select * into p from maintenance_private.ouchi_requested_preparations where root_request=r for share;
 if p.root_request is null or p.scope is distinct from s or p.native_lease<>n or p.state<>expected
 or j.scope is distinct from s-'leaseToken' or j.user_id<>p.actor or j.lease_token is not null or j.lease_until is not null or j.receipts<>'{}'
 or exists(select 1 from maintenance_private.ouchi_requested_preparation_contexts where root_request=r) then return;end if;
 if expected='prepared' then
  if j.status<>'requested' or p.catalog_digest<>maintenance_private.requested_catalog_digest()
  or p.prepared_state is distinct from maintenance_private.requested_prepared_observation(r) then return;end if;
  perform 1 from maintenance_private.ouchi_owner_only_frame(r,(s->>'leaseToken')::uuid,s,n);if not found then return;end if;
 elsif expected='cancelled' then
  if j.status<>'cancelled' or p.cancelled_at is null or exists(select 1 from maintenance_private.account_deletion_requests where id=p.native_request) then return;end if;
  -- During the restoring transaction enforce the full before-image. A later
  -- historical verify must not reset a new root's legitimately prepared state.
  if p.cancelled_pid=pg_backend_pid() and p.cancelled_xid=txid_current()
  and p.before_state is distinct from maintenance_private.requested_actor_observation(p.actor,p.epoch) then return;end if;
 else return;end if;
 return query select true,pg_backend_pid(),txid_current()::text;
end$$;
create function maintenance_private.guard_requested_preparation_record() returns trigger
language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'Immutable requested preparation provenance';end if;
 if (to_jsonb(old)-array['state','prepared_state','cancelled_at','cancelled_pid','cancelled_xid']) is distinct from (to_jsonb(new)-array['state','prepared_state','cancelled_at','cancelled_pid','cancelled_xid'])
 or not((old.state='capturing' and new.state='prepared' and old.prepared_state is null and new.prepared_state is not null and new.cancelled_at is null)
  or(old.state='prepared' and new.state='cancelled' and new.prepared_state=old.prepared_state and new.cancelled_at is not null and new.cancelled_pid=pg_backend_pid() and new.cancelled_xid=txid_current()))
 then raise exception 'Immutable requested preparation transition';end if;return new;
end$$;
create trigger exact_requested_preparation_record before update or delete on maintenance_private.ouchi_requested_preparations
for each row execute function maintenance_private.guard_requested_preparation_record();
create function maintenance_private.check_requested_preparation_commit() returns trigger
language plpgsql security definer set search_path='' as $$
declare p maintenance_private.ouchi_requested_preparations;
begin
 select * into p from maintenance_private.ouchi_requested_preparations where root_request=new.root_request;
 if p.root_request is null or p.state='capturing'
 or exists(select 1 from maintenance_private.ouchi_requested_preparation_contexts where root_request=new.root_request)
 then raise exception 'Same-transaction actual preparation required';end if;
 if p.state='prepared' and (p.created_pid<>pg_backend_pid() or p.created_xid<>txid_current()
  or not exists(select 1 from maintenance_private.ouchi_requested_preparation_state(p.root_request,p.scope,p.native_lease,'prepared') where ok))
 then raise exception 'Exact prepared COMMIT required';end if;
 if p.state='cancelled' and (p.before_state is distinct from maintenance_private.requested_actor_observation(p.actor,p.epoch)
  or not exists(select 1 from maintenance_private.ouchi_requested_preparation_state(p.root_request,p.scope,p.native_lease,'cancelled') where ok))
 then raise exception 'Exact restored COMMIT required';end if;
 return null;
end$$;
create constraint trigger requested_preparation_commit after insert or update on maintenance_private.ouchi_requested_preparations
 deferrable initially deferred for each row execute function maintenance_private.check_requested_preparation_commit();
create function maintenance_private.refuse_cancelled_native_request_reuse() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from maintenance_private.ouchi_requested_preparations where native_request=new.id and state='cancelled') then raise exception 'Cancelled native identity cannot be reused';end if;return new;
end$$;
create trigger cancelled_preparation_native_identity before insert or update of id on maintenance_private.account_deletion_requests
for each row execute function maintenance_private.refuse_cancelled_native_request_reuse();
alter table maintenance_private.account_deletion_requests enable always trigger cancelled_preparation_native_identity;
-- No LOGIN/table grant is supplied here. Local profile below adds exact owner
-- capabilities only, and remains a separate unapproved hosted permission gate.
-- Revoke every newly defined helper's implicit PUBLIC EXECUTE. The only LOGIN
-- entry points are the four fixed protocol RPCs, never helpers/raw before JSON.
do $$declare signature text;begin
 foreach signature in array array[
 'maintenance_private.requested_catalog_digest()',
 'maintenance_private.requested_actor_observation(uuid,uuid)',
 'maintenance_private.requested_scope_is_pristine(uuid,uuid,uuid,uuid)',
 'maintenance_private.requested_native_children_are_empty(uuid)',
 'maintenance_private.requested_provenance_context()',
 'maintenance_private.requested_provenance_write(text,text,text,jsonb,jsonb)',
 'maintenance_private.lock_requested_preparation(uuid,jsonb,text)',
 'maintenance_private.requested_prepared_observation(uuid)',
 'maintenance_private.guard_requested_preparation_record()',
 'maintenance_private.check_requested_preparation_commit()',
 'maintenance_private.refuse_cancelled_native_request_reuse()'
 ] loop execute format('revoke all on function %s from public,anon,authenticated,service_role,shared_retirement_backend',signature);end loop;
 foreach signature in array array[
 'maintenance_private.save_ouchi_requested_preparation(uuid,jsonb,uuid)',
 'maintenance_private.prepare_ouchi_requested(uuid,jsonb,uuid)',
 'maintenance_private.cancel_ouchi_requested_preparation(uuid,jsonb,uuid)'
 ] loop
  execute format('alter function %s owner to ouchi_shared_native_owner',signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',signature);
  execute format('grant execute on function %s to shared_retirement_backend',signature);
 end loop;
 execute 'revoke all on function maintenance_private.ouchi_requested_preparation_state(uuid,jsonb,uuid,text) from public,anon,authenticated,service_role';
 execute 'grant execute on function maintenance_private.ouchi_requested_preparation_state(uuid,jsonb,uuid,text) to shared_retirement_backend';
end$$;
-- Exact local owner capabilities, no new LOGIN, membership, BYPASSRLS, Auth
-- UPDATE or Storage access. Existing canonical/metadata helper DEFINER owners
-- still require a separately approved restricted hosted ownership profile.
grant select,insert on maintenance_private.ouchi_requested_preparations to ouchi_shared_native_owner;
grant update(state,prepared_state,cancelled_at,cancelled_pid,cancelled_xid) on maintenance_private.ouchi_requested_preparations to ouchi_shared_native_owner;
create policy requested_provenance_owner on maintenance_private.ouchi_requested_preparations to ouchi_shared_native_owner using(true) with check(true);
grant select,insert,delete on maintenance_private.ouchi_requested_preparation_contexts to ouchi_shared_native_owner;
create policy requested_context_owner on maintenance_private.ouchi_requested_preparation_contexts to ouchi_shared_native_owner
 using(backend_pid=pg_backend_pid() and transaction_id=txid_current()) with check(backend_pid=pg_backend_pid() and transaction_id=txid_current());
grant insert,delete on maintenance_private.account_deletion_requests to ouchi_shared_native_owner;
create policy requested_native_insert on maintenance_private.account_deletion_requests for insert to ouchi_shared_native_owner
 with check(id=(maintenance_private.requested_provenance_context()->>'native')::uuid and user_id=(maintenance_private.requested_provenance_context()->>'actor')::uuid);
create policy requested_native_delete on maintenance_private.account_deletion_requests for delete to ouchi_shared_native_owner
 using(id=(maintenance_private.requested_provenance_context()->>'native')::uuid and user_id=(maintenance_private.requested_provenance_context()->>'actor')::uuid);
create policy requested_native_update on maintenance_private.account_deletion_requests for update to ouchi_shared_native_owner
 using(id=(maintenance_private.requested_provenance_context()->>'native')::uuid) with check(id=(maintenance_private.requested_provenance_context()->>'native')::uuid);
grant update(enabled) on maintenance_private.account_access,maintenance_private.app_epochs to ouchi_shared_native_owner;
create policy requested_access_update on maintenance_private.account_access for update to ouchi_shared_native_owner
 using(user_id=(maintenance_private.requested_provenance_context()->>'actor')::uuid) with check(user_id=(maintenance_private.requested_provenance_context()->>'actor')::uuid);
create policy requested_epoch_update on maintenance_private.app_epochs for update to ouchi_shared_native_owner
 using(user_id=(maintenance_private.requested_provenance_context()->>'actor')::uuid and epoch_id=(maintenance_private.requested_provenance_context()->>'epoch')::uuid)
 with check(user_id=(maintenance_private.requested_provenance_context()->>'actor')::uuid and epoch_id=(maintenance_private.requested_provenance_context()->>'epoch')::uuid);
grant select,insert,delete on maintenance_private.private_writer_routes to ouchi_shared_native_owner;
create policy requested_route_owner on maintenance_private.private_writer_routes to ouchi_shared_native_owner
 using(kind='deletion-request' and object_id=(maintenance_private.requested_provenance_context()->>'native')::uuid)
 with check(kind='deletion-request' and object_id=(maintenance_private.requested_provenance_context()->>'native')::uuid and principal=(maintenance_private.requested_provenance_context()->>'actor')::uuid);
grant insert,delete on maintenance_private.household_stop_bindings to ouchi_shared_native_owner;
create policy requested_binding_owner on maintenance_private.household_stop_bindings to ouchi_shared_native_owner
 using(user_id=(maintenance_private.requested_provenance_context()->>'actor')::uuid)
 with check(user_id=(maintenance_private.requested_provenance_context()->>'actor')::uuid and scope=maintenance_private.requested_provenance_context()->'scope');
-- Updating only the new binding state is separately checked by exact SQL.
grant update(state) on maintenance_private.household_stop_bindings to ouchi_shared_native_owner;
grant select,insert,delete on maintenance_private.household_principal_fences to ouchi_shared_native_owner;
grant update(stopped) on maintenance_private.household_principal_fences to ouchi_shared_native_owner;
create policy requested_fence_owner on maintenance_private.household_principal_fences to ouchi_shared_native_owner
 using(user_id=(maintenance_private.requested_provenance_context()->>'actor')::uuid) with check(user_id=(maintenance_private.requested_provenance_context()->>'actor')::uuid);
grant delete on maintenance_private.account_deletion_objects to ouchi_shared_native_owner;
create policy requested_inventory_delete on maintenance_private.account_deletion_objects for delete to ouchi_shared_native_owner
 using(request_id=(maintenance_private.requested_provenance_context()->>'native')::uuid);
do $$declare signature text;begin
 foreach signature in array array[
 'maintenance_private.requested_catalog_digest()',
 'maintenance_private.requested_actor_observation(uuid,uuid)',
 'maintenance_private.requested_scope_is_pristine(uuid,uuid,uuid,uuid)',
 'maintenance_private.requested_native_children_are_empty(uuid)',
 'maintenance_private.requested_provenance_context()',
 'maintenance_private.requested_prepared_observation(uuid)',
 'maintenance_private.lock_requested_preparation(uuid,jsonb,text)',
 'maintenance_private.ouchi_owner_only_frame(uuid,uuid,jsonb,uuid)',
 'public.capture_maintenance_deletion_objects(uuid,uuid,uuid,uuid)'
 ] loop execute format('grant execute on function %s to ouchi_shared_native_owner',signature);end loop;
end$$;
-- Canonical capture parses INSERT..SELECT even for the strictly empty-file
-- scope. INSERT privilege is required syntactically, but RLS denies EVERY row;
-- the protocol never admits a physical/object inventory entry in this version.
grant insert on maintenance_private.account_deletion_objects to ouchi_shared_native_owner;
create policy requested_empty_inventory_insert on maintenance_private.account_deletion_objects for insert to ouchi_shared_native_owner with check(false);
-- Canonical capture's ownership predicate reads only product/home linkage.
grant select(id,"homeId") on public.products to ouchi_shared_native_owner;
create policy requested_product_link_select on public.products for select to ouchi_shared_native_owner using(true);
-- The erasure-only owner profile deliberately lacked this preparation column.
-- RLS + the exact provenance OLD/NEW guard still constrain this one update.
grant update(inventory_captured) on maintenance_private.account_deletion_requests to ouchi_shared_native_owner;

alter table maintenance_private.ouchi_requested_preparations enable always trigger exact_requested_preparation_record;
alter table maintenance_private.ouchi_requested_preparations enable always trigger requested_preparation_commit;
