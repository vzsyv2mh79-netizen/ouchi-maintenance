-- Undeployed PREPARED-only issuer/claim contract. No role, grants or migration.
-- Existing processing-only identity/current/mutation functions are unchanged.
-- Issuance is requested-only; original immutable custody is shared with normal
-- worker readers. A claim COMMIT can reread the same original Auth state after
-- the exact frozen planned lease formally becomes the current processing lease.
-- The authentication digest intentionally excludes the root lifecycle status;
-- original scope/plan/session/Auth/factors/AMR remain identical across claim.
-- No boolean/caller flag bypass, role switch, raw Auth output or Auth mutation.
create function maintenance_private.prepared_scoped_shared_consent_auth(
 p_request uuid,p_home uuid,p_user uuid,p_session uuid,p_native_lease uuid,
 p_aal text,p_totp_at bigint,p_timebox bigint,p_inactivity bigint
) returns table(auth_state_digest text,authenticated_at bigint,checked_at bigint)
language plpgsql volatile security definer set search_path='' as $$
declare h maintenance_private.household_handoff_plans;
 b maintenance_private.household_stop_bindings;
 n maintenance_private.account_deletion_requests;
 j private.kb_shared_deletion_journal;
 u auth.users;s auth.sessions;at_ms bigint;state jsonb;total integer;
begin
 if session_user::text<>'ouchi_shared_consent_backend'
 or coalesce(current_setting('role',true),'none') not in ('none','ouchi_shared_consent_backend')
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and r.rolcanlogin
  and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication
  and (r.rolvaliduntil is null or r.rolvaliduntil>clock_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid))
 or p_request is null or p_home is null or p_user is null or p_session is null or p_native_lease is null
 or p_aal is distinct from 'aal2' or p_totp_at is null
 or (p_timebox is not null and (p_timebox<1 or p_timebox>315360000))
 or (p_inactivity is not null and (p_inactivity<1 or p_inactivity>315360000)) then return;end if;
 -- Shared root first, then app plan/binding/request, then sorted Auth parents.
 select * into j from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found then return;end if;
 select * into h from maintenance_private.household_handoff_plans where home_id=p_home for update;
 if not found or h.owner_id=h.successor_id or p_user not in(h.owner_id,h.successor_id) then return;end if;
 select * into b from maintenance_private.household_stop_bindings where user_id=h.owner_id for update;
 if b.user_id is null or j.request_id is null or j.user_id<>h.owner_id or not((j.status='requested' and j.lease_token is null and j.lease_until is null)
  or(j.status='processing' and j.lease_token::text=b.scope->>'leaseToken' and j.lease_until>clock_timestamp()))
 or j.scope is distinct from b.scope-'leaseToken' or h.scope is distinct from b.scope
 or b.native_lease is distinct from p_native_lease or b.state<>'processing' or b.lease_until<=clock_timestamp()
 or b.scope->>'protocolVersion' is distinct from '2' or b.scope->>'kind' is distinct from 'shared-account'
 or b.scope->>'requestID' is distinct from p_request::text or b.scope->>'userID' is distinct from h.owner_id::text
 or h.plan->>'protocolVersion' is distinct from '2' or h.plan->>'requestID' is distinct from p_request::text
 or h.plan->>'userID' is distinct from h.owner_id::text or h.plan->>'householdID' is distinct from p_home::text
 or h.plan->>'successorID' is distinct from h.successor_id::text
 or h.plan->>'inventoryDigest' is distinct from b.scope->>'inventoryDigest'
 or coalesce(h.plan->>'inventoryDigest','') !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(b.scope->'apps') is distinct from 'array'
 or (select count(*) from jsonb_array_elements(b.scope->'apps') a where a->>'app'='ouchi-maintenance'
  and a->>'requestID'=h.plan->>'appRequestID' and a->>'scopeID'=h.plan->>'appScopeID')<>1 then return;end if;
 select * into n from maintenance_private.account_deletion_requests where id=(h.plan->>'appRequestID')::uuid for update;
 if not found or n.user_id<>h.owner_id or n.app_epoch_id::text is distinct from h.plan->>'appScopeID'
 or n.state<>'running' or n.lease_token is distinct from p_native_lease or n.lease_until is null or n.lease_until<=clock_timestamp()
 or not exists(select 1 from maintenance_private.household_family_holds f where f.home_id=p_home and f.principal=h.owner_id and f.scope=b.scope) then return;end if;
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
 return query select encode(sha256(convert_to(state::text,'UTF8')),'hex'),p_totp_at,floor(extract(epoch from clock_timestamp())*1000)::bigint;
