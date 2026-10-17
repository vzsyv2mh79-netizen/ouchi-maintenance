begin;
-- Prepared, policy remains disabled. Shared insert guard covers ordinary
-- transaction writers, notifications/reconciliation using them, and completion.
alter table maintenance_private.restore_transfer_jobs drop constraint restore_transfer_phase,
 drop constraint restore_transfer_lifecycle,
 add constraint restore_transfer_phase check(phase in ('authorized','update_started','committing','completed')),
 add constraint restore_transfer_lifecycle check(
 (phase='authorized' and mutation_started_at is null and completed_at is null and completed_transaction_id is null and completion_proof_sha256 is null)
 or (phase='update_started' and mutation_started_at is not null and mutation_started_at>=authorized_at and completed_at is null and completed_transaction_id is null and completion_proof_sha256 is null)
 or (phase='committing' and completed_at is null and completed_transaction_id is null and completion_proof_sha256 is null
  and (mutation_started_at is null or mutation_started_at>=authorized_at))
 or (phase='completed' and completed_at is not null and completed_at>=authorized_at
  and (mutation_started_at is null or mutation_started_at between authorized_at and completed_at)
  and completed_transaction_id is not null and completed_transaction_id ~ '^[1-9][0-9]{0,127}$'
  and completion_proof_sha256 is not null and completion_proof_sha256 ~ '^[0-9a-f]{64}$'));
-- Ownership has no legitimate in-place reassignment. Final deletion uses DELETE.
revoke update on maintenance_private.transaction_ownership from service_role;
-- PostgreSQL row locks require UPDATE on one column. Allow only environment,
-- with an immutable-identity trigger; the value cannot actually change.
grant update(environment) on maintenance_private.transaction_ownership to service_role;
create function maintenance_private.guard_immutable_purchase_owner() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.environment is distinct from old.environment or new.original_transaction_id is distinct from old.original_transaction_id
 or new.user_id is distinct from old.user_id or new.app_epoch_id is distinct from old.app_epoch_id then
  raise exception 'Immutable purchase ownership';
 end if;
 return new;
end;$$;
revoke all on function maintenance_private.guard_immutable_purchase_owner() from public,anon,authenticated;
create trigger immutable_purchase_owner before update on maintenance_private.transaction_ownership
 for each row execute function maintenance_private.guard_immutable_purchase_owner();
create function maintenance_private.guard_restore_ownership_insert() returns trigger
language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.restore_transfer_jobs;
begin
 -- Account -> original advisory -> ownership row is the shared ordering.
 perform pg_advisory_xact_lock(hashtext(new.user_id::text));
 perform pg_advisory_xact_lock(hashtext(new.environment||':restore:'||new.original_transaction_id));
 select * into j from maintenance_private.restore_transfer_jobs
 where environment=new.environment and original_transaction_id=new.original_transaction_id;
 if not found then return new; end if;
 if j.user_id=new.user_id and j.app_epoch_id=new.app_epoch_id then
  -- Committing exists only inside the atomic completion transaction. An error
  -- rolls it back to authorized/unknown, together with ledger changes.
  if j.phase='committing' and public.read_maintenance_explicit_enrollment(j.user_id,j.session_id)=j.app_epoch_id then return new; end if;
  -- Existing same-owner duplicates continue through ON CONFLICT and the ledger's
  -- immutable checks. Never recreate a deleted owner using a completed receipt.
  if j.phase='completed' and exists(select 1 from maintenance_private.transaction_ownership o
   where o.environment=new.environment and o.original_transaction_id=new.original_transaction_id
    and o.user_id=new.user_id and o.app_epoch_id=new.app_epoch_id) then return new; end if;
 end if;
 raise exception 'Purchase reserved for verified restore';
end;$$;
revoke all on function maintenance_private.guard_restore_ownership_insert() from public,anon,authenticated;
create trigger restore_ownership_insert before insert on maintenance_private.transaction_ownership
 for each row execute function maintenance_private.guard_restore_ownership_insert();

create or replace function public.complete_maintenance_restore_transfer(
 target_request uuid,target_lease uuid,target_user uuid,verified_session uuid,target_epoch uuid,
 store_app_tx text,verified_bundle text,payload jsonb,proof_sha256 text)
 returns boolean language plpgsql security invoker set search_path='' as $$
