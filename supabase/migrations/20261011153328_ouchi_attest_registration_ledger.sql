begin;
-- Additive preparation only; no registration endpoint/activation. The trusted
-- server MUST verify Apple certificate/authenticator/receipt for this stored
-- challenge before calling commit. SQL authenticates scope/atomicity, not Apple.
create table maintenance_private.attest_registration_challenges(
 request_id uuid primary key,user_id uuid not null references auth.users(id),session_id uuid not null,app_epoch_id uuid not null,
 key_id text not null check(key_id ~ '^[A-Za-z0-9+/]{43}=$' and octet_length(decode(key_id,'base64'))=32 and encode(decode(key_id,'base64'),'base64')=key_id),
 app_id text not null check(app_id ~ '^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]{1,200}$'),
 attest_environment text not null check(attest_environment in ('development','production')),
 challenge jsonb not null check(jsonb_typeof(challenge)='object'),
 nonce text not null unique check(nonce ~ '^[A-Za-z0-9_-]{43}$'),
 client_data_sha256 text not null check(client_data_sha256 ~ '^[0-9a-f]{64}$'),
 issued_at timestamptz not null,expires_at timestamptz not null check(expires_at=issued_at+interval '5 minutes'),
 consumed_at timestamptz,attestation_sha256 text check(attestation_sha256 ~ '^[0-9a-f]{64}$'),
 check((consumed_at is null and attestation_sha256 is null) or (consumed_at is not null and attestation_sha256 is not null))
);
create index attest_registration_user on maintenance_private.attest_registration_challenges(user_id);
create index attest_registration_expiry on maintenance_private.attest_registration_challenges(expires_at,request_id);
alter table maintenance_private.attest_registration_challenges enable row level security;
revoke all on maintenance_private.attest_registration_challenges from public,anon,authenticated;
grant select,insert,delete on maintenance_private.attest_registration_challenges to service_role;
grant update(consumed_at,attestation_sha256) on maintenance_private.attest_registration_challenges to service_role;

create function maintenance_private.registration_client_data(c jsonb) returns text
language sql immutable strict security invoker set search_path='' as $$
 select format('{"version":1,"purpose":"register_ouchi_attested_key","nonce":"%s","issuedAt":%s,"expiresAt":%s,"userID":"%s","sessionID":"%s","epochID":"%s","requestID":"%s","keyID":"%s","appID":"%s","attestEnvironment":"%s"}',c->>'nonce',c->>'issuedAt',c->>'expiresAt',c->>'userID',c->>'sessionID',c->>'epochID',c->>'requestID',c->>'keyID',c->>'appID',c->>'attestEnvironment');
$$;
create function maintenance_private.validate_attest_registration_challenge() returns trigger
language plpgsql security invoker set search_path='' as $$
declare c jsonb;field_name text;accepted_at timestamptz;
begin
 perform pg_advisory_xact_lock(hashtext(new.user_id::text));
 if public.read_maintenance_explicit_enrollment(new.user_id,new.session_id) is distinct from new.app_epoch_id then raise exception 'Live registration enrollment required'; end if;
 accepted_at=clock_timestamp();c=new.challenge;
 for field_name in select unnest(array['userID','sessionID','epochID','requestID','keyID','appID','attestEnvironment','purpose','nonce']) loop
  if jsonb_typeof(c->field_name) is distinct from 'string' then raise exception 'Invalid registration challenge'; end if;
 end loop;
 if (select count(*) from jsonb_object_keys(c))<>12 or c->'version' is distinct from '1'::jsonb
 or c->>'purpose' is distinct from 'register_ouchi_attested_key'
 or c->>'userID' is distinct from new.user_id::text or c->>'sessionID' is distinct from new.session_id::text
 or c->>'epochID' is distinct from new.app_epoch_id::text or c->>'requestID' is distinct from new.request_id::text
 or c->>'keyID' is distinct from new.key_id or c->>'appID' is distinct from new.app_id or c->>'attestEnvironment' is distinct from new.attest_environment
 or new.app_epoch_id=new.user_id or new.user_id='00000000-0000-0000-0000-000000000000'::uuid
 or new.session_id='00000000-0000-0000-0000-000000000000'::uuid or new.app_epoch_id='00000000-0000-0000-0000-000000000000'::uuid or new.request_id='00000000-0000-0000-0000-000000000000'::uuid
 or c->>'nonce' is distinct from new.nonce
 or rtrim(translate(encode(decode(translate(new.nonce,'-_','+/')||'=','base64'),'base64'),'+/','-_'),'=')<>new.nonce
 or jsonb_typeof(c->'issuedAt') is distinct from 'number' or jsonb_typeof(c->'expiresAt') is distinct from 'number'
 or c->>'issuedAt' !~ '^[1-9][0-9]{0,15}$' or c->>'expiresAt' !~ '^[1-9][0-9]{0,15}$'
 or (c->>'issuedAt')::numeric>9007199254740991 or (c->>'expiresAt')::numeric>9007199254740991
 or to_timestamp((c->>'issuedAt')::numeric/1000)<>new.issued_at or to_timestamp((c->>'expiresAt')::numeric/1000)<>new.expires_at
 or new.issued_at>accepted_at or new.expires_at<=accepted_at or new.consumed_at is not null or new.attestation_sha256 is not null
 or encode(sha256(convert_to(maintenance_private.registration_client_data(c),'UTF8')),'hex')<>new.client_data_sha256 then raise exception 'Invalid registration challenge'; end if;
 return new;
