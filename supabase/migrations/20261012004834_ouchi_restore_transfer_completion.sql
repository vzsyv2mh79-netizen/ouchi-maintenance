begin;
-- Prepared and disabled by the existing operator policy. Trusted caller must
-- verify a fresh Apple current-status JWS; this RPC never verifies a hash/JWS.
alter table maintenance_private.restore_transfer_jobs
 drop constraint restore_transfer_jobs_phase_check,
 drop constraint restore_transfer_jobs_check2,
 add column completed_at timestamptz,
 add column completed_transaction_id text,
 add column completion_proof_sha256 text,
 add constraint restore_transfer_phase check(phase in ('authorized','update_started','completed')),
 add constraint restore_transfer_lifecycle check(
  (phase='authorized' and mutation_started_at is null and completed_at is null and completed_transaction_id is null and completion_proof_sha256 is null)
  or (phase='update_started' and mutation_started_at is not null and mutation_started_at>=authorized_at and completed_at is null and completed_transaction_id is null and completion_proof_sha256 is null)
  or (phase='completed' and completed_at is not null and completed_at>=authorized_at
   and (mutation_started_at is null or mutation_started_at between authorized_at and completed_at)
   and completed_transaction_id ~ '^[1-9][0-9]{0,127}$'
   and completion_proof_sha256 ~ '^[0-9a-f]{64}$'
   and completed_transaction_id is not null and completion_proof_sha256 is not null));
grant update(completed_at,completed_transaction_id,completion_proof_sha256) on maintenance_private.restore_transfer_jobs to service_role;

create function public.complete_maintenance_restore_transfer(
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
 result:=public.apply_maintenance_verified_transaction(payload,proof_sha256);
 if result not in ('inserted','updated') then raise exception 'Restore ledger did not persist'; end if;
 -- An error here rolls back the ownership row and verified transaction as well.
 update maintenance_private.restore_transfer_jobs set phase='completed',completed_at=clock_timestamp(),
 completed_transaction_id=payload->>'transactionId',completion_proof_sha256=complete_maintenance_restore_transfer.proof_sha256
 where id=target_request;
 return true;
end;$$;
revoke all on function public.complete_maintenance_restore_transfer(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.complete_maintenance_restore_transfer(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text) to service_role;
commit;
