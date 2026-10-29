-- Undeployed initial family-consent candidate. No roles/grants/migration.
-- New dedicated epoch-bound RPC; existing processing worker gates unchanged.
-- All Auth state checks are the prepared original verifier, with actual session
-- enrollment locked and checked in the same transaction before returning epoch.
create table maintenance_private.initial_household_consent_origins(
 request_id uuid not null,home_id uuid not null,actor_id uuid not null,
 original_signature text not null,epoch_id uuid not null,token_hash text not null,
 created_at timestamptz not null default clock_timestamp(),primary key(request_id,home_id,actor_id),
 foreign key(request_id,home_id,actor_id) references maintenance_private.scoped_consent_bindings(request_id,home_id,actor_id),
 check(original_signature ~ '^[a-f0-9]{64}$' and token_hash ~ '^[a-f0-9]{64}$')
);
alter table maintenance_private.initial_household_consent_origins enable row level security;
revoke all on maintenance_private.initial_household_consent_origins from public,anon,authenticated,service_role;
create trigger immutable_initial_household_origin before update or delete on maintenance_private.initial_household_consent_origins
for each row execute function maintenance_private.refuse_family_attachment_journal_change();

-- This is the FIRST operation of each initial-consent transaction, before
-- caller inventory or Auth pins. No caller SQL/row allowlist/role switch.
create function maintenance_private.pin_initial_family_consent(p_request uuid,p_home uuid,p_root_lease uuid,p_native_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare root private.kb_shared_deletion_journal;h maintenance_private.household_handoff_plans;
 b maintenance_private.household_stop_bindings;n maintenance_private.account_deletion_requests;actor uuid;
begin
 if session_user::text not in('ouchi_shared_consent_backend','shared_retirement_backend')
 or coalesce(current_setting('role',true),'none') not in('none',session_user::text)
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and r.rolcanlogin
  and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication
  and (r.rolvaliduntil is null or r.rolvaliduntil>clock_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid)) then return false;end if;
 select * into root from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found or not((root.status='requested' and root.lease_token is null and root.lease_until is null)
  or(root.status='processing' and root.lease_token=p_root_lease and root.lease_until>clock_timestamp())) then return false;end if;
 select * into h from maintenance_private.household_handoff_plans where home_id=p_home for update;
 if not found or h.owner_id<>root.user_id or h.scope-'leaseToken' is distinct from root.scope
 or(root.status='requested' and h.scope->>'leaseToken' is distinct from p_root_lease::text) then return false;end if;
 for actor in select distinct id from(
  select h.owner_id id union select h.successor_id
  union select (x#>>'{}')::uuid from jsonb_array_elements(h.plan->'memberIDs') x
  union select f.user_id from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p."homeId"=p_home
 ) actors where id is not null order by id loop
  perform pg_advisory_xact_lock(hashtext(actor::text));
 end loop;
 select * into b from maintenance_private.household_stop_bindings where user_id=h.owner_id for update;
 select * into n from maintenance_private.account_deletion_requests where id=(h.plan->>'appRequestID')::uuid for update;
 return b.scope-'leaseToken'=h.scope-'leaseToken' and b.scope->>'leaseToken'=p_root_lease::text and b.native_lease=p_native_lease and b.state='processing' and b.lease_until>clock_timestamp()
  and n.user_id=h.owner_id and n.app_epoch_id::text=h.plan->>'appScopeID' and n.state='running'
  and n.lease_token=p_native_lease and n.lease_until>clock_timestamp()
  and exists(select 1 from maintenance_private.household_family_holds hold where hold.home_id=p_home and hold.principal=h.owner_id and hold.scope=h.scope);
end$$;
revoke all on function maintenance_private.pin_initial_family_consent(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function maintenance_private.current_initial_family_identity(
 p_request uuid,p_home uuid,p_user uuid,p_root_lease uuid,p_native_lease uuid,
 p_timebox bigint,p_inactivity bigint
) returns table(auth_state_digest text,authenticated_at bigint,checked_at bigint,epoch_id uuid)
language plpgsql volatile security definer set search_path='' as $$
declare h maintenance_private.household_handoff_plans;b maintenance_private.household_stop_bindings;
 n maintenance_private.account_deletion_requests;j private.kb_shared_deletion_journal;
 v maintenance_private.scoped_consent_bindings;u auth.users;s auth.sessions;
 p_session uuid;p_totp_at bigint;at_ms bigint;state jsonb;total integer;actual_epoch uuid;
begin
 if session_user::text not in ('ouchi_shared_consent_backend','shared_retirement_backend')
 or (p_timebox is not null and (p_timebox<1 or p_timebox>315360000))
 or (p_inactivity is not null and (p_inactivity<1 or p_inactivity>315360000)) then return;end if;
 perform 1 from maintenance_private.read_prepared_scoped_consent(p_request,p_home,p_user,p_root_lease,p_native_lease);
 if not found then
  perform 1 from maintenance_private.read_scoped_consent(p_request,p_home,p_user,p_root_lease,p_native_lease);
  if not found then return;end if;
 end if;
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
 -- Epoch is read from the actual original-session app enrollment, never
 -- guessed from actor ID or relabeled from a different identity DTO.
 select e.epoch_id into actual_epoch from maintenance_private.app_session_epochs se
 join maintenance_private.app_epochs e on e.user_id=se.user_id and e.epoch_id=se.epoch_id
 join maintenance_private.account_access access on access.user_id=e.user_id
 where se.session_id=p_session and se.user_id=p_user
 and ((p_user=h.owner_id and e.epoch_id=n.app_epoch_id)
  or(p_user=h.successor_id and e.enabled and access.enabled
   and not exists(select 1 from maintenance_private.account_deletion_requests pending where pending.user_id=p_user and pending.state<>'complete')))
 for update of se,e,access;
 if not found then return;end if;
 return query select v.auth_state_digest,p_totp_at,floor(extract(epoch from clock_timestamp())*1000)::bigint,actual_epoch;
end$$;
revoke all on function maintenance_private.current_initial_family_identity(uuid,uuid,uuid,uuid,uuid,bigint,bigint) from public,anon,authenticated,service_role;


-- Private original/legacy proof read. This is archival metadata, NOT current
-- identity. Consumers must call the epoch/Auth RPC for live authorization.
create function maintenance_private.read_initial_household_origin(p_request uuid,p_home uuid,p_actor uuid,p_root_lease uuid,p_native_lease uuid)
returns table(payload jsonb,signature text,existing_token text,revoked_at timestamptz,origin_signature text,origin_epoch uuid,token_hash text,plan_digest text)
language plpgsql security definer set search_path='' as $$
declare h maintenance_private.household_handoff_plans;v maintenance_private.scoped_consent_bindings;
begin
 perform 1 from maintenance_private.read_prepared_scoped_consent(p_request,p_home,p_actor,p_root_lease,p_native_lease);
 if not found then
  perform 1 from maintenance_private.read_scoped_consent(p_request,p_home,p_actor,p_root_lease,p_native_lease);
  if not found then
  if session_user::text<>'shared_retirement_backend' then return;end if;
  select * into h from maintenance_private.household_handoff_plans where home_id=p_home;
  perform 1 from maintenance_private.read_post_native_seal_consent(p_request,p_home,p_actor,p_root_lease,(h.plan->>'appRequestID')::uuid,(h.plan->>'appScopeID')::uuid,p_native_lease);
  if not found then return;end if;
  end if;
 end if;
 select * into v from maintenance_private.scoped_consent_bindings where request_id=p_request and home_id=p_home and actor_id=p_actor;
 return query select v.payload,v.signature,c.token,c.revoked_at,o.original_signature,o.epoch_id,o.token_hash,hp.plan_digest
 from maintenance_private.household_handoff_plans hp
 left join maintenance_private.household_handoff_consents c on c.home_id=hp.home_id and c.actor_id=p_actor
 left join maintenance_private.initial_household_consent_origins o on o.request_id=p_request and o.home_id=hp.home_id and o.actor_id=p_actor
 where hp.home_id=p_home;
end$$;
revoke all on function maintenance_private.read_initial_household_origin(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Closed INSERT of the legacy-format proof PLUS independent original binding.
-- An existing legacy row without this binding is refused, never converted.
create function maintenance_private.record_initial_household_consent(
 p_request uuid,p_home uuid,p_actor uuid,p_root_lease uuid,p_native_lease uuid,p_token text,p_original_signature text,p_epoch uuid,p_timebox bigint,p_inactivity bigint
) returns boolean language plpgsql security definer set search_path='' as $$
declare root private.kb_shared_deletion_journal;h maintenance_private.household_handoff_plans;
 v maintenance_private.scoped_consent_bindings;current_auth record;c jsonb;body text;prior maintenance_private.household_handoff_consents;
begin
 if session_user::text<>'ouchi_shared_consent_backend' or p_token is null or length(p_token)>8192
 or p_token !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then return false;end if;
 select * into root from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found or root.status<>'requested' or root.lease_token is not null or root.lease_until is not null then return false;end if;
 select * into current_auth from maintenance_private.current_initial_family_identity(p_request,p_home,p_actor,p_root_lease,p_native_lease,p_timebox,p_inactivity);
 if not found or current_auth.epoch_id is distinct from p_epoch then return false;end if;
 select * into h from maintenance_private.household_handoff_plans where home_id=p_home;
 select * into v from maintenance_private.scoped_consent_bindings where request_id=p_request and home_id=p_home and actor_id=p_actor;
 if v.signature is distinct from p_original_signature then return false;end if;
 body:=split_part(p_token,'.',1);
 c:=convert_from(decode(translate(body,'-_','+/')||repeat('=',(4-length(body)%4)%4),'base64'),'UTF8')::jsonb;
 if jsonb_typeof(c) is distinct from 'object' or (select count(*) from jsonb_object_keys(c))<>7
 or c->>'purpose' is distinct from 'OuchiMaintenance/shared-family-handoff/v1'
 or c->>'planDigest' is distinct from h.plan_digest or c->>'actorID' is distinct from p_actor::text
 or c->>'role' is distinct from (case when p_actor=h.owner_id then 'owner' when p_actor=h.successor_id then 'successor' else null end)
 or (c->>'authVerifiedAt')::bigint is distinct from v.authenticated_at
 or (c->>'acceptedAt')::bigint<v.authenticated_at or (c->>'acceptedAt')::bigint>floor(extract(epoch from clock_timestamp())*1000)::bigint+60000
 or (c->>'expiresAt')::bigint<>(c->>'acceptedAt')::bigint+900000 then return false;end if;
 select * into prior from maintenance_private.household_handoff_consents where home_id=p_home and actor_id=p_actor for update;
 if found then
  return prior.token=p_token and prior.revoked_at is null and exists(select 1 from maintenance_private.initial_household_consent_origins o
   where o.request_id=p_request and o.home_id=p_home and o.actor_id=p_actor and o.original_signature=v.signature
   and o.epoch_id=p_epoch and o.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex'));
 end if;
 insert into maintenance_private.household_handoff_consents values(p_home,p_actor,p_token,null);
 insert into maintenance_private.initial_household_consent_origins values(p_request,p_home,p_actor,v.signature,p_epoch,encode(sha256(convert_to(p_token,'UTF8')),'hex'),clock_timestamp());
 return true;
end$$;
revoke all on function maintenance_private.record_initial_household_consent(uuid,uuid,uuid,uuid,uuid,text,text,uuid,bigint,bigint) from public,anon,authenticated,service_role;

-- Only used AFTER the existing signed inventory and household committed
-- verifiers. Returns their actual immutable activation snapshots, not Auth.
create function maintenance_private.read_initial_family_activation(p_request uuid,p_home uuid,p_root_lease uuid,p_native_lease uuid)
returns table(activated_at_ms bigint,household_consents jsonb,inventory_consents jsonb)
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 select p.owner_id into owner_id from maintenance_private.household_handoff_plans p where p.home_id=p_home;
 perform 1 from maintenance_private.read_initial_household_origin(p_request,p_home,owner_id,p_root_lease,p_native_lease);
 if not found then return;end if;
 return query select floor(extract(epoch from r.activated_at)*1000)::bigint,c.consents,c.inventory_approval->'consents'
 from maintenance_private.family_attachment_activation_receipts r
 join maintenance_private.family_attachment_activation_contexts c on c.token=r.activation_token
 where r.request_id=p_request and r.home_id=p_home and c.request_id=r.request_id and c.home_id=r.home_id;
end$$;
revoke all on function maintenance_private.read_initial_family_activation(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
