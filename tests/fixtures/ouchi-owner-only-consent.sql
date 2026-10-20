-- Closed local candidate, NOT a migration. No roles or grants. No family or
-- processing verifier is changed. Parent FK prerequisites must be provisioned
-- separately and independently reviewed before any production adapter exists.
create function maintenance_private.ouchi_owner_only_frame(p_request uuid,p_lease uuid,p_scope jsonb,p_native uuid)
returns table(status text,backend_pid int,transaction_id text)
language plpgsql volatile security definer set search_path='' as $$
declare j private.kb_shared_deletion_journal;b maintenance_private.household_stop_bindings;
 n maintenance_private.account_deletion_requests;a jsonb;dependency record;
begin
 if session_user::text not in('ouchi_shared_consent_backend','shared_retirement_backend')
 or coalesce(current_setting('role',true),'none') not in('none',session_user::text)
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and r.rolcanlogin
  and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication
  and (r.rolvaliduntil is null or r.rolvaliduntil>clock_timestamp())
  and not exists(select 1 from pg_catalog.pg_auth_members m where m.member=r.oid or m.roleid=r.oid))
 or p_request is null or p_lease is null or p_native is null or jsonb_typeof(p_scope) is distinct from 'object'
 or p_scope->>'requestID' is distinct from p_request::text or p_scope->>'leaseToken' is distinct from p_lease::text
 then return;end if;
 select * into j from private.kb_shared_deletion_journal where request_id=p_request for update;
 if not found or j.scope is distinct from p_scope-'leaseToken' or j.user_id::text is distinct from p_scope->>'userID'
 or j.scope->>'protocolVersion' is distinct from '2' or j.scope->>'kind' is distinct from 'shared-account'
 or coalesce(j.scope->>'inventoryDigest','')!~'^[a-f0-9]{64}$' or jsonb_typeof(j.scope->'apps') is distinct from 'array'
 or not((j.status='requested' and j.lease_token is null and j.lease_until is null)
  or(j.status='processing' and j.lease_token=p_lease and j.lease_until>clock_timestamp())) then return;end if;
 if (select count(*) from jsonb_array_elements(j.scope->'apps') x where x->>'app'='ouchi-maintenance')<>1 then return;end if;
 select x into a from jsonb_array_elements(j.scope->'apps') x where x->>'app'='ouchi-maintenance';
 -- Empty scans cannot fence phantom children. These exact immediate, validated,
 -- single-column dependencies make our parent FOR UPDATE locks meaningful.
 for dependency in select * from (values
  ('public.homes','owner_id','auth.users','id'),
  ('public.home_members','homeId','public.homes','id'),
  ('maintenance_private.household_handoff_plans','owner_id','auth.users','id'),
  ('maintenance_private.household_handoff_plans','root_request_id','private.kb_shared_deletion_journal','request_id'),
  ('maintenance_private.household_family_holds','principal','auth.users','id'),
  ('maintenance_private.household_family_holds','root_request_id','private.kb_shared_deletion_journal','request_id')
 ) required(child,column_name,parent,parent_column) loop
  if not exists(select 1 from pg_catalog.pg_constraint c
   join pg_catalog.pg_attribute col on col.attrelid=c.conrelid and col.attnum=c.conkey[1]
   join pg_catalog.pg_attribute target on target.attrelid=c.confrelid and target.attnum=c.confkey[1]
   where c.contype='f' and c.convalidated and not c.condeferrable and cardinality(c.conkey)=1 and cardinality(c.confkey)=1
   and c.conrelid=to_regclass(dependency.child) and c.confrelid=to_regclass(dependency.parent)
   and col.attname=dependency.column_name and target.attname=dependency.parent_column) then return;end if;
 end loop;
 perform pg_advisory_xact_lock(hashtext(j.user_id::text));
 perform id from auth.users where id=j.user_id for update;if not found then return;end if;
 perform id from public.homes where owner_id=j.user_id order by id for update;
 perform m.user_id from public.home_members m join public.homes h on h.id=m."homeId"
 where h.owner_id=j.user_id order by h.id,m.user_id for update of m;
 if exists(select 1 from public.homes h where h.owner_id=j.user_id and exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id<>j.user_id))
 or exists(select 1 from maintenance_private.household_handoff_plans where owner_id=j.user_id or root_request_id=p_request)
 or exists(select 1 from maintenance_private.household_family_holds where principal=j.user_id or root_request_id=p_request) then return;end if;
 select * into b from maintenance_private.household_stop_bindings where user_id=j.user_id for update;
 if not found or b.scope is distinct from p_scope or b.native_lease is distinct from p_native
 or b.state<>'processing' or b.lease_until<=clock_timestamp()
 or not exists(select 1 from maintenance_private.household_principal_fences where user_id=j.user_id and stopped) then return;end if;
 select * into n from maintenance_private.account_deletion_requests where id=(a->>'requestID')::uuid for update;
 if not found or n.user_id<>j.user_id or n.app_epoch_id::text is distinct from a->>'scopeID'
 or n.state<>'running' or n.lease_token is distinct from p_native or n.lease_until<=clock_timestamp()
 or(j.status='processing' and j.lease_until<=clock_timestamp()) then return;end if;
 return query select j.status,pg_backend_pid(),txid_current()::text;