end $$;
revoke all on function maintenance_private.prepared_scoped_shared_consent_auth(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint) from public,anon,authenticated,service_role;

create function maintenance_private.record_prepared_scoped_consent(
 p_request uuid,p_home uuid,p_user uuid,p_session uuid,p_native_lease uuid,
 p_payload jsonb,p_signature text,p_timebox bigint,p_inactivity bigint
) returns boolean language plpgsql security definer set search_path='' as $$
declare current_auth record;h maintenance_private.household_handoff_plans;at_ms bigint;root private.kb_shared_deletion_journal;prior maintenance_private.scoped_consent_bindings;
begin
 if session_user::text<>'ouchi_shared_consent_backend' or jsonb_typeof(p_payload) is distinct from 'object'
 or p_payload->>'requestID' is distinct from p_request::text or p_payload->>'homeID' is distinct from p_home::text
 or p_payload->>'userID' is distinct from p_user::text or p_payload->>'sessionID' is distinct from p_session::text
 or p_payload->>'proofDomain' is distinct from 'OuchiMaintenance/scoped-shared-consent-auth/v1'
 or p_payload->>'aal' is distinct from 'aal2' or p_signature is null or p_signature !~ '^[a-f0-9]{64}$'
 or (select count(*) from jsonb_object_keys(p_payload))<>9 then return false;end if;
 select * into root from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found or root.status<>'requested' or root.lease_token is not null or root.lease_until is not null then return false;end if;
 select * into current_auth from maintenance_private.prepared_scoped_shared_consent_auth(
 p_request,p_home,p_user,p_session,p_native_lease,'aal2',(p_payload->>'authenticatedAt')::bigint,p_timebox,p_inactivity);
 if not found or current_auth.auth_state_digest is distinct from p_payload->>'authStateDigest' then return false;end if;
 at_ms=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 if (p_payload->>'expiresAt')::bigint<=at_ms
 or (p_payload->>'expiresAt')::bigint>current_auth.authenticated_at+600000 then return false;end if;
 select * into h from maintenance_private.household_handoff_plans where home_id=p_home for update;
 select * into prior from maintenance_private.scoped_consent_bindings where request_id=p_request and home_id=p_home and actor_id=p_user for update;
 if found then return prior.payload=p_payload and prior.signature=p_signature and prior.session_id=p_session
 and prior.auth_state_digest=current_auth.auth_state_digest and prior.authenticated_at=current_auth.authenticated_at
 and prior.original_scope=h.scope and prior.original_plan=h.plan;end if;
 insert into maintenance_private.scoped_consent_bindings values(p_request,p_home,p_user,p_session,
 current_auth.authenticated_at,current_auth.auth_state_digest,'OuchiMaintenance/scoped-shared-consent-auth/v1',
 p_payload,p_signature,(p_payload->>'expiresAt')::bigint,h.scope,h.plan,clock_timestamp());
 return true;
end$$;
revoke all on function maintenance_private.record_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid,jsonb,text,bigint,bigint) from public,anon,authenticated,service_role;


create function maintenance_private.read_prepared_scoped_consent(
 p_request uuid,p_home uuid,p_user uuid,p_root_lease uuid,p_native_lease uuid
) returns table(payload jsonb,signature text)
language plpgsql volatile security definer set search_path='' as $$
declare h maintenance_private.household_handoff_plans;b maintenance_private.household_stop_bindings;
 n maintenance_private.account_deletion_requests;j private.kb_shared_deletion_journal;
 v maintenance_private.scoped_consent_bindings;
