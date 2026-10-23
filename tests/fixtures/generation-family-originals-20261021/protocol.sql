-- Local empty-file family generation originals/claim only; NO handoff/erase.
create table maintenance_private.generation_family_originals(
 generation_id uuid not null references maintenance_private.family_native_preparations(generation_id),
 home_id uuid not null,actor_id uuid not null,payload jsonb not null,signature text not null check(signature~'^[a-f0-9]{64}$'),
 timebox_seconds bigint,inactivity_seconds bigint,primary key(generation_id,home_id,actor_id),
 foreign key(generation_id,home_id) references maintenance_private.family_preparation_generation_homes(generation_id,home_id));
alter table maintenance_private.generation_family_originals enable row level security;
revoke all on maintenance_private.generation_family_originals from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend;
create trigger immutable_generation_family_original before update or delete on maintenance_private.generation_family_originals for each row execute function maintenance_private.refuse_family_attachment_journal_change();
alter table maintenance_private.generation_family_originals enable always trigger immutable_generation_family_original;
create function maintenance_private.generation_family_frame(gid uuid) returns table(status text,backend_pid integer,transaction_id text)
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
create function maintenance_private.generation_family_auth(
 p_request uuid,p_home uuid,p_user uuid,p_session uuid,p_native_lease uuid,
 p_aal text,p_totp_at bigint,p_timebox bigint,p_inactivity bigint,p_generation uuid
) returns table(auth_state_digest text,authenticated_at bigint,checked_at bigint,epoch_id uuid)
language plpgsql volatile security definer set search_path='' as $$
declare h record;g maintenance_private.family_preparation_generations;b maintenance_private.household_stop_bindings;n maintenance_private.account_deletion_requests;j private.kb_shared_deletion_journal;u auth.users;s auth.sessions;at_ms bigint;state jsonb;total integer;actual_epoch uuid;
begin
 if p_aal is distinct from 'aal2' or p_totp_at is null or p_user is null or p_session is null
 or(p_timebox is not null and(p_timebox<1 or p_timebox>315360000)) or(p_inactivity is not null and(p_inactivity<1 or p_inactivity>315360000)) then return;end if;
 perform 1 from maintenance_private.generation_family_frame(p_generation);if not found then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=p_generation;
 if g.root_request<>p_request or g.native_lease<>p_native_lease then return;end if;
 select g.actor owner_id,x.successor_id,x.home_id,jsonb_build_object('generationID',g.generation_id,'targets',g.targets,'preimage',g.preimage,'homeID',x.home_id,'successorID',x.successor_id,'nativeLease',g.native_lease) plan into h from maintenance_private.family_preparation_generation_homes x where x.generation_id=p_generation and x.home_id=p_home;
 if not found or p_user not in(h.owner_id,h.successor_id) then return;end if;
 select ae.epoch_id into actual_epoch from maintenance_private.app_epochs ae where ae.user_id=p_user;
 if actual_epoch is null or not exists(select 1 from maintenance_private.app_session_epochs enrolled where enrolled.user_id=p_user and enrolled.epoch_id=actual_epoch and enrolled.session_id=p_session)
 or not exists(select 1 from jsonb_array_elements(g.roster) home cross join lateral jsonb_array_elements(home->'members') member where home->>'homeID'=p_home::text and member->>'actorID'=p_user::text and member->>'epochID'=actual_epoch::text)
 then return;end if;
 select * into b from maintenance_private.household_stop_bindings where user_id=g.actor;
 select * into n from maintenance_private.account_deletion_requests where id=g.native_request;
 select * into j from private.kb_shared_deletion_journal where request_id=g.root_request;
 if (select count(distinct c.conrelid) from pg_catalog.pg_constraint c
  join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  join pg_catalog.pg_attribute t on t.attrelid=c.confrelid and t.attnum=any(c.confkey)
  where c.contype='f' and c.convalidated and not c.condeferrable and c.confrelid='auth.users'::regclass
  and a.attname='user_id' and t.attname='id' and cardinality(c.conkey)=1 and cardinality(c.confkey)=1
  and c.conrelid in('auth.sessions'::regclass,'auth.mfa_factors'::regclass))<>2
 or not exists(select 1 from pg_catalog.pg_constraint c
  join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  join pg_catalog.pg_attribute t on t.attrelid=c.confrelid and t.attnum=any(c.confkey)
  where c.contype='f' and c.convalidated and not c.condeferrable and c.conrelid='auth.mfa_amr_claims'::regclass
  and c.confrelid='auth.sessions'::regclass and a.attname='session_id' and t.attname='id'
  and cardinality(c.conkey)=1 and cardinality(c.confkey)=1) then return;end if;
 perform id from auth.users where id in(h.owner_id,h.successor_id) order by id for update;
 get diagnostics total=row_count;if total<>2 then return;end if;
 select * into u from auth.users where id=p_user;
 select * into s from auth.sessions where id=p_session and user_id=p_user for update;
 if not found then return;end if;
 perform id from auth.mfa_factors where user_id=p_user order by id for update;
 perform session_id from auth.mfa_amr_claims where session_id=p_session order by authentication_method for update;
 at_ms=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 if u.is_anonymous is distinct from false or u.deleted_at is not null
 or (u.banned_until is not null and u.banned_until>clock_timestamp()) or s.aal::text is distinct from 'aal2'
 or s.created_at is null or s.created_at>clock_timestamp()
 or (s.refreshed_at is not null and s.refreshed_at at time zone 'UTC'>clock_timestamp())
 or (s.not_after is not null and s.not_after<=clock_timestamp())
 or (p_timebox is not null and s.created_at+(p_timebox*interval '1 second')<=clock_timestamp())
 or (p_inactivity is not null and (s.refreshed_at is null or s.refreshed_at at time zone 'UTC'+(p_inactivity*interval '1 second')<=clock_timestamp()))
 or p_totp_at<=0 or p_totp_at>at_ms or at_ms-p_totp_at>600000
 or not exists(select 1 from auth.mfa_factors f where f.id=s.factor_id and f.user_id=p_user and f.status::text='verified' and f.factor_type::text='totp')
 or not exists(select 1 from auth.mfa_amr_claims a where a.session_id=p_session and a.authentication_method='totp'
  and floor(extract(epoch from a.updated_at))*1000=p_totp_at)
 or b.lease_until<=clock_timestamp() or (j.status='processing' and j.lease_until<=clock_timestamp()) or n.lease_until<=clock_timestamp() then return;end if;
 state=jsonb_build_object('domain','OuchiMaintenance/scoped-shared-consent-auth/v1','scope',b.scope,'plan',h.plan,
  'user',jsonb_build_object('id',u.id,'password',u.encrypted_password,'email',u.email,'emailConfirmedAt',u.email_confirmed_at,'bannedUntil',u.banned_until,'deletedAt',u.deleted_at),
  'session',jsonb_build_object('id',s.id,'userID',s.user_id,'aal',s.aal,'factorID',s.factor_id,'createdAt',s.created_at,'notAfter',s.not_after),
  'factors',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from auth.mfa_factors f where f.user_id=p_user),'[]'::jsonb),
  'amr',coalesce((select jsonb_agg(to_jsonb(a) order by a.authentication_method) from auth.mfa_amr_claims a where a.session_id=p_session),'[]'::jsonb));
 return query select encode(sha256(convert_to(state::text,'UTF8')),'hex'),p_totp_at,floor(extract(epoch from clock_timestamp())*1000)::bigint,actual_epoch;