end$$;
revoke all on function maintenance_private.ouchi_owner_only_frame(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;

-- Independent owner Auth domain; never a cast from family/peer identity.
create function maintenance_private.ouchi_owner_auth(p_request uuid,p_lease uuid,p_scope jsonb,p_native uuid,
 p_session uuid,p_password bigint,p_totp bigint,p_timebox bigint,p_inactivity bigint)
returns table(auth_state_digest text,checked_at bigint,epoch_id uuid)
language plpgsql volatile security definer set search_path='' as $$
declare u auth.users;s auth.sessions;actual_epoch uuid;state jsonb;at_ms bigint;dependency record;
begin
 if p_session is null or p_password is null or p_totp is null
 or(p_timebox is not null and (p_timebox<1 or p_timebox>315360000))
 or(p_inactivity is not null and (p_inactivity<1 or p_inactivity>315360000)) then return;end if;
 perform 1 from maintenance_private.ouchi_owner_only_frame(p_request,p_lease,p_scope,p_native);if not found then return;end if;
 for dependency in select * from(values('auth.sessions','user_id','auth.users','id'),('auth.mfa_factors','user_id','auth.users','id'),('auth.mfa_amr_claims','session_id','auth.sessions','id')) required(child,column_name,parent,parent_column) loop
  if not exists(select 1 from pg_catalog.pg_constraint c
   join pg_catalog.pg_attribute col on col.attrelid=c.conrelid and col.attnum=c.conkey[1]
   join pg_catalog.pg_attribute target on target.attrelid=c.confrelid and target.attnum=c.confkey[1]
   where c.contype='f' and c.convalidated and not c.condeferrable and cardinality(c.conkey)=1 and cardinality(c.confkey)=1
   and c.conrelid=to_regclass(dependency.child) and c.confrelid=to_regclass(dependency.parent)
   and col.attname=dependency.column_name and target.attname=dependency.parent_column) then return;end if;
 end loop;
 select * into u from auth.users where id=(p_scope->>'userID')::uuid;
 select * into s from auth.sessions where id=p_session and user_id=u.id for update;if not found then return;end if;
 perform id from auth.mfa_factors where user_id=u.id order by id for update;
 perform session_id from auth.mfa_amr_claims where session_id=p_session order by authentication_method for update;
 at_ms=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 if u.is_anonymous is distinct from false or u.deleted_at is not null or u.email_confirmed_at is null
 or(u.banned_until is not null and u.banned_until>clock_timestamp()) or s.aal::text is distinct from 'aal2'
 or s.created_at is null or s.created_at>clock_timestamp()
 or(s.refreshed_at is not null and s.refreshed_at at time zone 'UTC'>clock_timestamp())
 or(s.not_after is not null and s.not_after<=clock_timestamp())
 or(p_timebox is not null and s.created_at+(p_timebox*interval '1 second')<=clock_timestamp())
 or(p_inactivity is not null and (s.refreshed_at is null or s.refreshed_at at time zone 'UTC'+(p_inactivity*interval '1 second')<=clock_timestamp()))
 or p_password<=0 or p_totp<=0 or p_password>at_ms or p_totp>at_ms or at_ms-p_password>=600000 or at_ms-p_totp>=600000
 or not exists(select 1 from auth.mfa_factors f where f.id=s.factor_id and f.user_id=u.id and f.status::text='verified' and f.factor_type::text='totp')
 or not exists(select 1 from auth.mfa_amr_claims m where m.session_id=p_session and m.authentication_method='password' and floor(extract(epoch from m.updated_at))*1000=p_password)
 or not exists(select 1 from auth.mfa_amr_claims m where m.session_id=p_session and m.authentication_method='totp' and floor(extract(epoch from m.updated_at))*1000=p_totp) then return;end if;
 select e.epoch_id into actual_epoch from maintenance_private.app_session_epochs se
 join maintenance_private.app_epochs e on e.user_id=se.user_id and e.epoch_id=se.epoch_id
 join maintenance_private.account_access access on access.user_id=e.user_id
 where se.session_id=p_session and se.user_id=u.id and e.epoch_id::text=(select x->>'scopeID' from jsonb_array_elements(p_scope->'apps') x where x->>'app'='ouchi-maintenance')
 for update of se,e,access;if not found then return;end if;
 state=jsonb_build_object('domain','OuchiMaintenance/owner-only-auth/v1','scope',p_scope,'epoch',actual_epoch,
 'user',jsonb_build_object('id',u.id,'password',u.encrypted_password,'email',u.email,'emailConfirmedAt',u.email_confirmed_at,'phone',u.phone,'phoneConfirmedAt',u.phone_confirmed_at,'bannedUntil',u.banned_until,'deletedAt',u.deleted_at),
 'session',jsonb_build_object('id',s.id,'userID',s.user_id,'aal',s.aal,'factorID',s.factor_id,'createdAt',s.created_at,'notAfter',s.not_after),
 'factors',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from auth.mfa_factors f where f.user_id=u.id),'[]'::jsonb),
 'amr',coalesce((select jsonb_agg(to_jsonb(m) order by m.authentication_method) from auth.mfa_amr_claims m where m.session_id=p_session),'[]'::jsonb));
 perform 1 from maintenance_private.ouchi_owner_only_frame(p_request,p_lease,p_scope,p_native);if not found then return;end if;
 if least(p_password,p_totp)+600000<=floor(extract(epoch from clock_timestamp())*1000)::bigint then return;end if;
 return query select encode(sha256(convert_to(state::text,'UTF8')),'hex'),floor(extract(epoch from clock_timestamp())*1000)::bigint,actual_epoch;