begin
 if session_user::text not in ('ouchi_shared_consent_backend','shared_retirement_backend')
 or coalesce(current_setting('role',true),'none') not in ('none',session_user::text)
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and r.rolcanlogin
 and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication
 and (r.rolvaliduntil is null or r.rolvaliduntil>clock_timestamp())
 and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid))
 or p_request is null or p_home is null or p_user is null or p_root_lease is null or p_native_lease is null then return;end if;
 -- Shared root first, then app plan/binding/request, then sorted Auth parents.
 -- Combined callers still need the same physical transaction and signal.
 select * into j from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found then return;end if;
 select * into h from maintenance_private.household_handoff_plans where home_id=p_home for update;
 if not found or h.owner_id=h.successor_id or p_user not in(h.owner_id,h.successor_id) then return;end if;
 select * into b from maintenance_private.household_stop_bindings where user_id=h.owner_id for update;
 select * into v from maintenance_private.scoped_consent_bindings
 where request_id=p_request and home_id=p_home and actor_id=p_user for update;
 if v.request_id is null or b.user_id is null or j.request_id is null or j.user_id<>h.owner_id or not((j.status='requested' and j.lease_token is null and j.lease_until is null)
  or(j.status='processing' and j.lease_token=p_root_lease and j.lease_until>clock_timestamp()))
 or j.scope is distinct from v.original_scope-'leaseToken'
 or b.scope-'leaseToken' is distinct from v.original_scope-'leaseToken'
 or b.scope->>'leaseToken' is distinct from p_root_lease::text
 or v.original_scope->>'leaseToken' is distinct from p_root_lease::text
 or h.scope is distinct from v.original_scope or h.plan is distinct from v.original_plan
 or b.native_lease is distinct from p_native_lease or b.state<>'processing' or b.lease_until is null or b.lease_until<=clock_timestamp()
 or v.original_scope->>'kind' is distinct from 'shared-account'
 or v.original_scope->>'protocolVersion' is distinct from '2'
 or v.original_scope->>'requestID' is distinct from p_request::text
 or v.original_scope->>'userID' is distinct from h.owner_id::text then return;end if;
 select * into n from maintenance_private.account_deletion_requests where id=(v.original_plan->>'appRequestID')::uuid for update;
 if not found or n.user_id<>h.owner_id or n.app_epoch_id::text is distinct from v.original_plan->>'appScopeID'
 or n.state<>'running' or n.lease_token is distinct from p_native_lease or n.lease_until is null or n.lease_until<=clock_timestamp()
 or not exists(select 1 from maintenance_private.household_family_holds f
 where f.home_id=p_home and f.principal=h.owner_id and f.scope=v.original_scope) then return;end if;
 return query select v.payload,v.signature;
end$$;
revoke all on function maintenance_private.read_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;


create function maintenance_private.current_prepared_scoped_consent(
 p_request uuid,p_home uuid,p_user uuid,p_root_lease uuid,p_native_lease uuid,
 p_timebox bigint,p_inactivity bigint
) returns table(auth_state_digest text,authenticated_at bigint,checked_at bigint)
language plpgsql volatile security definer set search_path='' as $$
declare h maintenance_private.household_handoff_plans;b maintenance_private.household_stop_bindings;
 n maintenance_private.account_deletion_requests;j private.kb_shared_deletion_journal;
 v maintenance_private.scoped_consent_bindings;u auth.users;s auth.sessions;
 p_session uuid;p_totp_at bigint;at_ms bigint;state jsonb;total integer;
begin
 if session_user::text<>'shared_retirement_backend'
 or (p_timebox is not null and (p_timebox<1 or p_timebox>315360000))
 or (p_inactivity is not null and (p_inactivity<1 or p_inactivity>315360000)) then return;end if;
 perform 1 from maintenance_private.read_prepared_scoped_consent(p_request,p_home,p_user,p_root_lease,p_native_lease);
 if not found then return;end if;
 select * into v from maintenance_private.scoped_consent_bindings where request_id=p_request and home_id=p_home and actor_id=p_user;
 if v.expires_at<=floor(extract(epoch from clock_timestamp())*1000)::bigint then return;end if;
 select * into h from maintenance_private.household_handoff_plans where home_id=p_home;
 select * into b from maintenance_private.household_stop_bindings where user_id=h.owner_id;
 select * into j from private.kb_shared_deletion_journal where request_id=p_request;
 select * into n from maintenance_private.account_deletion_requests where id=(v.original_plan->>'appRequestID')::uuid;
 p_session=v.session_id;p_totp_at=v.authenticated_at;
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
 state=jsonb_build_object('domain','OuchiMaintenance/scoped-shared-consent-auth/v1','scope',v.original_scope,'plan',v.original_plan,
  'user',jsonb_build_object('id',u.id,'password',u.encrypted_password,'email',u.email,'emailConfirmedAt',u.email_confirmed_at,'bannedUntil',u.banned_until,'deletedAt',u.deleted_at),
  'session',jsonb_build_object('id',s.id,'userID',s.user_id,'aal',s.aal,'factorID',s.factor_id,'createdAt',s.created_at,'notAfter',s.not_after),
  'factors',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from auth.mfa_factors f where f.user_id=p_user),'[]'::jsonb),
  'amr',coalesce((select jsonb_agg(to_jsonb(a) order by a.authentication_method) from auth.mfa_amr_claims a where a.session_id=p_session),'[]'::jsonb));

 if encode(sha256(convert_to(state::text,'UTF8')),'hex') is distinct from v.auth_state_digest then return;end if;
 return query select v.auth_state_digest,p_totp_at,floor(extract(epoch from clock_timestamp())*1000)::bigint;