end $$;
create function maintenance_private.record_generation_family_original(gid uuid,h uuid,u uuid,sid uuid,n uuid,payload jsonb,signature text,timebox_seconds bigint,inactivity_seconds bigint) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare g maintenance_private.family_preparation_generations;f record;a record;prior maintenance_private.generation_family_originals;e uuid;
begin
 if session_user::text<>'ouchi_shared_consent_backend' then return false;end if;
 select * into f from maintenance_private.generation_family_frame(gid);if not found or f.status<>'requested' then return false;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 select epoch_id into e from maintenance_private.app_epochs where user_id=u;
 if jsonb_typeof(payload) is distinct from 'object' or(select count(*) from jsonb_object_keys(payload))<>12 or not(payload ?& array['domain','requestID','generationID','homeID','userID','epochID','sessionID','aal','authenticatedAt','authStateDigest','proofDomain','expiresAt'])
 or jsonb_typeof(payload->'authenticatedAt') is distinct from 'number' or jsonb_typeof(payload->'expiresAt') is distinct from 'number'
 or payload->>'domain' is distinct from 'OuchiMaintenance/family-generation-original/v1'
 or payload->>'requestID' is distinct from g.root_request::text or payload->>'generationID' is distinct from gid::text or payload->>'homeID' is distinct from h::text or payload->>'userID' is distinct from u::text
 or payload->>'sessionID' is distinct from sid::text or payload->>'epochID' is distinct from e::text or payload->>'aal' is distinct from 'aal2' or signature is null or signature!~'^[a-f0-9]{64}$'
 or payload->>'proofDomain' is distinct from 'OuchiMaintenance/scoped-shared-consent-auth/v1' then return false;end if;
 select * into a from maintenance_private.generation_family_auth(g.root_request,h,u,sid,n,'aal2',(payload->>'authenticatedAt')::bigint,timebox_seconds,inactivity_seconds,gid);
 if not found or a.epoch_id is distinct from e or a.auth_state_digest is distinct from payload->>'authStateDigest' or (payload->>'expiresAt')::bigint<>(payload->>'authenticatedAt')::bigint+600000 or (payload->>'expiresAt')::bigint<=a.checked_at then return false;end if;
 select * into prior from maintenance_private.generation_family_originals where generation_id=gid and home_id=h and actor_id=u;
 if found then return prior.payload=payload and prior.signature=signature and prior.timebox_seconds is not distinct from timebox_seconds and prior.inactivity_seconds is not distinct from inactivity_seconds;end if;
 insert into maintenance_private.generation_family_originals values(gid,h,u,payload,signature,timebox_seconds,inactivity_seconds);return true;
