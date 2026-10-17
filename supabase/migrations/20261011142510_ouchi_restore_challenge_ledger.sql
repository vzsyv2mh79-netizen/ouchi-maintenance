begin;
-- No registration/restore endpoint or Apple mutation. Only a future trusted
-- certificate/receipt verifier may register a key; browser roles have no access.
create table maintenance_private.restore_attested_keys(
 key_id text primary key check(key_id ~ '^[A-Za-z0-9+/]{43}=$' and octet_length(decode(key_id,'base64'))=32 and encode(decode(key_id,'base64'),'base64')=key_id),
 user_id uuid not null references auth.users(id),app_epoch_id uuid not null,
 registration_session uuid not null,app_id text not null check(app_id ~ '^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]{1,200}$'),
 attest_environment text not null check(attest_environment in ('development','production')),
 public_key_x962 bytea not null check(octet_length(public_key_x962)=65 and get_byte(public_key_x962,0)=4),
 attestation_sha256 text not null check(attestation_sha256 ~ '^[0-9a-f]{64}$'),
 verified_receipt bytea not null check(octet_length(verified_receipt) between 1 and 65536),
 assertion_counter bigint not null default 0 check(assertion_counter between 0 and 4294967295),
 last_assertion_at timestamptz,
 unique(key_id,user_id,app_epoch_id)
);
create table maintenance_private.restore_challenges(
 request_id uuid primary key,user_id uuid not null,session_id uuid not null,app_epoch_id uuid not null,key_id text not null,
 challenge jsonb not null check(jsonb_typeof(challenge)='object'),
 nonce text not null unique check(nonce ~ '^[A-Za-z0-9_-]{43}$'),
 client_data_sha256 text not null check(client_data_sha256 ~ '^[0-9a-f]{64}$'),
 issued_at timestamptz not null,expires_at timestamptz not null check(expires_at=issued_at+interval '5 minutes'),
 consumed_at timestamptz,assertion_sha256 text check(assertion_sha256 ~ '^[0-9a-f]{64}$'),
 assertion_counter bigint check(assertion_counter between 1 and 4294967295),
 check((consumed_at is null and assertion_sha256 is null and assertion_counter is null) or (consumed_at is not null and assertion_sha256 is not null and assertion_counter is not null)),
 foreign key(key_id,user_id,app_epoch_id) references maintenance_private.restore_attested_keys(key_id,user_id,app_epoch_id) on delete cascade
);
create index restore_attested_keys_user on maintenance_private.restore_attested_keys(user_id);
create index restore_challenges_expiry on maintenance_private.restore_challenges(expires_at,request_id);
alter table maintenance_private.restore_attested_keys enable row level security;
alter table maintenance_private.restore_challenges enable row level security;
revoke all on maintenance_private.restore_attested_keys,maintenance_private.restore_challenges from public,anon,authenticated;
grant select,insert,delete on maintenance_private.restore_attested_keys,maintenance_private.restore_challenges to service_role;
grant update(assertion_counter,last_assertion_at) on maintenance_private.restore_attested_keys to service_role;
grant update(consumed_at,assertion_sha256,assertion_counter) on maintenance_private.restore_challenges to service_role;

create function maintenance_private.validate_restore_registration() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(new.user_id::text));
 if public.read_maintenance_explicit_enrollment(new.user_id,new.registration_session) is distinct from new.app_epoch_id
 or new.assertion_counter<>0 or new.last_assertion_at is not null then raise exception 'Live restore enrollment required'; end if;
 return new;
end;$$;
create trigger restore_key_registration before insert on maintenance_private.restore_attested_keys for each row execute function maintenance_private.validate_restore_registration();

create function maintenance_private.validate_restore_challenge() returns trigger
language plpgsql security invoker set search_path='' as $$
declare k maintenance_private.restore_attested_keys;c jsonb;field_name text;
begin
 perform pg_advisory_xact_lock(hashtext(new.user_id::text));
 if public.read_maintenance_explicit_enrollment(new.user_id,new.session_id) is distinct from new.app_epoch_id then raise exception 'Live restore enrollment required'; end if;
 select * into k from maintenance_private.restore_attested_keys where key_id=new.key_id and user_id=new.user_id and app_epoch_id=new.app_epoch_id for update;
 if not found then raise exception 'Registered restore key required'; end if;
 c=new.challenge;
 for field_name in select unnest(array['userID','sessionID','epochID','requestID','keyID','appID','attestEnvironment','purchaseEnvironment','proofSHA256','purpose','nonce']) loop
  if jsonb_typeof(c->field_name) is distinct from 'string' then raise exception 'Invalid restore challenge'; end if;
 end loop;
 if (select count(*) from jsonb_object_keys(c))<>14
 or c->'version' is distinct from '1'::jsonb or c->>'purpose' is distinct from 'restore_ouchi_subscription'
 or c->>'userID' is distinct from new.user_id::text or c->>'sessionID' is distinct from new.session_id::text
 or c->>'epochID' is distinct from new.app_epoch_id::text or c->>'requestID' is distinct from new.request_id::text
 or c->>'keyID' is distinct from new.key_id or c->>'appID' is distinct from k.app_id
 or c->>'attestEnvironment' is distinct from k.attest_environment
 or c->>'purchaseEnvironment' not in ('Sandbox','Production')
 or c->>'proofSHA256' !~ '^[0-9a-f]{64}$'
 or c->>'nonce' is distinct from new.nonce
 or rtrim(translate(encode(decode(translate(new.nonce,'-_','+/')||'=','base64'),'base64'),'+/','-_'),'=')<>new.nonce
 or jsonb_typeof(c->'issuedAt') is distinct from 'number' or jsonb_typeof(c->'expiresAt') is distinct from 'number'
 or c->>'issuedAt' !~ '^[1-9][0-9]{0,15}$' or c->>'expiresAt' !~ '^[1-9][0-9]{0,15}$'
 or to_timestamp((c->>'issuedAt')::numeric/1000)<>new.issued_at or to_timestamp((c->>'expiresAt')::numeric/1000)<>new.expires_at
 or new.issued_at>clock_timestamp() or new.expires_at<=clock_timestamp()
 or new.consumed_at is not null or new.assertion_sha256 is not null or new.assertion_counter is not null then raise exception 'Invalid restore challenge'; end if;
 return new;