end;$$;
create trigger attest_registration_binding before insert on maintenance_private.attest_registration_challenges for each row execute function maintenance_private.validate_attest_registration_challenge();

create function public.commit_maintenance_attested_registration(target_request uuid,target_user uuid,verified_session uuid,target_epoch uuid,target_key text,verified_client_hash text,verified_attestation_hash text,verified_public_key bytea,verified_receipt bytea) returns boolean
language plpgsql security invoker set search_path='' as $$
declare c maintenance_private.attest_registration_challenges;k maintenance_private.restore_attested_keys;accepted_at timestamptz;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if target_epoch is null or public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from target_epoch then return false; end if;
 select * into c from maintenance_private.attest_registration_challenges where request_id=target_request and user_id=target_user and session_id=verified_session and app_epoch_id=target_epoch and key_id=target_key for update;
 if not found then return false; end if;
 -- Serialize cross-account ownership for this key after the common account lock.
 -- The global key PK also refuses races with legacy privileged writers.
 perform pg_advisory_xact_lock(hashtext('ouchi.attest.key.'||target_key));
 if public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from target_epoch then return false; end if;
 accepted_at=clock_timestamp();
 if c.issued_at>accepted_at or c.expires_at<=accepted_at or verified_client_hash is distinct from c.client_data_sha256
 or verified_attestation_hash is null or verified_attestation_hash !~ '^[0-9a-f]{64}$'
 or verified_public_key is null or octet_length(verified_public_key)<>65 or get_byte(verified_public_key,0)<>4
 or encode(sha256(verified_public_key),'base64')<>target_key
 or verified_receipt is null or octet_length(verified_receipt) not between 1 and 65536 then return false; end if;
 select * into k from maintenance_private.restore_attested_keys where key_id=target_key for update;
 if c.consumed_at is not null then
  -- Exact lost-acknowledgement readback only. Never insert or reset a counter.
  return found and c.attestation_sha256=verified_attestation_hash and k.user_id=target_user and k.app_epoch_id=target_epoch
   and k.registration_session=verified_session and k.app_id=c.app_id and k.attest_environment=c.attest_environment
   and k.attestation_sha256=verified_attestation_hash and k.public_key_x962=verified_public_key and k.verified_receipt=verified_receipt;
 end if;
 if found then return false; end if;
 insert into maintenance_private.restore_attested_keys(key_id,user_id,app_epoch_id,registration_session,app_id,attest_environment,public_key_x962,attestation_sha256,verified_receipt)
 values(target_key,target_user,target_epoch,verified_session,c.app_id,c.attest_environment,verified_public_key,verified_attestation_hash,verified_receipt)
 on conflict(key_id) do nothing;
 if not found then return false; end if;
 update maintenance_private.attest_registration_challenges set consumed_at=accepted_at,attestation_sha256=verified_attestation_hash where request_id=target_request;
 return true;
end;$$;
create function public.prune_maintenance_attest_registration_challenges(batch_limit integer default 100) returns integer
language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
 if batch_limit is null or batch_limit<1 or batch_limit>500 then raise exception 'Invalid registration prune limit'; end if;
 with expired as (select request_id from maintenance_private.attest_registration_challenges where expires_at<=clock_timestamp() order by expires_at,request_id limit batch_limit for update skip locked),
 erased as (delete from maintenance_private.attest_registration_challenges c using expired e where c.request_id=e.request_id returning c.request_id)
 select count(*) into removed from erased;
 return removed;
end;$$;
revoke all on function maintenance_private.registration_client_data(jsonb),maintenance_private.validate_attest_registration_challenge(),public.commit_maintenance_attested_registration(uuid,uuid,uuid,uuid,text,text,text,bytea,bytea),public.prune_maintenance_attest_registration_challenges(integer) from public,anon,authenticated;
grant execute on function maintenance_private.registration_client_data(jsonb),public.commit_maintenance_attested_registration(uuid,uuid,uuid,uuid,text,text,text,bytea,bytea),public.prune_maintenance_attest_registration_challenges(integer) to service_role;