end$$;
revoke all on function maintenance_private.current_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid,bigint,bigint) from public,anon,authenticated,service_role;

-- Hook-free app-owned claim frame. No raw root/Auth table grant. The same
-- exact full family roster and physical transaction must survive adoption.
create function maintenance_private.prepared_consent_claim_frame(
 p_request uuid,p_root_lease uuid,p_scope jsonb,p_homes jsonb
) returns table(status text,backend_pid int,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$
declare root private.kb_shared_deletion_journal;expected jsonb;h maintenance_private.household_handoff_plans;
begin
 if session_user::text<>'shared_retirement_backend'
 or coalesce(current_setting('role',true),'none') not in ('none',session_user::text)
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and r.rolcanlogin
  and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication
  and (r.rolvaliduntil is null or r.rolvaliduntil>clock_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid))
 or jsonb_typeof(p_homes) is distinct from 'array'
 or jsonb_array_length(p_homes)<1 or jsonb_array_length(p_homes)>100 then return;end if;
 select * into root from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found or root.scope is distinct from p_scope-'leaseToken' or p_scope->>'leaseToken' is distinct from p_root_lease::text
 or not((root.status='requested' and root.lease_token is null and root.lease_until is null)
  or(root.status='processing' and root.lease_token=p_root_lease and root.lease_until>clock_timestamp())) then return;end if;
 select coalesce(jsonb_agg(jsonb_build_object('homeID',p.home_id,'successorID',p.successor_id) order by p.home_id),'[]') into expected
 from maintenance_private.household_handoff_plans p where p.owner_id=root.user_id and p.scope-'leaseToken'=root.scope;
 if expected is distinct from p_homes or exists(select 1 from public.homes owned where owned.owner_id=root.user_id
  and exists(select 1 from public.home_members m where m."homeId"=owned.id and m.user_id<>root.user_id)
  and not exists(select 1 from maintenance_private.household_handoff_plans plan where plan.home_id=owned.id and plan.owner_id=root.user_id and plan.scope-'leaseToken'=root.scope)) then return;end if;
 -- Pin the complete cross-home actor set in one global UUID order before
 -- per-home current Auth readers. Avoid retaining one pair before a lower
 -- UUID from another home while a different claim owns the reverse pair.
 perform u.id from auth.users u where u.id=root.user_id or u.id in(
  select (x->>'successorID')::uuid from jsonb_array_elements(p_homes) x
 ) order by u.id for update;
 for h in select * from maintenance_private.household_handoff_plans where owner_id=root.user_id and scope-'leaseToken'=root.scope order by home_id loop
  if h.scope is distinct from p_scope then return;end if;
  perform 1 from maintenance_private.read_prepared_scoped_consent(p_request,h.home_id,h.owner_id,p_root_lease,(select b.native_lease from maintenance_private.household_stop_bindings b where b.user_id=root.user_id));
  if not found then return;end if;
  perform 1 from maintenance_private.read_prepared_scoped_consent(p_request,h.home_id,h.successor_id,p_root_lease,(select b.native_lease from maintenance_private.household_stop_bindings b where b.user_id=root.user_id));
  if not found then return;end if;
 end loop;
 return query select root.status,pg_backend_pid(),txid_current()::text;
end$$;
revoke all on function maintenance_private.prepared_consent_claim_frame(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
