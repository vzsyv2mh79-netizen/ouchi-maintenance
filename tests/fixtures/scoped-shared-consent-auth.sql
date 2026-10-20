-- Undeployed review candidate. No role creation, grants, migration or runtime.
-- Existing shared-controller candidate tables are required. This port is only
-- for consent while Auth still exists, never post-Auth receipt recovery.
create function maintenance_private.scoped_shared_consent_auth(
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
 select * into h from maintenance_private.household_handoff_plans where home_id=p_home for update;
 if not found or h.owner_id=h.successor_id or p_user not in(h.owner_id,h.successor_id) then return;end if;
 select * into b from maintenance_private.household_stop_bindings where user_id=h.owner_id for update;
 select * into j from private.kb_shared_deletion_journal where request_id=p_request for update;
 if b.user_id is null or j.request_id is null or j.user_id<>h.owner_id or j.status<>'processing'
 or j.lease_token::text is distinct from b.scope->>'leaseToken' or j.lease_until is null or j.lease_until<=clock_timestamp()
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
 or b.lease_until<=clock_timestamp() or j.lease_until<=clock_timestamp() or n.lease_until<=clock_timestamp() then return;end if;
 state=jsonb_build_object('domain','OuchiMaintenance/scoped-shared-consent-auth/v1','scope',b.scope,'plan',h.plan,
  'user',jsonb_build_object('id',u.id,'password',u.encrypted_password,'email',u.email,'emailConfirmedAt',u.email_confirmed_at,'bannedUntil',u.banned_until,'deletedAt',u.deleted_at),
  'session',jsonb_build_object('id',s.id,'userID',s.user_id,'aal',s.aal,'factorID',s.factor_id,'createdAt',s.created_at,'notAfter',s.not_after),
  'factors',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from auth.mfa_factors f where f.user_id=p_user),'[]'::jsonb),
  'amr',coalesce((select jsonb_agg(to_jsonb(a) order by a.authentication_method) from auth.mfa_amr_claims a where a.session_id=p_session),'[]'::jsonb));
 return query select encode(sha256(convert_to(state::text,'UTF8')),'hex'),p_totp_at,floor(extract(epoch from clock_timestamp())*1000)::bigint;
end $$;
revoke all on function maintenance_private.scoped_shared_consent_auth(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint) from public,anon,authenticated,service_role;