-- Account erasure and completion now require registration challenge absence.
create or replace function public.erase_maintenance_deletion_restore_proofs(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease)
 or not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured and records_erased and receipt_sessions_captured)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed)
 or not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled) then return false; end if;
 delete from maintenance_private.attest_registration_challenges where user_id=target_user;
 delete from maintenance_private.restore_attested_keys where user_id=target_user;
 return not exists(select 1 from maintenance_private.attest_registration_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_attested_keys where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_challenges where user_id=target_user);
end;$$;
create or replace function public.erase_maintenance_deletion_identity(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease) then return false; end if;
 -- Pin the strict policy in this transaction, not a separate API preflight.
 perform 1 from maintenance_private.enrollment_policy where id=1 and require_explicit for share;
 if not found then return false; end if;
 if public.maintenance_deletion_identity_is_erased(target_request,target_user,target_epoch,target_lease) then return true; end if;
 if not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured and records_erased and receipt_sessions_captured)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request)
 or not exists(select 1 from maintenance_private.deletion_receipt_sessions where request_id=target_request)
 or not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled) then return false; end if;
 -- Absence across all retained epochs is required, not only the current one.
 -- These are only Ouchi tables; shared Auth and unrelated public schemas remain.
 if exists(select 1 from maintenance_private.attest_registration_challenges where user_id=target_user)
 or exists(select 1 from maintenance_private.restore_attested_keys where user_id=target_user)
 or exists(select 1 from maintenance_private.restore_challenges where user_id=target_user)
 or exists(select 1 from maintenance_private.product_attachments where user_id=target_user or captured_owner_id=target_user)
 or exists(select 1 from maintenance_private.attachment_write_attempts where uploader_id=target_user or owner_id=target_user)
 or exists(select 1 from maintenance_private.reconciliation_jobs where user_id=target_user)
 or exists(select 1 from maintenance_private.native_notification_devices where user_id=target_user)
 or exists(select 1 from maintenance_private.native_delivery_identities where user_id=target_user)
 or exists(select 1 from maintenance_private.reminder_schedules where user_id=target_user)
 or exists(select 1 from maintenance_private.notification_channels where user_id=target_user)
 or exists(select 1 from maintenance_private.enrollment_consents where user_id=target_user)
 or exists(select 1 from maintenance_private.verified_notifications where user_id=target_user)
 or exists(select 1 from maintenance_private.verified_renewals where user_id=target_user)
 or exists(select 1 from maintenance_private.verified_transactions where user_id=target_user)
 or exists(select 1 from maintenance_private.transaction_ownership where user_id=target_user)
 or exists(select 1 from public.homes where owner_id=target_user)
 or exists(select 1 from public.home_members where user_id=target_user)
 or exists(select 1 from public.maintenance_push_subscriptions where user_id=target_user)
 or exists(select 1 from public.maintenance_push_test_limits where user_id=target_user)
 or exists(select 1 from public.maintenance_backup_restores where owner_id=target_user) then return false; end if;
 delete from maintenance_private.app_session_epochs where user_id=target_user;
 delete from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled;
 delete from maintenance_private.account_access where user_id=target_user and not enabled;
 update maintenance_private.account_deletion_requests set identity_erased=true where id=target_request;
 return public.maintenance_deletion_identity_is_erased(target_request,target_user,target_epoch,target_lease);
end;$$;
create or replace function public.maintenance_deletion_identity_is_erased(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease)
 and exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and identity_erased and inventory_captured and records_erased and receipt_sessions_captured)
 and exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 and not exists(select 1 from maintenance_private.attest_registration_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_attested_keys where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
create or replace function public.maintenance_deletion_completion_is_confirmed(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from maintenance_private.account_deletion_requests r
 join maintenance_private.deletion_retention_checks c on c.request_id=r.id
 where r.id=target_request and r.user_id=target_user and r.app_epoch_id=target_epoch
 and r.state='complete' and r.completion_lease=target_lease and r.receipt_expires_at>statement_timestamp()
 and r.identity_erased and r.records_erased and r.inventory_captured and r.receipt_sessions_captured
 and c.checked_at<=r.updated_at and c.confirmed_until>r.updated_at
 and r.receipt_expires_at=r.updated_at+make_interval(secs=>c.receipt_lifetime_seconds))
 and exists(select 1 from maintenance_private.enrollment_policy where id=1 and require_explicit)
 and not exists(select 1 from maintenance_private.attest_registration_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_attested_keys where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
commit;
