-- Review-only EMPTY-FILE family native-running/write-stop preparation.
-- Canonical capture/owned-family predicate unchanged: inventory_captured=false.
create table maintenance_private.family_native_preparations(
 generation_id uuid primary key references maintenance_private.family_preparation_generations(generation_id),
 before_owner jsonb not null,after_state jsonb,state text not null check(state in('capturing','prepared')),
 backend_pid integer not null,transaction_id bigint not null);
create table maintenance_private.family_native_preparation_cancellations(
 generation_id uuid primary key references maintenance_private.family_native_preparations(generation_id),
 backend_pid integer not null,transaction_id bigint not null);
create table maintenance_private.family_native_preparation_contexts(
 backend_pid integer not null,transaction_id bigint not null,generation_id uuid not null references maintenance_private.family_native_preparations(generation_id),
 operation text not null check(operation in('prepare','cancel')),primary key(backend_pid,transaction_id));
do $$declare t text;begin foreach t in array array['family_native_preparations','family_native_preparation_cancellations','family_native_preparation_contexts'] loop
 execute format('alter table maintenance_private.%I enable row level security',t);
 execute format('revoke all on maintenance_private.%I from public,anon,authenticated,service_role,shared_retirement_backend',t);
end loop;end$$;
create function maintenance_private.guard_family_native_preimage() returns trigger
language plpgsql set search_path='' as $$begin
 if tg_op='UPDATE' and old.state='capturing' and new.state='prepared' and old.after_state is null and new.after_state is not null
 and (to_jsonb(old)-array['state','after_state'])=(to_jsonb(new)-array['state','after_state'])
 and new.backend_pid=pg_backend_pid() and new.transaction_id=txid_current() then return new;end if;
 raise exception 'Immutable family native preimage';end$$;
create trigger immutable_family_native_preimage before update or delete on maintenance_private.family_native_preparations for each row execute function maintenance_private.guard_family_native_preimage();
alter table maintenance_private.family_native_preparations enable always trigger immutable_family_native_preimage;
create trigger immutable_family_native_cancel before update or delete on maintenance_private.family_native_preparation_cancellations for each row execute function maintenance_private.refuse_family_attachment_journal_change();
alter table maintenance_private.family_native_preparation_cancellations enable always trigger immutable_family_native_cancel;
create function maintenance_private.current_family_native_context() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('operation',c.operation,'actor',g.actor,'epoch',g.epoch,'native',g.native_request,'lease',g.native_lease,'before',p.before_owner,'after',p.after_state)
 from maintenance_private.family_native_preparation_contexts c join maintenance_private.family_native_preparations p using(generation_id)
 join maintenance_private.family_preparation_generations g using(generation_id) join private.kb_shared_deletion_journal j on j.request_id=g.root_request
 where session_user::text='shared_retirement_backend' and current_setting('role')='none' and c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current()
 and j.scope=g.scope-'leaseToken' and j.user_id=g.actor and j.receipts='{}' and j.lease_token is null and j.lease_until is null
 and ((c.operation='prepare' and j.status='requested' and p.state='capturing') or(c.operation='cancel' and j.status='cancelled' and p.state='prepared' and not exists(select 1 from maintenance_private.family_native_preparation_cancellations where generation_id=g.generation_id)));