end;$$;
create trigger restore_challenge_binding before insert on maintenance_private.restore_challenges for each row execute function maintenance_private.validate_restore_challenge();

-- Caller must have already verified the actual signature using this stored key
-- and canonical stored challenge. CAS is a separate mandatory gate, not proof.
create function public.consume_maintenance_restore_challenge(target_request uuid,target_user uuid,verified_session uuid,target_epoch uuid,target_key text,expected_counter bigint,verified_counter bigint,verified_client_hash text,verified_assertion_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare k maintenance_private.restore_attested_keys;c maintenance_private.restore_challenges;accepted_at timestamptz;
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 if public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from target_epoch or target_epoch is null then return false; end if;
 select * into k from maintenance_private.restore_attested_keys where key_id=target_key and user_id=target_user and app_epoch_id=target_epoch for update;
 if not found or expected_counter is null or k.assertion_counter<>expected_counter or verified_counter is null or verified_counter<=expected_counter or verified_counter>4294967295 then return false; end if;
 select * into c from maintenance_private.restore_challenges where request_id=target_request and user_id=target_user and session_id=verified_session and app_epoch_id=target_epoch and key_id=target_key for update;
 if not found then return false; end if;
 -- Recheck the wall clock after lock waits, not the statement-start clock.
 accepted_at=clock_timestamp();
 if c.consumed_at is not null or c.expires_at<=accepted_at or c.issued_at>accepted_at
 or verified_client_hash is distinct from c.client_data_sha256 or verified_assertion_hash is null or verified_assertion_hash !~ '^[0-9a-f]{64}$' then return false; end if;
 update maintenance_private.restore_attested_keys set assertion_counter=verified_counter,last_assertion_at=accepted_at where key_id=target_key;
 update maintenance_private.restore_challenges set consumed_at=accepted_at,assertion_sha256=verified_assertion_hash,assertion_counter=verified_counter where request_id=target_request;
 return true;
end;$$;
create function public.erase_maintenance_deletion_restore_proofs(target_request uuid,target_user uuid,target_epoch uuid,target_lease uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.account_deletion_requests where id=target_request for update;
 if not public.maintenance_deletion_lease_is_current(target_request,target_user,target_epoch,target_lease)
 or not exists(select 1 from maintenance_private.account_deletion_requests where id=target_request and inventory_captured and records_erased and receipt_sessions_captured)
 or exists(select 1 from maintenance_private.account_deletion_objects where request_id=target_request and not absence_confirmed)
 or not exists(select 1 from maintenance_private.account_access where user_id=target_user and not enabled)
 or not exists(select 1 from maintenance_private.app_epochs where user_id=target_user and epoch_id=target_epoch and not enabled) then return false; end if;
 delete from maintenance_private.restore_attested_keys where user_id=target_user;
 return not exists(select 1 from maintenance_private.restore_attested_keys where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_challenges where user_id=target_user);
end;$$;
revoke all on function maintenance_private.validate_restore_registration(),maintenance_private.validate_restore_challenge(),public.consume_maintenance_restore_challenge(uuid,uuid,uuid,uuid,text,bigint,bigint,text,text),public.erase_maintenance_deletion_restore_proofs(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.consume_maintenance_restore_challenge(uuid,uuid,uuid,uuid,text,bigint,bigint,text,text),public.erase_maintenance_deletion_restore_proofs(uuid,uuid,uuid,uuid) to service_role;
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
 if exists(select 1 from maintenance_private.restore_attested_keys where user_id=target_user)
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
 and not exists(select 1 from maintenance_private.restore_attested_keys where user_id=target_user)
 and not exists(select 1 from maintenance_private.restore_challenges where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_session_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.app_epochs where user_id=target_user)
 and not exists(select 1 from maintenance_private.account_access where user_id=target_user);
$$;
revoke all on function public.maintenance_deletion_identity_is_erased(uuid,uuid,uuid,uuid),public.maintenance_deletion_completion_is_confirmed(uuid,uuid,uuid,uuid),public.erase_maintenance_deletion_identity(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.maintenance_deletion_identity_is_erased(uuid,uuid,uuid,uuid),public.maintenance_deletion_completion_is_confirmed(uuid,uuid,uuid,uuid),public.erase_maintenance_deletion_identity(uuid,uuid,uuid,uuid) to service_role;
create function public.prune_maintenance_restore_challenges(batch_limit integer default 100) returns integer
language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
 if batch_limit is null or batch_limit<1 or batch_limit>500 then raise exception 'Invalid restore prune limit'; end if;
 with expired as (select request_id from maintenance_private.restore_challenges where expires_at<=clock_timestamp() order by expires_at,request_id limit batch_limit for update skip locked),
 erased as (delete from maintenance_private.restore_challenges c using expired e where c.request_id=e.request_id returning c.request_id)
 select count(*) into removed from erased;
 return removed;
end;$$;
revoke all on function public.prune_maintenance_restore_challenges(integer) from public,anon,authenticated;
grant execute on function public.prune_maintenance_restore_challenges(integer) to service_role;
commit;