end$$;
revoke all on function maintenance_private.ouchi_owner_auth(uuid,uuid,jsonb,uuid,uuid,bigint,bigint,bigint,bigint) from public,anon,authenticated,service_role;

-- No Auth FK: original custody survives Auth retirement. This table does not
-- authorize post-Auth recovery; no such reader is included in this candidate.
create table maintenance_private.ouchi_owner_originals(
 request_id uuid primary key references private.kb_shared_deletion_journal(request_id),
 payload jsonb not null,signature text not null check(signature~'^[a-f0-9]{64}$')
);
alter table maintenance_private.ouchi_owner_originals enable row level security;
revoke all on maintenance_private.ouchi_owner_originals from public,anon,authenticated,service_role;
create function maintenance_private.refuse_owner_original_change() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Immutable owner original';end$$;
revoke all on function maintenance_private.refuse_owner_original_change() from public,anon,authenticated,service_role;
create trigger immutable_owner_original before update or delete on maintenance_private.ouchi_owner_originals for each row execute function maintenance_private.refuse_owner_original_change();

create function maintenance_private.record_ouchi_owner_original(p_request uuid,p_lease uuid,p_scope jsonb,p_native uuid,p_payload jsonb,p_signature text,p_timebox bigint,p_inactivity bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare phase text;proof record;old maintenance_private.ouchi_owner_originals;
begin
 if session_user::text<>'ouchi_shared_consent_backend' or p_signature is null or p_signature!~'^[a-f0-9]{64}$'
 or jsonb_typeof(p_payload) is distinct from 'object' or(select count(*) from jsonb_object_keys(p_payload))<>11
 or p_payload->>'domain' is distinct from 'OuchiMaintenance/owner-only-original/v1'
 or p_payload->'scope' is distinct from p_scope or p_payload->>'userID' is distinct from p_scope->>'userID'
 or p_payload->>'nativeLease' is distinct from p_native::text or p_payload->>'aal' is distinct from 'aal2' then return false;end if;
 select f.status into phase from maintenance_private.ouchi_owner_only_frame(p_request,p_lease,p_scope,p_native) f;
 if phase is distinct from 'requested' then return false;end if;
 select * into proof from maintenance_private.ouchi_owner_auth(p_request,p_lease,p_scope,p_native,(p_payload->>'sessionID')::uuid,(p_payload->>'passwordAt')::bigint,(p_payload->>'authenticatedAt')::bigint,p_timebox,p_inactivity);
 if not found or proof.auth_state_digest is distinct from p_payload->>'authStateDigest' or proof.epoch_id::text is distinct from p_payload->>'epochID'
 or(p_payload->>'expiresAt')::bigint is distinct from least((p_payload->>'passwordAt')::bigint,(p_payload->>'authenticatedAt')::bigint)+600000 then return false;end if;
 select * into old from maintenance_private.ouchi_owner_originals where request_id=p_request;
 if found then return old.payload=p_payload and old.signature=p_signature;end if;
 insert into maintenance_private.ouchi_owner_originals values(p_request,p_payload,p_signature);return true;
end$$;
revoke all on function maintenance_private.record_ouchi_owner_original(uuid,uuid,jsonb,uuid,jsonb,text,bigint,bigint) from public,anon,authenticated,service_role;

create function maintenance_private.read_ouchi_owner_original(p_request uuid,p_lease uuid,p_scope jsonb,p_native uuid)
returns table(payload jsonb,signature text) language plpgsql security definer set search_path='' as $$
begin
 perform 1 from maintenance_private.ouchi_owner_only_frame(p_request,p_lease,p_scope,p_native);if not found then return;end if;
 return query select o.payload,o.signature from maintenance_private.ouchi_owner_originals o where o.request_id=p_request;
end$$;
revoke all on function maintenance_private.read_ouchi_owner_original(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