declare j maintenance_private.restore_transfer_jobs; result text; now_ms bigint; signed bigint; purchased bigint; expiry bigint;
begin
 if target_request is null or target_lease is null or target_user is null or verified_session is null or target_epoch is null then return false; end if;
 perform pg_advisory_xact_lock(hashtext(target_user::text));
 perform 1 from maintenance_private.restore_transfer_policy where id=1 and enabled for share;
 if not found or public.read_maintenance_explicit_enrollment(target_user,verified_session) is distinct from target_epoch then return false; end if;
 -- Find only this account's job before acquiring its original-purchase lock.
 select * into j from maintenance_private.restore_transfer_jobs where id=target_request and user_id=target_user;
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtext(j.environment||':restore:'||j.original_transaction_id));
 select * into j from maintenance_private.restore_transfer_jobs where id=target_request and user_id=target_user for update;
 if not found or j.lease_token is distinct from target_lease or j.session_id is distinct from verified_session
 or j.app_epoch_id is distinct from target_epoch or j.environment<>'Sandbox'
 or j.app_transaction_id is distinct from store_app_tx or j.bundle_id is distinct from verified_bundle
 or jsonb_typeof(payload) is distinct from 'object' or proof_sha256 is null or proof_sha256 !~ '^[0-9a-f]{64}$'
 or payload->>'environment' is distinct from j.environment
 or payload->>'originalTransactionId' is distinct from j.original_transaction_id
 or payload->>'accountToken' is distinct from target_epoch::text
 or payload->>'transactionId' is null or payload->>'transactionId' !~ '^[1-9][0-9]{0,127}$'
 or payload->>'productId' is null or payload->>'productId' not in ('ouchi.premium.monthly','ouchi.premium.annual')
 or payload->'revokedAt' is not null or coalesce(payload->>'isUpgraded','false')<>'false'
 then return false; end if;
 -- Validate before casts; malformed verified adapter output never becomes rights.
 if coalesce(payload->>'signedAt','') !~ '^[1-9][0-9]{0,15}$'
 or coalesce(payload->>'purchasedAt','') !~ '^[1-9][0-9]{0,15}$'
 or coalesce(payload->>'expiresAt','') !~ '^[1-9][0-9]{0,15}$' then return false; end if;
 signed:=(payload->>'signedAt')::bigint;purchased:=(payload->>'purchasedAt')::bigint;expiry:=(payload->>'expiresAt')::bigint;
 now_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 if signed<floor(extract(epoch from j.authorized_at)*1000)::bigint or signed>now_ms+60000
 or purchased>now_ms or expiry<=now_ms or expiry<=purchased
 or greatest(signed,purchased,expiry)>9007199254740991 then return false; end if;
 if j.phase='completed' then
  -- Lost completion response: prove the exact durable receipt and current owner.
  -- Different/newer transactions are ingested through the normal ledger path.
  return j.completed_transaction_id=payload->>'transactionId' and j.completion_proof_sha256=complete_maintenance_restore_transfer.proof_sha256
   and exists(select 1 from maintenance_private.transaction_ownership o where o.environment=j.environment
    and o.original_transaction_id=j.original_transaction_id and o.user_id=target_user and o.app_epoch_id=target_epoch)
   and exists(select 1 from maintenance_private.verified_transactions t where t.environment=j.environment
    and t.transaction_id=j.completed_transaction_id and t.user_id=target_user and t.app_epoch_id=target_epoch
    and t.original_transaction_id=j.original_transaction_id and t.signed_at>=signed
    and t.revoked_at is null and not t.is_upgraded and t.expires_at>now_ms);
 end if;
 if exists(select 1 from maintenance_private.transaction_ownership o where o.environment=j.environment
  and o.original_transaction_id=j.original_transaction_id) then return false; end if;
 update maintenance_private.restore_transfer_jobs set phase='committing' where id=target_request;
 result:=public.apply_maintenance_verified_transaction(payload,proof_sha256);
 if result not in ('inserted','updated') then raise exception 'Restore ledger did not persist'; end if;
 -- An error here rolls back the ownership row and verified transaction as well.
 update maintenance_private.restore_transfer_jobs set phase='completed',completed_at=clock_timestamp(),
 completed_transaction_id=payload->>'transactionId',completion_proof_sha256=complete_maintenance_restore_transfer.proof_sha256
 where id=target_request;
 return true;
end;$$;
commit;