$$;
-- Preserve the exact pre-existing owner-zero / native-stage dispatcher body.
create function maintenance_private.pre_family_native_write(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$begin
 if maintenance_private.requested_provenance_context() is not null then return maintenance_private.requested_provenance_write(sch,tbl,op,prior,next_value);end if;
 return maintenance_private.legacy_native_write_for_requested_provenance(sch,tbl,op,prior,next_value);
end$$;
do $$begin if (select prosrc from pg_proc where oid='maintenance_private.pre_family_native_write(text,text,text,jsonb,jsonb)'::regprocedure)
 is distinct from (select prosrc from pg_proc where oid='maintenance_private.allowed_shared_native_stage_write(text,text,text,jsonb,jsonb)'::regprocedure)
 then raise exception 'Frozen writer dispatcher drift';end if;end$$;
create function maintenance_private.allowed_family_native_write(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare c jsonb:=maintenance_private.current_family_native_context();prep boolean;u text;e text;n text;
begin
 if c is null then return false;end if;
 prep:=c->>'operation'='prepare';u:=c->>'actor';e:=c->>'epoch';n:=c->>'native';
 if sch='maintenance_private' and tbl='account_deletion_requests' then
  if prep and op='INSERT' and next_value->>'id'=n and next_value->>'user_id'=u and next_value->>'app_epoch_id'=e and next_value->>'state'='running'
   and next_value->>'lease_token'=c->>'lease' and next_value->>'attempts'='1' and next_value->>'inventory_captured'='false' and next_value->>'records_erased'='false'
   and next_value->>'identity_erased'='false' and next_value->>'receipt_sessions_captured'='false' then return true;end if;
  if not prep and op='DELETE' and prior=c->'after'->'native' then return true;end if;
 elsif sch='maintenance_private' and tbl in('account_access','app_epochs') and op='UPDATE' and prior->>'user_id'=u and (tbl='account_access' or prior->>'epoch_id'=e)
 and (prior-'enabled')=(next_value-'enabled') and next_value->'enabled'=(case when prep then 'false'::jsonb else c->'before'->(case when tbl='account_access' then 'access' else 'epoch' end)->'enabled' end) then return true;
 end if;
 raise exception 'Exact family preparation write required';
end$$;
create or replace function maintenance_private.allowed_shared_native_stage_write(sch text,tbl text,op text,prior jsonb,next_value jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$begin
 if maintenance_private.current_family_native_context() is not null then return maintenance_private.allowed_family_native_write(sch,tbl,op,prior,next_value);end if;
 return maintenance_private.pre_family_native_write(sch,tbl,op,prior,next_value);
end$$;
create function maintenance_private.family_native_empty_scope(u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from maintenance_private.household_attachments f join public.homes h on h.id=f.home_id where h.owner_id=u)
 and not exists(select 1 from maintenance_private.attachment_write_attempts where uploader_id=u or owner_id=u)
 and not exists(select 1 from maintenance_private.account_closure_reviews where user_id=u)
 and not exists(select 1 from maintenance_private.closure_coverage_plans where user_id=u)
 and not exists(select 1 from maintenance_private.reviewed_retirements where user_id=u);
$$;
create function maintenance_private.family_native_observation(gid uuid) returns jsonb
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
create function maintenance_private.prepare_family_native_generation(r uuid,s jsonb,gid uuid,n uuid,targets jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare g maintenance_private.family_preparation_generations;p maintenance_private.family_native_preparations;
begin
 perform maintenance_private.lock_family_generation(s,'requested');
 select * into p from maintenance_private.family_native_preparations where generation_id=gid;
 if found then return exists(select 1 from maintenance_private.family_native_generation_state(r,s,gid,n,targets,'prepared') where ok);end if;
 if maintenance_private.reserve_family_preparation_generation(r,s,gid,n,targets) is distinct from true then raise exception 'Exact family reservation required';end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid for share;
 if g.root_request<>r or g.scope<>s or g.native_lease<>n or g.targets<>targets or g.catalog_digest<>maintenance_private.requested_catalog_digest()
 or g.preimage is distinct from maintenance_private.requested_actor_observation(g.actor,g.epoch) or g.roster is distinct from maintenance_private.family_generation_roster(g.actor)
 or not maintenance_private.family_native_empty_scope(g.actor) or not maintenance_private.requested_native_children_are_empty(g.native_request) then raise exception 'Actual unchanged empty-file family preimage required';end if;
 insert into maintenance_private.family_native_preparations values(gid,maintenance_private.requested_actor_observation(g.actor,g.epoch),null,'capturing',pg_backend_pid(),txid_current());
 insert into maintenance_private.family_native_preparation_contexts values(pg_backend_pid(),txid_current(),gid,'prepare');
 insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts) values(g.native_request,g.actor,g.epoch,'running',n,clock_timestamp()+interval '2 minutes',1);
 insert into maintenance_private.private_writer_routes values('deletion-request',g.native_request,g.actor);
 update maintenance_private.account_access set enabled=false where user_id=g.actor;
 update maintenance_private.app_epochs set enabled=false where user_id=g.actor and epoch_id=g.epoch;
 insert into maintenance_private.household_stop_bindings values(g.actor,s,n,clock_timestamp()+interval '2 minutes','requested');
 perform maintenance_private.freeze_household_scope(s,n);
 -- NO canonical capture call or inventory_captured mutation before handoff.
 update maintenance_private.family_native_preparations set after_state=maintenance_private.family_native_observation(gid),state='prepared' where generation_id=gid;
 delete from maintenance_private.family_native_preparation_contexts where backend_pid=pg_backend_pid() and transaction_id=txid_current();return true;
end$$;
create function maintenance_private.cancel_family_native_generation(r uuid,s jsonb,gid uuid,n uuid,targets jsonb) returns boolean
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
create function maintenance_private.family_native_generation_state(r uuid,s jsonb,gid uuid,n uuid,targets jsonb,expected text)
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
  or not maintenance_private.family_native_empty_scope(g.actor) or not maintenance_private.requested_native_children_are_empty(g.native_request) or exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=gid)
  or exists(select 1 from maintenance_private.family_preparation_generation_homes h left join maintenance_private.current_family_preparation_generations x using(home_id) where h.generation_id=gid and x.generation_id is distinct from gid) then return;end if;
 elsif expected='cancelled' then
  if j.status<>'cancelled' or c.generation_id is null or exists(select 1 from maintenance_private.account_deletion_requests where id=g.native_request)
  or exists(select 1 from maintenance_private.current_family_preparation_generations where generation_id=gid)
  or not exists(select 1 from maintenance_private.family_preparation_generation_cancellations where generation_id=gid) then return;end if;
  if c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current() and (g.catalog_digest<>maintenance_private.requested_catalog_digest() or p.before_owner is distinct from maintenance_private.requested_actor_observation(g.actor,g.epoch) or g.roster is distinct from maintenance_private.family_generation_roster(g.actor) or exists(select 1 from maintenance_private.family_preparation_dispatches where generation_id=gid)) then return;end if;
 else return;end if;
 return query select true,pg_backend_pid(),txid_current()::text;
end$$;
-- Extend only generation-reservation COMMIT validation; old reserved/cancelled
-- body stays verbatim below the exact new native-preparation branch.
create or replace function maintenance_private.check_family_generation_commit() returns trigger
language plpgsql security definer set search_path='' as $$declare p maintenance_private.family_preparation_generations;wanted text;begin
 if exists(select 1 from maintenance_private.family_native_preparations where generation_id=new.generation_id) then
  select * into p from maintenance_private.family_preparation_generations where generation_id=new.generation_id;
  wanted:=case when exists(select 1 from maintenance_private.family_native_preparation_cancellations where generation_id=p.generation_id) then 'cancelled' else 'prepared' end;
  if not exists(select 1 from maintenance_private.family_native_generation_state(p.root_request,p.scope,p.generation_id,p.native_lease,p.targets,wanted) where ok) then raise exception 'Exact family native COMMIT required';end if;return null;
 end if;
 select * into p from maintenance_private.family_preparation_generations where generation_id=new.generation_id;
 wanted:=case when exists(select 1 from maintenance_private.family_preparation_generation_cancellations where generation_id=p.generation_id) then 'cancelled' else 'reserved' end;
 if not exists(select 1 from maintenance_private.family_preparation_generation_state(p.root_request,p.scope,p.generation_id,p.native_lease,p.targets,wanted) where ok) then raise exception 'Exact family generation COMMIT required';end if;return null;
end$$;
create constraint trigger exact_family_native_commit after insert or update on maintenance_private.family_native_preparations deferrable initially deferred for each row execute function maintenance_private.check_family_generation_commit();
create constraint trigger exact_family_native_cancel_commit after insert on maintenance_private.family_native_preparation_cancellations deferrable initially deferred for each row execute function maintenance_private.check_family_generation_commit();
alter table maintenance_private.family_native_preparations enable always trigger exact_family_native_commit;
alter table maintenance_private.family_native_preparation_cancellations enable always trigger exact_family_native_cancel_commit;
create function maintenance_private.refuse_cancelled_family_native_reuse() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from maintenance_private.family_preparation_generations g join maintenance_private.family_native_preparation_cancellations c using(generation_id) where g.native_request=new.id) then raise exception 'Cancelled family native identity';end if;return new;
end$$;
create trigger cancelled_family_native_identity before insert or update of id on maintenance_private.account_deletion_requests for each row execute function maintenance_private.refuse_cancelled_family_native_reuse();
alter table maintenance_private.account_deletion_requests enable always trigger cancelled_family_native_identity;
-- Fixture DDL ownership only; hosted owner/ACL profile deliberately unapproved.
do $$declare p record;begin for p in select oid::regprocedure f from pg_proc where pronamespace='maintenance_private'::regnamespace and proname in('guard_family_native_preimage','current_family_native_context','pre_family_native_write','allowed_family_native_write','family_native_observation','family_native_empty_scope','prepare_family_native_generation','cancel_family_native_generation','family_native_generation_state','refuse_cancelled_family_native_reuse') loop execute format('revoke all on function %s from public,anon,authenticated,service_role,shared_retirement_backend',p.f);end loop;end$$;
grant execute on function maintenance_private.prepare_family_native_generation(uuid,jsonb,uuid,uuid,jsonb),maintenance_private.cancel_family_native_generation(uuid,jsonb,uuid,uuid,jsonb),maintenance_private.family_native_generation_state(uuid,jsonb,uuid,uuid,jsonb,text) to shared_retirement_backend;
