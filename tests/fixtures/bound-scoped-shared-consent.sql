-- Undeployed review candidate, not a migration. Creates no LOGIN or grants.
-- Private custody is immutable and has no Auth FK: logout/user deletion must
-- not cascade the original proof. No JWT, refresh token or raw Auth snapshot.
create table maintenance_private.scoped_consent_bindings(
 request_id uuid not null,home_id uuid not null,actor_id uuid not null,
 session_id uuid not null,authenticated_at bigint not null,
 auth_state_digest text not null check(auth_state_digest ~ '^[a-f0-9]{64}$'),
 proof_domain text not null check(proof_domain='OuchiMaintenance/scoped-shared-consent-auth/v1'),
 payload jsonb not null,signature text not null check(signature ~ '^[a-f0-9]{64}$'),
 expires_at bigint not null,original_scope jsonb not null,original_plan jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(request_id,home_id,actor_id),
 check(authenticated_at>0 and expires_at>authenticated_at and expires_at<=authenticated_at+600000)
);
alter table maintenance_private.scoped_consent_bindings enable row level security;
revoke all on maintenance_private.scoped_consent_bindings from public,anon,authenticated,service_role;
create function maintenance_private.immutable_scoped_consent_binding() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'Original scoped consent is immutable';end$$;
revoke all on function maintenance_private.immutable_scoped_consent_binding() from public,anon,authenticated,service_role;
create trigger immutable_scoped_consent_binding before update or delete on maintenance_private.scoped_consent_bindings
for each row execute function maintenance_private.immutable_scoped_consent_binding();

-- Issuer EXECUTE only; exact identity is independently checked by the existing
-- dedicated-principal RPC in this physical transaction. Unique INSERT only.
create function maintenance_private.record_scoped_consent(
 p_request uuid,p_home uuid,p_user uuid,p_session uuid,p_native_lease uuid,
 p_payload jsonb,p_signature text,p_timebox bigint,p_inactivity bigint
) returns boolean language plpgsql security definer set search_path='' as $$
declare current_auth record;h maintenance_private.household_handoff_plans;at_ms bigint;
begin
 if session_user::text<>'ouchi_shared_consent_backend' or jsonb_typeof(p_payload) is distinct from 'object'
 or p_payload->>'requestID' is distinct from p_request::text or p_payload->>'homeID' is distinct from p_home::text
 or p_payload->>'userID' is distinct from p_user::text or p_payload->>'sessionID' is distinct from p_session::text
 or p_payload->>'proofDomain' is distinct from 'OuchiMaintenance/scoped-shared-consent-auth/v1'
 or p_payload->>'aal' is distinct from 'aal2' or p_signature is null or p_signature !~ '^[a-f0-9]{64}$'
 or (select count(*) from jsonb_object_keys(p_payload))<>9 then return false;end if;
 select * into current_auth from maintenance_private.scoped_shared_consent_auth(
 p_request,p_home,p_user,p_session,p_native_lease,'aal2',(p_payload->>'authenticatedAt')::bigint,p_timebox,p_inactivity);
 if not found or current_auth.auth_state_digest is distinct from p_payload->>'authStateDigest' then return false;end if;
 at_ms=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 if (p_payload->>'expiresAt')::bigint<=at_ms
 or (p_payload->>'expiresAt')::bigint>current_auth.authenticated_at+600000 then return false;end if;
 select * into h from maintenance_private.household_handoff_plans where home_id=p_home for update;
 insert into maintenance_private.scoped_consent_bindings values(p_request,p_home,p_user,p_session,
 current_auth.authenticated_at,current_auth.auth_state_digest,'OuchiMaintenance/scoped-shared-consent-auth/v1',
 p_payload,p_signature,(p_payload->>'expiresAt')::bigint,h.scope,h.plan,clock_timestamp());
 return true;
end$$;
revoke all on function maintenance_private.record_scoped_consent(uuid,uuid,uuid,uuid,uuid,jsonb,text,bigint,bigint) from public,anon,authenticated,service_role;

-- Private historical custody read. This is NOT current identity, authorization,
-- family completion or permission to run a mutation. Used after logout only
-- with independent committed stage/capability checks by the owning controller.
create function maintenance_private.read_scoped_consent(
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
 -- Keep the issuer's established app order. Combined cross-app lock order
 -- remains an integration gate; separate connections cannot substitute for it.
 select * into h from maintenance_private.household_handoff_plans where home_id=p_home for update;
 if not found or h.owner_id=h.successor_id or p_user not in(h.owner_id,h.successor_id) then return;end if;
 select * into b from maintenance_private.household_stop_bindings where user_id=h.owner_id for update;
 select * into j from private.kb_shared_deletion_journal where request_id=p_request for update;
 select * into v from maintenance_private.scoped_consent_bindings
 where request_id=p_request and home_id=p_home and actor_id=p_user for update;
 if v.request_id is null or b.user_id is null or j.request_id is null or j.user_id<>h.owner_id or j.status<>'processing'
 or j.lease_token is distinct from p_root_lease or j.lease_until is null or j.lease_until<=clock_timestamp()
 or j.scope is distinct from v.original_scope-'leaseToken'
 or b.scope-'leaseToken' is distinct from v.original_scope-'leaseToken'
 or b.scope->>'leaseToken' is distinct from p_root_lease::text
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
revoke all on function maintenance_private.read_scoped_consent(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Pre-logout current-state port for the separate coordinator. Frozen issuance
-- scope stays in the old digest; live root/native leases are checked separately.
-- Missing sessions after logout DENY current identity. Read historical evidence
-- above instead; never relabel it as fresh authentication.
create function maintenance_private.current_bound_scoped_consent(
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
 perform 1 from maintenance_private.read_scoped_consent(p_request,p_home,p_user,p_root_lease,p_native_lease);
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
 or b.lease_until<=clock_timestamp() or j.lease_until<=clock_timestamp() or n.lease_until<=clock_timestamp() then return;end if;
 state=jsonb_build_object('domain','OuchiMaintenance/scoped-shared-consent-auth/v1','scope',v.original_scope,'plan',v.original_plan,
  'user',jsonb_build_object('id',u.id,'password',u.encrypted_password,'email',u.email,'emailConfirmedAt',u.email_confirmed_at,'bannedUntil',u.banned_until,'deletedAt',u.deleted_at),
  'session',jsonb_build_object('id',s.id,'userID',s.user_id,'aal',s.aal,'factorID',s.factor_id,'createdAt',s.created_at,'notAfter',s.not_after),
  'factors',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from auth.mfa_factors f where f.user_id=p_user),'[]'::jsonb),
  'amr',coalesce((select jsonb_agg(to_jsonb(a) order by a.authentication_method) from auth.mfa_amr_claims a where a.session_id=p_session),'[]'::jsonb));

 if encode(sha256(convert_to(state::text,'UTF8')),'hex') is distinct from v.auth_state_digest then return;end if;
 return query select v.auth_state_digest,p_totp_at,floor(extract(epoch from clock_timestamp())*1000)::bigint;
end$$;
revoke all on function maintenance_private.current_bound_scoped_consent(uuid,uuid,uuid,uuid,uuid,bigint,bigint) from public,anon,authenticated,service_role;