end$$;
create function maintenance_private.read_generation_family_original(gid uuid,h uuid,u uuid,n uuid,timebox_seconds bigint,inactivity_seconds bigint) returns table(payload jsonb,signature text)
language plpgsql volatile security definer set search_path='' as $$
declare g maintenance_private.family_preparation_generations;p maintenance_private.generation_family_originals;a record;
begin
 perform 1 from maintenance_private.generation_family_frame(gid);if not found then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 select * into p from maintenance_private.generation_family_originals where generation_id=gid and home_id=h and actor_id=u;
 if not found or g.native_lease<>n or p.timebox_seconds is distinct from timebox_seconds or p.inactivity_seconds is distinct from inactivity_seconds then return;end if;
 select * into a from maintenance_private.generation_family_auth(g.root_request,h,u,(p.payload->>'sessionID')::uuid,n,'aal2',(p.payload->>'authenticatedAt')::bigint,timebox_seconds,inactivity_seconds,gid);
 if not found or a.epoch_id::text is distinct from p.payload->>'epochID' or a.auth_state_digest is distinct from p.payload->>'authStateDigest' or (p.payload->>'expiresAt')::bigint<=a.checked_at then return;end if;
 return query select p.payload,p.signature;
end$$;
-- Exact complete original-set SQL check complements independent server HMAC
-- verification; no client JSON approval or renew-through-processing route.
create function maintenance_private.generation_family_claim_frame(gid uuid) returns table(status text,backend_pid integer,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$
declare f record;g maintenance_private.family_preparation_generations;home record;actor uuid;p maintenance_private.generation_family_originals;
begin
 if session_user::text<>'shared_retirement_backend' then return;end if;
 select * into f from maintenance_private.generation_family_frame(gid);if not found then return;end if;
 select * into g from maintenance_private.family_preparation_generations where generation_id=gid;
 if(select count(*) from maintenance_private.generation_family_originals where generation_id=gid)<>(select 2*count(*) from maintenance_private.family_preparation_generation_homes where generation_id=gid) then return;end if;
 for home in select * from maintenance_private.family_preparation_generation_homes where generation_id=gid order by home_id loop
  foreach actor in array array[g.actor,home.successor_id] loop
   select * into p from maintenance_private.generation_family_originals where generation_id=gid and home_id=home.home_id and actor_id=actor;
   if not found then return;end if;
   perform 1 from maintenance_private.read_generation_family_original(gid,home.home_id,actor,g.native_lease,p.timebox_seconds,p.inactivity_seconds);if not found then return;end if;
  end loop;
 end loop;
 return query select f.status,f.backend_pid,f.transaction_id;
end$$;
-- Keep the old family native/reservation deferred checker verbatim as fallback.
-- Processing can COMMIT only with the complete still-current issuer originals.
create or replace function maintenance_private.check_family_generation_commit() returns trigger
language plpgsql security definer set search_path='' as $$declare p maintenance_private.family_preparation_generations;wanted text;begin
 if exists(select 1 from maintenance_private.family_native_preparations x join maintenance_private.family_preparation_generations g using(generation_id) join private.kb_shared_deletion_journal j on j.request_id=g.root_request where x.generation_id=new.generation_id and j.status='processing') then
  if not exists(select 1 from maintenance_private.generation_family_claim_frame(new.generation_id) where status='processing') then raise exception 'Exact generation originals required for claim COMMIT';end if;return null;
 end if;
 if exists(select 1 from maintenance_private.family_native_preparations where generation_id=new.generation_id) then
  select * into p from maintenance_private.family_preparation_generations where generation_id=new.generation_id;
  wanted:=case when exists(select 1 from maintenance_private.family_native_preparation_cancellations where generation_id=p.generation_id) then 'cancelled' else 'prepared' end;
  if not exists(select 1 from maintenance_private.family_native_generation_state(p.root_request,p.scope,p.generation_id,p.native_lease,p.targets,wanted) where ok) then raise exception 'Exact family native COMMIT required';end if;return null;
 end if;
 select * into p from maintenance_private.family_preparation_generations where generation_id=new.generation_id;
 wanted:=case when exists(select 1 from maintenance_private.family_preparation_generation_cancellations where generation_id=p.generation_id) then 'cancelled' else 'reserved' end;
 if not exists(select 1 from maintenance_private.family_preparation_generation_state(p.root_request,p.scope,p.generation_id,p.native_lease,p.targets,wanted) where ok) then raise exception 'Exact family generation COMMIT required';end if;return null;
end$$;
-- Existing native-preparation deferred event is not fired by root UPDATE, so
-- independently enforce the exact root claim transition's own final COMMIT.
create function maintenance_private.check_generation_family_claim_commit() returns trigger
language plpgsql security definer set search_path='' as $$declare gid uuid;begin
 for gid in select g.generation_id from maintenance_private.family_preparation_generations g join maintenance_private.family_native_preparations p using(generation_id) where g.root_request=new.request_id loop
  if not exists(select 1 from maintenance_private.generation_family_claim_frame(gid) where status='processing') then raise exception 'Current family original set required at actual root claim COMMIT';end if;
 end loop;return null;
end$$;
create constraint trigger exact_generation_family_claim_commit after update on private.kb_shared_deletion_journal deferrable initially deferred for each row when(old.status='requested' and new.status='processing') execute function maintenance_private.check_generation_family_claim_commit();
alter table private.kb_shared_deletion_journal enable always trigger exact_generation_family_claim_commit;
do $$declare p record;begin for p in select oid::regprocedure f from pg_proc where pronamespace='maintenance_private'::regnamespace and proname in('generation_family_frame','generation_family_auth','record_generation_family_original','read_generation_family_original','generation_family_claim_frame','check_generation_family_claim_commit') loop execute format('revoke all on function %s from public,anon,authenticated,service_role,shared_retirement_backend,ouchi_shared_consent_backend',p.f);end loop;end$$;
grant execute on function maintenance_private.generation_family_frame(uuid),maintenance_private.generation_family_auth(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,uuid),maintenance_private.read_generation_family_original(uuid,uuid,uuid,uuid,bigint,bigint) to shared_retirement_backend,ouchi_shared_consent_backend;
grant execute on function maintenance_private.record_generation_family_original(uuid,uuid,uuid,uuid,uuid,jsonb,text,bigint,bigint) to ouchi_shared_consent_backend;
grant execute on function maintenance_private.generation_family_claim_frame(uuid) to shared_retirement_backend;

create function maintenance_private.generation_family_original_frame(gid uuid,s jsonb,n uuid,expected_targets jsonb)
returns table(status text,backend_pid integer,transaction_id text) language plpgsql volatile security definer set search_path='' as $$begin
 if not exists(select 1 from maintenance_private.family_preparation_generations g where g.generation_id=gid and g.scope=s and g.native_lease=n and g.targets=expected_targets) then return;end if;
 return query select * from maintenance_private.generation_family_frame(gid);
end$$;
create function maintenance_private.generation_family_bound_claim_frame(gid uuid,s jsonb,n uuid,expected_targets jsonb)
returns table(status text,backend_pid integer,transaction_id text) language plpgsql volatile security definer set search_path='' as $$begin
 if not exists(select 1 from maintenance_private.family_preparation_generations g where g.generation_id=gid and g.scope=s and g.native_lease=n and g.targets=expected_targets) then return;end if;
 return query select * from maintenance_private.generation_family_claim_frame(gid);
end$$;
revoke all on function maintenance_private.generation_family_original_frame(uuid,jsonb,uuid,jsonb),maintenance_private.generation_family_bound_claim_frame(uuid,jsonb,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function maintenance_private.generation_family_original_frame(uuid,jsonb,uuid,jsonb) to ouchi_shared_consent_backend,shared_retirement_backend;
grant execute on function maintenance_private.generation_family_bound_claim_frame(uuid,jsonb,uuid,jsonb) to shared_retirement_backend;
